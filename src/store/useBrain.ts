import { create } from 'zustand';
import { brain } from '../ws/brain';
import { esp32 } from '../ws/esp32';
import type { ConnStatus, RosbridgeMsg, OdomMsg, ImuMsg, GpsMsg, CompressedImageMsg, Quat } from '../ws/types';

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
  cameraJpeg: string | null;

  // Config
  esp32Config: Record<string, unknown> | null;

  // Log
  logs: LogEntry[];

  // Toasts
  toasts: Toast[];

  // Actions
  setHost(h: string): void;
  connect(): void;
  setEsp32Host(h: string): void;
  refreshConfig(): void;
  clearTrail(): void;
  addLog(entry: Omit<LogEntry, 'id'>): void;
  clearLogs(): void;
  addSentLog(text: string): void;
  addToast(msg: string, type?: 'ok' | 'err'): void;
  patchConfig(patch: Record<string, unknown>): void;
  removeConfig(patch: Record<string, unknown>): void;
  setMode(modes: Record<string, unknown>): void;
}

let msgCount = 0;

export const useBrain = create<BrainStore>((set, get) => {
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
      } else if (topic === '/camera/image/compressed') {
        const m = msg.msg as CompressedImageMsg;
        set({ cameraJpeg: m.data });
      }
    }

    // Add to log
    get().addLog({
      type: 'recv',
      text: JSON.stringify(msg),
      topic: msg.topic,
    });
  });

  brain.onStatus((s: ConnStatus) => {
    set({ status: s });
    if (s === 'connected') {
      get().addLog({ type: 'info', text: 'Brain 接続完了' });
      get().addToast('Brain 接続完了', 'ok');
    } else if (s === 'disconnected') {
      get().addLog({ type: 'info', text: 'Brain 切断' });
      get().addToast('Brain 切断');
    } else if (s === 'error') {
      get().addToast('接続エラー', 'err');
    }
  });

  // 1-second interval to update msgRate
  setInterval(() => {
    set({ msgRate: msgCount });
    msgCount = 0;
  }, 1000);

  const initialEsp32Host =
    (typeof localStorage !== 'undefined' && localStorage.getItem(ESP32_HOST_KEY)) || '';
  esp32.setHost(initialEsp32Host);

  return {
    status: 'disconnected',
    host: 'localhost:9090',
    esp32Host: initialEsp32Host,
    msgRate: 0,

    odom: null,
    trail: [],

    imu: null,
    gps: null,
    cameraJpeg: null,

    esp32Config: null,

    logs: [],
    toasts: [],

    setHost: (h) => set({ host: h }),

    connect: () => {
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
          get().addToast('Config 取得', 'ok');
        })
        .catch(() => get().addToast('Config 取得失敗', 'err'));
    },

    clearTrail: () => set({ trail: [] }),

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
        .catch(() => get().addToast('Config 送信失敗', 'err'));
    },

    removeConfig: (patch) => {
      // 削除（null 値）は楽観反映せず、送信後に再取得して正とする
      esp32.setConfig(patch)
        .then(() => get().refreshConfig())
        .catch(() => get().addToast('Config 送信失敗', 'err'));
    },

    setMode: (modes) => {
      esp32.setMode(modes)
        .then(() => get().refreshConfig())
        .catch(() => get().addToast('Mode 送信失敗', 'err'));
    },
  };
});
