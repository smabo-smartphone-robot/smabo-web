import type { ConnStatus, RosbridgeMsg } from './types';

type MsgHandler = (msg: RosbridgeMsg) => void;
type StatusHandler = (s: ConnStatus) => void;

const RECONNECT_DELAY_MS = 3000;

// The brain is either the legacy smabo-brain relay (ws://host/ui), which
// forwards every topic to the web without being asked, or rosbridge_suite in
// smabo-brain-ros (ws://host/), where the web must advertise what it publishes
// and subscribe to what it wants. connect() tries the legacy path first and
// falls back to rosbridge, then sticks with whichever worked.
export type BrainProtocol = 'legacy' | 'rosbridge';

// Canonical topics the web publishes (sent as /web<topic>; brain-ros relays strip it).
const ROSBRIDGE_PUBLISH: Record<string, string> = {
  '/cmd_vel':          'geometry_msgs/msg/Twist',
  '/servo/command':    'trajectory_msgs/msg/JointTrajectory',
  '/speech/say':       'std_msgs/msg/String',
  '/expression':       'std_msgs/msg/Int32',
  '/look_at':          'geometry_msgs/msg/PoseStamped',
  '/ping':             'std_msgs/msg/String',
  '/vision/config':    'std_msgs/msg/String',
  '/webrtc/preview':   'std_msgs/msg/String',
  '/webrtc/web_answer': 'std_msgs/msg/String',
  '/webrtc/web_ice':   'std_msgs/msg/String',
};

// Canonical topics the legacy relay pushed to the web unasked (see useBrain).
const ROSBRIDGE_SUBSCRIBE: Record<string, string> = {
  '/odom':               'nav_msgs/msg/Odometry',
  '/pong':               'std_msgs/msg/String',
  '/speech/recognized':  'std_msgs/msg/String',
  '/imu/data':           'sensor_msgs/msg/Imu',
  '/gps/fix':            'sensor_msgs/msg/NavSatFix',
  '/vision/config':      'std_msgs/msg/String',
  '/vision/detections':  'vision_msgs/msg/Detection2DArray',
  '/vision/markers':     'std_msgs/msg/String',
  '/webrtc/web_offer':   'std_msgs/msg/String',
};

class BrainClient {
  private ws: WebSocket | null = null;
  private msgHandlers = new Set<MsgHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private _status: ConnStatus = 'disconnected';
  private _host = '';
  private _shouldReconnect = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _protocol: BrainProtocol = 'legacy';

  /** Protocol of the current (or last) connection. */
  get protocol(): BrainProtocol {
    return this._protocol;
  }

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
    const protocol = this._protocol;
    const url = protocol === 'legacy' ? `ws://${this._host}/ui` : `ws://${this._host}/`;
    let opened = false;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this._setStatus('error');
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      opened = true;
      if (protocol === 'rosbridge') this._rosbridgeSetup();
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
      if (!opened) {
        // refused (e.g. rosbridge answers /ui with 404): try the other protocol
        this._protocol = protocol === 'legacy' ? 'rosbridge' : 'legacy';
        if (protocol === 'legacy' && this._shouldReconnect) {
          this._doConnect();   // fall back to rosbridge right away
          return;
        }
      }
      if (this._status !== 'error') {
        this._setStatus('disconnected');
      }
      this._scheduleReconnect();
    };
  }

  /** rosbridge: announce what we publish and ask for what the legacy relay pushed. */
  private _rosbridgeSetup(): void {
    for (const [topic, type] of Object.entries(ROSBRIDGE_PUBLISH)) {
      this.send({ op: 'advertise', topic: `/web${topic}`, type });
    }
    for (const [topic, type] of Object.entries(ROSBRIDGE_SUBSCRIBE)) {
      this.send({ op: 'subscribe', topic, type, throttle_rate: topic === '/odom' ? 50 : 0 });
    }
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
