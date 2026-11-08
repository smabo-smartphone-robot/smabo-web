import type { ConnStatus, RosbridgeMsg } from './types';
import { PROTOCOL_VERSION, WEB_VERSION } from '../version';
import { PUBLISH, SUBSCRIBE } from './protocol.gen';

type MsgHandler = (msg: RosbridgeMsg) => void;
type StatusHandler = (s: ConnStatus) => void;

const RECONNECT_DELAY_MS = 3000;

// smabo-brain and smabo-brain-ros (rosbridge_suite) both serve ws://host/ and
// take the same handshake: advertise what we publish, subscribe to what we
// read, then publish with the '/web' source prefix. So the web needs no
// setting for which brain is running. The tables are generated from
// smabo-protocol (protocol.gen.ts).
const ROSBRIDGE_PUBLISH = PUBLISH;
const ROSBRIDGE_SUBSCRIBE = SUBSCRIBE;

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
    const url = `ws://${this._host}/`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this._setStatus('error');
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this._handshake();
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
      this.ws = null;
      if (this._status !== 'error') {
        this._setStatus('disconnected');
      }
      this._scheduleReconnect();
    };
  }

  /** Announce what we publish, subscribe to what we read, then say which
   *  protocol we speak (the brain answers on /brain/info). */
  private _handshake(): void {
    for (const [topic, type] of Object.entries(ROSBRIDGE_PUBLISH)) {
      this.send({ op: 'advertise', topic: `/web${topic}`, type });
    }
    for (const [topic, type] of Object.entries(ROSBRIDGE_SUBSCRIBE)) {
      this.send({ op: 'subscribe', topic, type, throttle_rate: topic === '/odom' ? 50 : 0 });
    }
    this.publish('/hello', {
      data: JSON.stringify({ protocol: PROTOCOL_VERSION, client: 'smabo-web', version: WEB_VERSION }),
    });
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
    // 正式なトピック名で宛先に配信する。
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
