// What the web does with messages and connection changes from the brain.
// Registered once by the useBrain store; updates the store via set / get.
import type { StoreApi } from 'zustand';
import { brain } from '../ws/brain';
import * as webrtc from '../rtc/webrtc';
import type {
  ConnStatus, Detection2DArrayMsg, GpsMsg, ImuMsg, OdomMsg, RosbridgeMsg, StringMsg, VisionConfigMsg,
} from '../ws/types';
import { gpsFromMsg, imuFromMsg, odomFromMsg } from './convert';
import type { BrainStore } from './useBrain';

type Set = StoreApi<BrainStore>['setState'];
type Get = StoreApi<BrainStore>['getState'];

const TRAIL_MAX = 2000;
const RECOGNIZED_MAX = 50;

// High-frequency topics with large payloads are excluded from the log, which
// would otherwise re-render the Log panel on every frame.
// /config_url repeats every 5 s with the same value.
const LOG_SKIP_TOPICS = new Set(['/vision/detections', '/config_url']);

// The ESP32 waits 3 s before reconnecting, so allow up to 6 s before showing it
// as disconnected; a "connected" notice in the meantime cancels it.
const ESP32_DISCONNECT_DEBOUNCE_MS = 6000;
// Smooth brief drops of the app.
const APP_DISCONNECT_DEBOUNCE_MS = 3000;

/** The pending WS ping (/ping → ESP32 → /pong), shared with the pingEsp32Ws action. */
export const pendingPing: {
  current: { token: string; sentAt: number; timer: ReturnType<typeof setTimeout> } | null;
} = { current: null };

export function registerBrainHandlers(set: Set, get: Get): void {
  let msgCount = 0;
  let esp32DisconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let appDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelEsp32Disconnect = () => {
    if (esp32DisconnectTimer !== null) {
      clearTimeout(esp32DisconnectTimer);
      esp32DisconnectTimer = null;
    }
  };

  // ── topics ───────────────────────────────────────────────────
  function onTopic(topic: string, raw: unknown): void {
    switch (topic) {
      case '/odom': {
        const odom = odomFromMsg(raw as OdomMsg);
        set(s => ({ odom, trail: [...s.trail, { x: odom.x, y: odom.y }].slice(-TRAIL_MAX) }));
        break;
      }
      case '/pong': {
        // ESP32 の ping エコー。token が一致したら往復時間(RTT)を確定する。
        const p = pendingPing.current;
        if (p && (raw as StringMsg)?.data === p.token) {
          clearTimeout(p.timer);
          pendingPing.current = null;
          set({ esp32WsPing: { ok: true, latencyMs: Math.round(performance.now() - p.sentAt), at: Date.now() } });
        }
        break;
      }
      case '/speech/recognized': {
        const text = (raw as StringMsg)?.data;
        if (typeof text === 'string' && text) {
          set(s => ({ recognized: [{ text, t: Date.now() }, ...s.recognized].slice(0, RECOGNIZED_MAX) }));
        }
        break;
      }
      case '/imu/data':
        set({ imu: imuFromMsg(raw as ImuMsg) });
        break;
      case '/gps/fix':
        set({ gps: gpsFromMsg(raw as GpsMsg) });
        break;
      case '/vision/config':
        // brain が保持する画像処理設定のスナップショット。data は JSON 文字列。
        try {
          set({ visionConfig: JSON.parse((raw as StringMsg).data) as VisionConfigMsg });
        } catch {
          // ignore malformed config
        }
        break;
      case '/vision/detections':
        set({ detections: raw as Detection2DArrayMsg });
        break;
      case '/vision/markers': {
        const text = (raw as StringMsg)?.data;
        if (typeof text === 'string' && text) set({ visionMarkers: { text, t: Date.now() } });
        break;
      }
      case '/config_url': {
        // ESP32 (or smabo-sim) が知らせる REST config API の場所。ホスト欄を
        // 手で合わせなくても、つながっているロボットの config を読み書きできる。
        const url = (raw as StringMsg)?.data;
        if (typeof url === 'string' && url && url !== get().esp32Host) {
          get().setEsp32Host(url);
          get().addLog({ type: 'info', text: `ESP32 config API: ${url}` });
          get().refreshConfig();
        }
        break;
      }
      case '/webrtc/web_offer': {
        // brain が中継映像を offer してきた → answer を返す
        const sdp = (raw as StringMsg)?.data;
        if (sdp) webrtc.handleBrainOffer(sdp);
        break;
      }
    }
  }

  // ── connection notices (smabo-brain only: app / esp32 connect・disconnect) ──
  function onNotice(n: Record<string, unknown>): void {
    if (!n['source'] || !n['event']) {
      if (typeof n['message'] === 'string') get().addToast(n['message']);
      return;
    }
    const connected = n['event'] === 'connected';
    if (n['source'] === 'esp32') {
      // Kept in the store (not only as toasts) so panels can show a steady
      // indicator without flashing on a quick reconnect.
      if (!connected) {
        cancelEsp32Disconnect();
        esp32DisconnectTimer = setTimeout(() => {
          esp32DisconnectTimer = null;
          set({ esp32Connected: false });
        }, ESP32_DISCONNECT_DEBOUNCE_MS);
        return;
      }
      cancelEsp32Disconnect();
      const was = get().esp32Connected;
      set({ esp32Connected: true });
      if (was !== true) get().addToast('smabo-esp32 connected', 'ok');
      return;
    }
    // app
    if (!connected) {
      appDisconnectTimer = setTimeout(() => {
        appDisconnectTimer = null;
        get().addToast('smabo-app disconnected');
      }, APP_DISCONNECT_DEBOUNCE_MS);
      return;
    }
    if (appDisconnectTimer !== null) {
      clearTimeout(appDisconnectTimer);
      appDisconnectTimer = null;
    }
    get().addToast('smabo-app connected', 'ok');
  }

  brain.onMsg((msg: RosbridgeMsg) => {
    msgCount++;
    if (msg.op === 'notice') {
      onNotice(msg as unknown as Record<string, unknown>);
      return;
    }
    if (msg.op === 'publish' && msg.topic) onTopic(msg.topic, msg.msg);
    if (!msg.topic || !LOG_SKIP_TOPICS.has(msg.topic)) {
      get().addLog({ type: 'recv', text: JSON.stringify(msg), topic: msg.topic });
    }
  });

  // ── connection status ────────────────────────────────────────
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
      // Brain が切れたら ESP32 状態も不明に戻す。再接続時のスナップショットで確定する。
      cancelEsp32Disconnect();
      set({ previewOn: false, webrtcStream: null, esp32Connected: null });
    } else if (s === 'error') {
      if (wasConnected) get().addToast('Connection error', 'err');
    }
  });

  // Messages per second, shown in the header.
  setInterval(() => {
    set({ msgRate: msgCount });
    msgCount = 0;
  }, 1000);
}
