import type { ConnStatus, RosbridgeMsg } from './types';
import { PROTOCOL_VERSION, WEB_VERSION } from '../version';
import { PUBLISH, SUBSCRIBE } from './protocol.gen';
import { clearToken, loadToken, saveToken } from './auth';

type MsgHandler = (msg: RosbridgeMsg) => void;
type StatusHandler = (s: ConnStatus) => void;

const RECONNECT_DELAY_MS = 3000;
// A brain without --pairing (the default) and smabo-brain-ros does not answer the token
const AUTH_REPLY_TIMEOUT_MS = 1500;

/** Who the brain says we are, after it accepted our token. */
export interface BrainAuth { role: string; name: string; id: string }
/** Why the brain refused us (shown on the pairing screen). */
export interface BrainRefusal { reason: string; message: string }

// smabo-brain and smabo-brain-ros (rosbridge_suite) both serve ws://host/ and
// take the same handshake: advertise what we publish, subscribe to what we
// read, then publish with the '/web' source prefix. So the web needs no
// setting for which brain is running. The tables are generated from
// smabo-protocol (protocol.gen.ts).
const ROSBRIDGE_PUBLISH = PUBLISH;
const ROSBRIDGE_SUBSCRIBE = SUBSCRIBE;

// Pairing (smabo-brain): the first frame is our token ({op:'auth'}, empty
// without one) or a code ({op:'pair'}); the brain answers with the same op.
// Refused → status 'unpaired' and the pairing screen, without a retry loop.

class BrainClient {
  private ws: WebSocket | null = null;
  private msgHandlers = new Set<MsgHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private _status: ConnStatus = 'disconnected';
  private _host = '';
  private _shouldReconnect = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _authTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingPair: { code: string; name: string } | null = null;
  private _ready = false;
  /** Set once the brain accepted our token; null with a brain that has no pairing. */
  auth: BrainAuth | null = null;
  refusal: BrainRefusal | null = null;

  get host(): string { return this._host; }
  /** This browser's token for the current brain (Bearer for the brain's HTTP API). */
  get token(): string | null { return this._host ? loadToken(this._host) : null; }

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

    this._ready = false;
    this.ws.onopen = () => {
      const pair = this._pendingPair;
      const token = loadToken(this._host);
      // Always ask first, even without a token: a brain with pairing refuses at
      // once (pairing screen), smabo-brain without --pairing (the default) accepts, and one that does
      // not know auth (smabo-brain-ros) says nothing until the timeout.
      if (pair) {
        this.send({ op: 'pair', code: pair.code, name: pair.name, role: 'web' });
      } else {
        this.send({ op: 'auth', token: token ?? '' });
      }
      this._authTimer = setTimeout(() => this._onReady(), AUTH_REPLY_TIMEOUT_MS);
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      let msg: RosbridgeMsg;
      try {
        msg = JSON.parse(ev.data as string) as RosbridgeMsg;
      } catch {
        return;
      }
      if (msg.op === 'auth' || msg.op === 'pair') {
        this._onAuthReply(msg as unknown as Record<string, unknown>);
        return;
      }
      this.msgHandlers.forEach(h => h(msg));
    };

    this.ws.onerror = () => {
      this._setStatus('error');
    };

    this.ws.onclose = () => {
      this.ws = null;
      this._clearAuthTimer();
      if (this._status === 'unpaired') return;   // wait for a code; no retry loop
      if (this._status !== 'error') {
        this._setStatus('disconnected');
      }
      this._scheduleReconnect();
    };
  }

  private _clearAuthTimer(): void {
    if (this._authTimer) { clearTimeout(this._authTimer); this._authTimer = null; }
  }

  /** The brain accepted us (or did not ask): handshake and show as connected. */
  private _onReady(): void {
    this._clearAuthTimer();
    if (this._ready) return;
    this._ready = true;
    this._handshake();
    this._setStatus('connected');
  }

  private _onAuthReply(m: Record<string, unknown>): void {
    this._clearAuthTimer();
    const host = this._host;
    if (m['ok'] === true) {
      if (m['op'] === 'pair' && typeof m['token'] === 'string') saveToken(host, m['token']);
      this._pendingPair = null;
      this.refusal = null;
      this.auth = { role: String(m['role'] ?? ''), name: String(m['name'] ?? ''), id: String(m['id'] ?? '') };
      this._onReady();
      return;
    }
    const reason = String(m['reason'] ?? 'unauthorized');
    if (m['op'] === 'auth' && reason === 'unauthorized') clearToken(host);   // the brain forgot us
    this._pendingPair = null;
    this.auth = null;
    this.refusal = { reason, message: String(m['message'] ?? '') };
    this._shouldReconnect = false;
    this._ready = false;
    this._setStatus('unpaired');
  }

  /** Pair with a code from the brain's log or from an already paired browser. */
  pair(host: string, code: string, name: string): void {
    this._pendingPair = { code, name };
    this.refusal = null;
    this._shouldReconnect = false;   // let connect() start afresh
    this.connect(host);
  }

  /** Forget this browser's token for the current brain (it must pair again). */
  forget(): void {
    if (this._host) clearToken(this._host);
    this.auth = null;
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
    this._clearAuthTimer();
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

  /** Take control from whoever drives (smabo-brain; see its control.py). */
  claimControl(): void {
    this.send({ op: 'control', action: 'claim' });
  }

  /** Let go of control so another tab can drive. */
  releaseControl(): void {
    this.send({ op: 'control', action: 'release' });
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
