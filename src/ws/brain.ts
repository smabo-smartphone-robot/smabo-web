import type { ConnStatus, RosbridgeMsg } from './types';

type MsgHandler = (msg: RosbridgeMsg) => void;
type StatusHandler = (s: ConnStatus) => void;

const RECONNECT_DELAY_MS = 3000;

class BrainClient {
  private ws: WebSocket | null = null;
  private msgHandlers = new Set<MsgHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private _status: ConnStatus = 'disconnected';
  private _host = '';
  private _shouldReconnect = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  get isConnected(): boolean {
    return this._status === 'connected';
  }

  connect(host: string): void {
    // 同一ホストへの接続試行中・接続済みなら無視（StrictMode の二重呼び出し対策も兼ねる）
    if (this._shouldReconnect && this._host === host) return;
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
    this._host = host;
    this._shouldReconnect = true;
    this._doConnect();
  }

  private _doConnect(): void {
    this._setStatus('connecting');
    const url = `ws://${this._host}/ui`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this._setStatus('error');
      this._scheduleReconnect();
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
      this._scheduleReconnect();
    };
  }

  private _scheduleReconnect(): void {
    if (!this._shouldReconnect) return;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      if (this._shouldReconnect) this._doConnect();
    }, RECONNECT_DELAY_MS);
  }

  disconnect(): void {
    this._shouldReconnect = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
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
