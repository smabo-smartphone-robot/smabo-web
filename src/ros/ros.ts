// roslibjs connection to rosbridge_suite (smabo-brain-ros) for the ROS-native
// features: Nav2 (initialpose / navigate_to_pose / map / scan / plan) and
// MoveIt2 (joint states / move_action). These only exist with smabo-brain-ros.
// The other panels use ws/brain.ts, which works with either brain; both
// connect to the same endpoint (default :9090).
//
// Web publishes with the '/web' source prefix (e.g. /web/initialpose) — the
// smabo-brain-ros relay nodes strip it to the canonical topic. Subscriptions
// use canonical names directly. Actions are sent to canonical action servers.
import * as ROSLIB from 'roslib';
import type { ConnStatus } from '../ws/types';

type StatusHandler = (s: ConnStatus) => void;

// Once a Start button has connected (open), the page connects again after a reload
// (a connection the server dropped stays remembered too) until disconnect().
const KEEP_KEY = 'smabo-ros-connected';

function keep(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEEP_KEY, '1');
    else localStorage.removeItem(KEEP_KEY);
  } catch { /* no storage: nothing to remember */ }
}

// Command topics advertised as soon as a connection is up. rosbridge makes a ROS
// publisher on advertise, and smabo-brain-ros's relay (topic_tools, which looks for
// new publishers every 100 ms) loses a message sent right after that: a Start sent
// the moment a fresh connection is ready never reached mode_manager. Advertised at
// connect, the publisher is matched by the time a command goes out.
export const COMMAND_TOPICS: [string, string][] = [
  ['/mode/command', 'std_msgs/msg/String'],
  ['/nav/command', 'std_msgs/String'],
];
/** how long after connecting a command is sure to pass the relay (see above) */
export const SETTLE_MS = 1000;

function wsUrl(host: string): string {
  return /^wss?:\/\//.test(host) ? host : `ws://${host}`;
}

function kept(): boolean {
  try { return localStorage.getItem(KEEP_KEY) === '1'; } catch { return false; }
}

class RosClient {
  private _ros: ROSLIB.Ros | null = null;
  private _status: ConnStatus = 'disconnected';
  private statusHandlers = new Set<StatusHandler>();
  private _topics = new Map<string, ROSLIB.Topic>();   // '/web…' topics of this connection
  private _connectedAt = 0;
  private _url = '';                                    // the current connection's ws:// URL

  get ros(): ROSLIB.Ros | null { return this._ros; }
  get isConnected(): boolean { return this._status === 'connected'; }
  get status(): ConnStatus { return this._status; }
  /** ms since this connection came up (0 when not connected) */
  get connectedFor(): number { return this._status === 'connected' ? Date.now() - this._connectedAt : 0; }

  /** Connect to ws://<host> (host already includes :9090 by default) unless
   *  already connected or connecting — what a Start button does first. */
  open(host: string): void {
    // the same host already connected or connecting: nothing to do (another host: switch over)
    if (this._ros && this._url === wsUrl(host) && (this._status === 'connected' || this._status === 'connecting')) return;
    keep(true);
    this._open(host);
  }

  /** On page load: connect again when ROS was connected before the reload. */
  restore(host: string): void {
    if (kept() && !this._ros) this._open(host);
  }

  private _open(host: string): void {
    try { this._ros?.close(); } catch { /* ignore */ }   // a connection left in 'error'
    this._setStatus('connecting');
    const url = wsUrl(host);
    this._url = url;
    const ros = new ROSLIB.Ros({ url });
    // A closed connection's events arrive later (its 'close' can come after the next
    // connection is up); only the current connection may change the status.
    const current = () => this._ros === ros;
    ros.on('connection', () => {
      if (!current()) return;
      // roslib 1.4 does not dispatch rosbridge's action ops; route them by goal id
      // so sendActionGoal() gets its feedback / result.
      const sock = (ros as unknown as { socket?: WebSocket }).socket;
      sock?.addEventListener('message', (ev: MessageEvent) => {
        if (typeof ev.data !== 'string' || !ev.data.includes('"action_')) return;
        try {
          const m = JSON.parse(ev.data);
          if ((m?.op === 'action_result' || m?.op === 'action_feedback') && m.id) ros.emit(m.id, m);
        } catch { /* ignore */ }
      });
      this._topics.clear();
      for (const [topic, type] of COMMAND_TOPICS) this._webTopic(topic, type).advertise();
      this._connectedAt = Date.now();
      this._setStatus('connected');
    });
    ros.on('error', () => { if (current()) this._setStatus('error'); });
    ros.on('close', () => {
      if (!current()) return;
      this._ros = null;
      // a connection that failed stays 'error' (brain-ros not reachable) until the next try
      if (this._status !== 'error') this._setStatus('disconnected');
    });
    this._ros = ros;
  }

