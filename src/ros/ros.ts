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

class RosClient {
  private _ros: ROSLIB.Ros | null = null;
  private _status: ConnStatus = 'disconnected';
  private statusHandlers = new Set<StatusHandler>();

  get ros(): ROSLIB.Ros | null { return this._ros; }
  get isConnected(): boolean { return this._status === 'connected'; }
  get status(): ConnStatus { return this._status; }

  /** Connect to ws://<host> (host already includes :9090 by default). */
  connect(host: string): void {
    if (this._ros && (this._status === 'connected' || this._status === 'connecting')) {
      this.disconnect();
      return;
    }
    this._setStatus('connecting');
    const url = /^wss?:\/\//.test(host) ? host : `ws://${host}`;
    const ros = new ROSLIB.Ros({ url });
    ros.on('connection', () => {
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
      this._setStatus('connected');
    });
    ros.on('error', () => this._setStatus('error'));
    ros.on('close', () => this._setStatus('disconnected'));
    this._ros = ros;
  }

  disconnect(): void {
    try { this._ros?.close(); } catch { /* ignore */ }
    this._ros = null;
    this._setStatus('disconnected');
  }

  /** Publish once on a '/web'-prefixed topic (relay strips the prefix). */
  publishWeb(topic: string, messageType: string, msg: Record<string, unknown>): void {
    if (!this._ros) return;
    const t = new ROSLIB.Topic({ ros: this._ros, name: `/web${topic}`, messageType });
    t.publish(new ROSLIB.Message(msg));
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
