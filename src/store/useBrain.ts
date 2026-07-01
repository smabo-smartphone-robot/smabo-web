import { create } from 'zustand';
import { brain } from '../ws/brain';
import { esp32 } from '../ws/esp32';
import * as webrtc from '../rtc/webrtc';
import type { ConnStatus, RosbridgeMsg, OdomMsg, ImuMsg, GpsMsg, StringMsg, Quat, VisionConfigMsg, Detection2DArrayMsg } from '../ws/types';

const ESP32_HOST_KEY = 'smabo-esp32-host';

function toEuler(q: Quat) {
  const { x, y, z, w } = q;
  const roll  = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)) * 180 / Math.PI;
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x)))) * 180 / Math.PI;
  const yaw   = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * 180 / Math.PI;
  return { roll, pitch, yaw };
}

function deepMerge(
  base: Record<string, unknown>,
  over: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) &&
      out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])
        ? deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>)
        : v;
  }
  return out;
}

interface LogEntry {
  id: number;
  type: 'recv' | 'sent' | 'info';
  text: string;
  topic?: string;
}

interface Toast {
  id: number;
  msg: string;
  type: '' | 'ok' | 'err';
}

interface BrainStore {
  status: ConnStatus;
  host: string;
  esp32Host: string;
  msgRate: number;

  // Drive
  odom: { vx: number; wz: number; x: number; y: number; th: number } | null;
  trail: { x: number; y: number }[];

  // Sensors
  imu: {
    roll: number; pitch: number; yaw: number;
    gx: number; gy: number; gz: number;
    ax: number; ay: number; az: number;
  } | null;
  gps: { lat: number; lon: number; alt: number; accuracy: number | null } | null;
  webrtcStream: MediaStream | null;
  previewOn: boolean;          // brain→web 映像中継を要求しているか

  // App からの文字列（/speech/recognized など、新しいものが先頭）
  recognized: { text: string; t: number }[];

  // Vision（画像処理）
  visionConfig: VisionConfigMsg | null;        // brain が配信する現在設定スナップショット
  detections: Detection2DArrayMsg | null;      // 直近の /vision/detections
  visionMarkers: { text: string; t: number } | null; // 直近の /vision/markers（AR番号/QR内容）

  // Config
  esp32Config: Record<string, unknown> | null;

  // ESP32 ↔ brain 接続状態（notice で追跡）
  // null = 未確認（brain 接続直後など）、true/false = 確認済み
  esp32Connected: boolean | null;

  // ESP32 通信確認
  esp32Ping: { ok: boolean; latencyMs: number; at: number } | null; // REST GET /config の結果（web↔ESP32）
  esp32WsPing: { ok: boolean; latencyMs: number; at: number } | null; // WS /ping→/pong エコーの往復結果（brain↔ESP32）

  // Log
  logs: LogEntry[];

  // Toasts
  toasts: Toast[];

  // Actions
  setHost(h: string): void;
  connect(): void;
  autoConnect(): void;
  setEsp32Host(h: string): void;
  refreshConfig(): void;
  pingEsp32(): void;
  pingEsp32Ws(): void;
  clearRecognized(): void;
  clearTrail(): void;
  setVisionConfig(patch: Record<string, unknown>): void;
  setPreview(on: boolean): void;
  addLog(entry: Omit<LogEntry, 'id'>): void;
  clearLogs(): void;
  addSentLog(text: string): void;
  addToast(msg: string, type?: 'ok' | 'err'): void;
  patchConfig(patch: Record<string, unknown>): void;
  removeConfig(patch: Record<string, unknown>): void;
  setServoEnabled(name: string, enabled: boolean): void;
  setMode(modes: Record<string, unknown>): void;
}

// WebRTC は store 生成時に一度だけ初期化する。
// setStreamCallback は set() への参照が必要なので create() の中で呼ぶ。

let msgCount = 0;

// High-frequency topics with large payloads are excluded from the log.
// Camera frames (~50 KB base64) would otherwise flood it and cause per-frame
// JSON.stringify + Zustand state updates re-rendering the Log tab.
const LOG_SKIP_TOPICS = new Set(['/vision/detections']);

// Pending WS ping (application-level /ping → /pong echo). Closure state so it
// survives across messages without bloating the store.
let wsPing: { token: string; sentAt: number; timer: ReturnType<typeof setTimeout> } | null = null;

