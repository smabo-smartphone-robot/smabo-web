import type { ConnStatus, RosbridgeMsg } from './types';

type MsgHandler = (msg: RosbridgeMsg) => void;
type StatusHandler = (s: ConnStatus) => void;

class BrainClient {
  private ws: WebSocket | null = null;
  private msgHandlers = new Set<MsgHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private _status: ConnStatus = 'disconnected';

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
