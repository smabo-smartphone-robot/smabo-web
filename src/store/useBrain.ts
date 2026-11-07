import { create } from 'zustand';
import { brain } from '../ws/brain';
import { esp32 } from '../ws/esp32';
import * as webrtc from '../rtc/webrtc';
import type { ConnStatus, VisionConfigMsg, Detection2DArrayMsg } from '../ws/types';
import { deepMerge, type GpsState, type ImuState, type OdomState } from './convert';
import { pendingPing, registerBrainHandlers } from './brainHandlers';

const ESP32_HOST_KEY = 'smabo-esp32-host';

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

export interface BrainStore {
  status: ConnStatus;
  host: string;
  esp32Host: string;
  msgRate: number;

  // Drive
  odom: OdomState | null;
  trail: { x: number; y: number }[];

  // Sensors
  imu: ImuState | null;
  gps: GpsState | null;
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
  /** Automatic load (startup): no error toast if the ESP32 is not reachable yet. */
  refreshConfigQuietly(): void;
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

export const useBrain = create<BrainStore>((set, get) => {
  // WebRTC 初期化（一度だけ）— brain からの中継映像 stream を store に格納
  webrtc.init(
    (topic, msg) => {
      brain.publish(topic, msg);
      get().addSentLog(topic);
    },
    (stream) => set({ webrtcStream: stream }),
  );

  registerBrainHandlers(set, get);

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

    refreshConfigQuietly: () => {
      esp32.getConfig()
        .then(config => set({ esp32Config: config }))
        .catch(() => {});
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
      if (pendingPing.current) clearTimeout(pendingPing.current.timer);
      const timer = setTimeout(() => {
        if (pendingPing.current?.token === token) {
          pendingPing.current = null;
          set({ esp32WsPing: { ok: false, latencyMs: -1, at: Date.now() } });
          get().addToast('ESP32 WS no response', 'err');
        }
      }, 2000);
      pendingPing.current = { token, sentAt: performance.now(), timer };
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