// Pending esp32Connected=false update. The ESP32 ws_client.py waits 3 s before
// reconnecting, so we allow up to 6 s before marking it disconnected.
// Cancelled immediately if a "connected" notice arrives in the meantime.
const ESP32_DISCONNECT_DEBOUNCE_MS = 6000;
let esp32DisconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Pending "app disconnected" toast (minor debounce to smooth brief drops).
const APP_DISCONNECT_DEBOUNCE_MS = 3000;
let appDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

export const useBrain = create<BrainStore>((set, get) => {
  // WebRTC 初期化 — brain からの中継映像 stream を store に格納
  webrtc.init(
    (topic, msg) => {
      brain.publish(topic, msg);
      get().addSentLog(topic);
    },
    (stream) => set({ webrtcStream: stream }),
  );

  // Register handlers once at module import time
  brain.onMsg((msg: RosbridgeMsg) => {
    msgCount++;

    // Handle specific topics
    if (msg.op === 'publish' && msg.topic) {
      const topic = msg.topic;

      if (topic === '/odom') {
        const m = msg.msg as OdomMsg;
        const pos = m.pose.pose.position;
        const ori = m.pose.pose.orientation;
        const euler = toEuler(ori);
        const vx = m.twist.twist.linear.x;
        const wz = m.twist.twist.angular.z;
        const x = pos.x;
        const y = pos.y;
        const th = euler.yaw;

        set(s => {
          const newTrail = [...s.trail, { x, y }];
          const trimmed = newTrail.length > 2000 ? newTrail.slice(newTrail.length - 2000) : newTrail;
          return {
            odom: { vx, wz, x, y, th },
            trail: trimmed,
          };
        });
      } else if (topic === '/pong') {
        // ESP32 からの ping エコー。token が一致したら往復時間(RTT)を確定する。
        const m = msg.msg as StringMsg;
        if (wsPing && m?.data === wsPing.token) {
          const latencyMs = Math.round(performance.now() - wsPing.sentAt);
          clearTimeout(wsPing.timer);
          wsPing = null;
          set({ esp32WsPing: { ok: true, latencyMs, at: Date.now() } });
        }
      } else if (topic === '/speech/recognized') {
        const m = msg.msg as StringMsg;
        const text = typeof m?.data === 'string' ? m.data : '';
        if (text) {
          set(s => ({
            recognized: [{ text, t: Date.now() }, ...s.recognized].slice(0, 50),
          }));
        }
      } else if (topic === '/imu/data') {
        const m = msg.msg as ImuMsg;
        const euler = toEuler(m.orientation);
        set({
          imu: {
            roll: euler.roll,
            pitch: euler.pitch,
            yaw: euler.yaw,
            gx: m.angular_velocity.x,
            gy: m.angular_velocity.y,
            gz: m.angular_velocity.z,
            ax: m.linear_acceleration.x,
            ay: m.linear_acceleration.y,
            az: m.linear_acceleration.z,
          },
        });
      } else if (topic === '/gps/fix') {
        const m = msg.msg as GpsMsg;
        const cov0 = m.position_covariance[0];
        const accuracy = (cov0 != null && cov0 >= 0) ? Math.sqrt(cov0) : null;
        set({
          gps: {
            lat: m.latitude,
            lon: m.longitude,
            alt: m.altitude,
            accuracy,
          },
        });
      } else if (topic === '/vision/config') {
        // brain が保持する画像処理設定のスナップショット（起動時初期値 or 直近の上書き）。
        // data は JSON 文字列（std_msgs/String）。
        const m = msg.msg as StringMsg;
        try {
          const cfg = JSON.parse(m.data) as VisionConfigMsg;
          set({ visionConfig: cfg });
        } catch {
          // ignore malformed config
        }
      } else if (topic === '/vision/detections') {
        set({ detections: msg.msg as Detection2DArrayMsg });
      } else if (topic === '/vision/markers') {
        const m = msg.msg as StringMsg;
        const text = typeof m?.data === 'string' ? m.data : '';
        if (text) set({ visionMarkers: { text, t: Date.now() } });
      } else if (topic === '/webrtc/web_offer') {
        // brain が中継映像を offer してきた → answer を返す
        const m = msg.msg as StringMsg;
        if (m?.data) webrtc.handleBrainOffer(m.data);
      }
    }

    // Connection notices from brain (app / esp32 connect・disconnect)
    if (msg.op === 'notice') {
      const n = msg as unknown as Record<string, unknown>;
      if (n['source'] && n['event']) {
        const source = n['source'] as string;
        const ev     = n['event'] === 'connected' ? 'connected' : 'disconnected';

        if (source === 'esp32') {
          // ESP32 state is tracked in the store (not via toasts) so the Arm tab
          // can show a persistent indicator without spurious flashes on reconnect.
          if (ev === 'disconnected') {
            esp32DisconnectTimer = setTimeout(() => {
              esp32DisconnectTimer = null;
              set({ esp32Connected: false });
            }, ESP32_DISCONNECT_DEBOUNCE_MS);
          } else {
            if (esp32DisconnectTimer !== null) {
              clearTimeout(esp32DisconnectTimer);
              esp32DisconnectTimer = null;
            }
            const was = get().esp32Connected;
            set({ esp32Connected: true });
            // Toast when state changes: null (unknown) or false → true.
            // Skipped only when already confirmed connected (was === true),
            // which avoids duplicate toasts if the brain sends multiple notices.
            if (was !== true) {
              get().addToast('smabo-esp32 connected', 'ok');
            }
          }
        } else {
          // app (and any future sources): simple debounced toast
          const label = 'smabo-app';
          if (ev === 'disconnected') {
            appDisconnectTimer = setTimeout(() => {
              appDisconnectTimer = null;
              get().addToast(`${label} disconnected`);
            }, APP_DISCONNECT_DEBOUNCE_MS);
          } else {
            if (appDisconnectTimer !== null) {
              clearTimeout(appDisconnectTimer);
              appDisconnectTimer = null;
            }
            get().addToast(`${label} connected`, 'ok');
          }
        }
      } else if (typeof n['message'] === 'string') {
        get().addToast(n['message'] as string);
      }
      return;
    }

    // Add to log (skip high-frequency / large topics to avoid render overhead)
    if (!msg.topic || !LOG_SKIP_TOPICS.has(msg.topic)) {
      get().addLog({
        type: 'recv',
        text: JSON.stringify(msg),
        topic: msg.topic,
      });
    }
  });

  let wasConnected = false;
  brain.onStatus((s: ConnStatus) => {
    set({ status: s });
    if (s === 'connected') {
      wasConnected = true;
      get().addLog({ type: 'info', text: 'Brain connected' });
      get().addToast('Brain connected', 'ok');
    } else if (s === 'disconnected') {
      get().addLog({ type: 'info', text: 'Brain disconnected' });
      if (wasConnected) get().addToast('Brain disconnected');
      wasConnected = false;
      // Brain が切れたら ESP32 状態も不明に戻す。再接続時にスナップショットで確定する。
      if (esp32DisconnectTimer !== null) {
        clearTimeout(esp32DisconnectTimer);
        esp32DisconnectTimer = null;
      }
      set({ previewOn: false, webrtcStream: null, esp32Connected: null });
    } else if (s === 'error') {
      if (wasConnected) get().addToast('Connection error', 'err');
    }
  });

  // 1-second interval to update msgRate
  setInterval(() => {
    set({ msgRate: msgCount });
    msgCount = 0;
  }, 1000);

  const initialEsp32Host =
    (typeof localStorage !== 'undefined' && localStorage.getItem(ESP32_HOST_KEY)) || 'smabo-esp32.local';
  esp32.setHost(initialEsp32Host);

  return {
    status: 'disconnected',
    host: 'smabo-brain.local:9090',
    esp32Host: initialEsp32Host,
    msgRate: 0,

    odom: null,
    trail: [],

    imu: null,
    gps: null,
    webrtcStream: null,
    previewOn: false,

    recognized: [],

    visionConfig: null,
    detections: null,
    visionMarkers: null,

    esp32Config: null,
    esp32Connected: null,

    esp32Ping: null,
    esp32WsPing: null,

    logs: [],
    toasts: [],

    setHost: (h) => set({ host: h }),

    connect: () => {
      const { host, status } = get();
      if (status === 'connected' || status === 'connecting') {
        brain.disconnect();
      } else {
        brain.connect(host);
      }
    },

    autoConnect: () => {
      const { host } = get();
      brain.connect(host);
    },

    setEsp32Host: (h) => {
      esp32.setHost(h);
      if (typeof localStorage !== 'undefined') localStorage.setItem(ESP32_HOST_KEY, h);
      set({ esp32Host: h });
    },

    refreshConfig: () => {
      esp32.getConfig()
        .then(config => {
          set({ esp32Config: config });
        })
        .catch(() => get().addToast('Failed to load config', 'err'));
    },

    pingEsp32: () => {
      esp32.ping()
        .then(latencyMs => {
          set({ esp32Ping: { ok: true, latencyMs, at: Date.now() } });
          get().addToast(`ESP32 responded ${latencyMs}ms`, 'ok');
        })
        .catch(() => {
          set({ esp32Ping: { ok: false, latencyMs: -1, at: Date.now() } });
          get().addToast('ESP32 no response', 'err');
        });
    },

    pingEsp32Ws: () => {
      // 能動的な end-to-end WS ping: /ping(token) を投げ、ESP32 の /pong エコーを
      // 待って RTT を測る（web→brain→ESP32→brain→web）。2 秒でタイムアウト。
      if (!brain.isConnected) {
        get().addToast('Brain not connected', 'err');
        return;
      }
      const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (wsPing) clearTimeout(wsPing.timer);
      const timer = setTimeout(() => {
        if (wsPing && wsPing.token === token) {
          wsPing = null;
          set({ esp32WsPing: { ok: false, latencyMs: -1, at: Date.now() } });
          get().addToast('ESP32 WS no response', 'err');
        }
      }, 2000);
      wsPing = { token, sentAt: performance.now(), timer };
      brain.publish('/ping', { data: token });   // brain が /web prefix を付与
      get().addSentLog(`ping ${token}`);
    },

    clearRecognized: () => set({ recognized: [] }),

    clearTrail: () => set({ trail: [] }),

    setVisionConfig: (patch) => {
      // 部分設定を /vision/config（std_msgs/String の data に JSON）で送る。
      // brain が現在値に deep-merge し、正規化済みスナップショットを全 UI に返すので
      // 受信ハンドラ側で visionConfig が更新される（楽観反映＋確定）。
      set(s => ({
        visionConfig: s.visionConfig
          ? (deepMerge(
              s.visionConfig as unknown as Record<string, unknown>,
              patch,
            ) as unknown as VisionConfigMsg)
          : s.visionConfig,
      }));
      brain.publish('/vision/config', { data: JSON.stringify(patch) });
      get().addSentLog(`vision/config ${JSON.stringify(patch)}`);
    },

    setPreview: (on) => {
      // brain→web の映像中継を要求/停止。on のとき brain が web_offer を返す。
      webrtc.setPreview(on);
      set({ previewOn: on });
      if (!on) set({ webrtcStream: null });
    },

    addLog: (entry) => {
      const id = Date.now() + Math.random();
      set(s => {
        const logs = [...s.logs, { ...entry, id }];
        // Keep last 500 entries
        return { logs: logs.length > 500 ? logs.slice(logs.length - 500) : logs };
      });
    },

    clearLogs: () => set({ logs: [] }),

    addSentLog: (text) => {
      get().addLog({ type: 'sent', text });
    },

    addToast: (msg, type) => {
      const id = Date.now() + Math.random();
      set(s => ({ toasts: [...s.toasts, { id, msg, type: type ?? '' }] }));
      setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 2500);
    },

    patchConfig: (patch) => {
      // 楽観的に即反映してから ESP32 へ直接 POST
      set(s => ({
        esp32Config: s.esp32Config ? deepMerge(s.esp32Config, patch) : patch,
      }));
      esp32.setConfig(patch)
        .catch(() => get().addToast('Failed to send config', 'err'));
    },

    removeConfig: (patch) => {
      // 削除（null 値）は楽観反映せず、送信後に再取得して正とする
      esp32.setConfig(patch)
        .then(() => get().refreshConfig())
        .catch(() => get().addToast('Failed to send config', 'err'));
    },

    setServoEnabled: (name, enabled) => {
      const patch = { servos: { joints: { [name]: { enabled } } } };
      // Optimistic update
      set(s => ({
        esp32Config: s.esp32Config ? deepMerge(s.esp32Config, patch) : patch,
      }));
      // Send to ESP32, then refresh to get last_angle written by ESP32
      esp32.setConfig(patch)
        .then(() => get().refreshConfig())
        .catch(() => get().addToast('Failed to update servo', 'err'));
    },

    setMode: (modes) => {
      esp32.setMode(modes)
        .then(() => get().refreshConfig())
        .catch(() => get().addToast('Failed to send mode', 'err'));
    },
  };
});
