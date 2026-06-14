import type { ConnStatus, RosbridgeMsg } from './types';

type MsgHandler = (msg: RosbridgeMsg) => void;
type StatusHandler = (s: ConnStatus) => void;

interface Pending {
  resolve: (values: unknown) => void;
  reject: (err: Error) => void;
}

class BrainClient {
  private ws: WebSocket | null = null;
  private msgHandlers = new Set<MsgHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private _status: ConnStatus = 'disconnected';
  private pending = new Map<string, Pending>();

  get isConnected(): boolean {
    return this._status === 'connected';
  }

  connect(host: string): void {
    if (this.ws && (this._status === 'connected' || this._status === 'connecting')) {
      this.disconnect();
      return;
    }

    this._setStatus('connecting');
    const url = `ws://${host}/ui`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this._setStatus('error');
      return;
    }

    this.ws.onopen = () => {
      this._setStatus('connected');
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as RosbridgeMsg;

        // service_response はペンディングコールに振り、msgHandlers には渡さない
        if (msg.op === 'service_response' && msg.id) {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.result) {
              p.resolve(msg.values);
            } else {
              p.reject(new Error('service call failed'));
            }
            return;
          }
        }

        this.msgHandlers.forEach(h => h(msg));
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onerror = () => {
      this._setStatus('error');
    };

    this.ws.onclose = () => {
      if (this._status !== 'error') {
        this._setStatus('disconnected');
      }
      this.ws = null;
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this._setStatus('disconnected');
  }

  send(obj: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  publish(topic: string, msg: unknown): void {
    // 送信元を示す '/web' prefix を付ける。brain が剥がしてから
    // canonical なトピック名で宛先デバイスに再配信する。
    this.send({ op: 'publish', topic: `/web${topic}`, msg });
  }

  /** rosbridge call_service 互換のリクエスト/レスポンス呼び出し */
  callService<T = unknown>(service: string, args: unknown = {}, timeoutMs = 5000): Promise<T> {
    const id = Math.random().toString(36).slice(2, 10);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`service timeout: ${service}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v as T); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });

      this.send({ op: 'call_service', id, service, args });
    });
  }

  onMsg(handler: MsgHandler): () => void {
    this.msgHandlers.add(handler);
    return () => this.msgHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private _setStatus(s: ConnStatus): void {
    this._status = s;
    this.statusHandlers.forEach(h => h(s));
  }
}

export const brain = new BrainClient();