  disconnect(): void {
    keep(false);
    try { this._ros?.close(); } catch { /* ignore */ }
    this._ros = null;
    this._setStatus('disconnected');
  }

  /** Publish once on a '/web'-prefixed topic (relay strips the prefix). */
  publishWeb(topic: string, messageType: string, msg: Record<string, unknown>): void {
    if (!this._ros) return;
    this._webTopic(topic, messageType).publish(new ROSLIB.Message(msg));
  }

  /** one Topic per '/web' topic and connection: advertised once, then reused */
  private _webTopic(topic: string, messageType: string): ROSLIB.Topic {
    const name = `/web${topic}`;
    let t = this._topics.get(name);
    if (!t) {
      t = new ROSLIB.Topic({ ros: this._ros!, name, messageType });
      this._topics.set(name, t);
    }
    return t;
  }

  /** Subscribe to a canonical topic; returns an unsubscribe function. */
  subscribe<T>(topic: string, messageType: string, cb: (msg: T) => void): () => void {
    if (!this._ros) return () => {};
    const t = new ROSLIB.Topic({ ros: this._ros, name: topic, messageType });
    t.subscribe(cb as (m: ROSLIB.Message) => void);
    return () => t.unsubscribe();
  }

  /** Call a ROS service over rosbridge; resolves with the response values. */
  callService<T>(name: string, serviceType: string, req: Record<string, unknown>, timeoutMs = 10000): Promise<T> {
    const ros = this._ros;
    if (!ros) return Promise.reject(new Error('ROS not connected'));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${name}: timeout`)), timeoutMs);
      const srv = new ROSLIB.Service({ ros, name, serviceType });
      srv.callService(
        new ROSLIB.ServiceRequest(req),
        (res: unknown) => { clearTimeout(timer); resolve(res as T); },
        (err: unknown) => { clearTimeout(timer); reject(new Error(`${name}: ${String(err)}`)); },
      );
    });
  }

  /**
   * Send a ROS 2 action goal via rosbridge's `send_action_goal` op and stream
   * feedback/result. Returns a cancel function. Typed loosely because action
   * support varies across roslib/rosbridge versions (see README caveat).
   */
  sendActionGoal(
    action: string,
    actionType: string,
    args: Record<string, unknown>,
    handlers: {
      onFeedback?: (values: unknown) => void;
      onResult?: (values: unknown, status?: unknown) => void;
      onError?: (message: string) => void;   // rosbridge rejected the goal (e.g. no action support)
    } = {},
  ): () => void {
    const ros = this._ros as unknown as {
      callOnConnection: (m: unknown) => void;
      on: (id: string, cb: (m: any) => void) => void;
      off?: (id: string, cb: (m: any) => void) => void;
    } | null;
    if (!ros) return () => {};

    const id = `goal_${action.replace(/\W/g, '_')}_${Date.now()}`;
    const onMsg = (msg: any) => {
      if (msg?.op === 'action_feedback') handlers.onFeedback?.(msg.values);
      else if (msg?.op === 'action_result') { handlers.onResult?.(msg.values, msg.status); ros.off?.(id, onMsg); }
    };
    const onStatus = (m: any) => {
      if (m?.level === 'error') { handlers.onError?.(String(m.msg ?? 'rosbridge error')); ros.off?.(id, onMsg); }
    };
    ros.on(id, onMsg);
    ros.on(`status:${id}`, onStatus);
    ros.callOnConnection({
      op: 'send_action_goal', id, action, action_type: actionType, args, feedback: true,
    });
    return () => {
      try { ros.callOnConnection({ op: 'cancel_action_goal', id, action }); } catch { /* ignore */ }
      ros.off?.(id, onMsg);
      ros.off?.(`status:${id}`, onStatus);
    };
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this._status);
    return () => this.statusHandlers.delete(handler);
  }

  private _setStatus(s: ConnStatus): void {
    this._status = s;
    this.statusHandlers.forEach(h => h(s));
  }
}

export const rosClient = new RosClient();
export { ROSLIB };
