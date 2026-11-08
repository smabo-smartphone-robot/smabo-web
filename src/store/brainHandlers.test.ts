import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RosbridgeMsg, ConnStatus } from '../ws/types';

// Capture the handlers registerBrainHandlers installs on the brain client.
const hooks = vi.hoisted(() => ({
  msg: null as null | ((m: RosbridgeMsg) => void),
  status: null as null | ((s: ConnStatus) => void),
}));
vi.mock('../ws/brain', () => ({
  brain: {
    host: 'brain.test:9090',
    token: 'tok',
    auth: null,
    refusal: null,
    onMsg: (h: (m: RosbridgeMsg) => void) => { hooks.msg = h; return () => {}; },
    onStatus: (h: (s: ConnStatus) => void) => { hooks.status = h; return () => {}; },
  },
}));
vi.mock('../rtc/webrtc', () => ({ handleBrainOffer: vi.fn() }));
vi.mock('../ws/esp32', () => ({ esp32: { setGateway: vi.fn() }, phone: { setGateway: vi.fn() } }));

import * as webrtc from '../rtc/webrtc';
import { esp32, phone } from '../ws/esp32';
import { registerBrainHandlers } from './brainHandlers';
import { PROTOCOL_VERSION } from '../version';

/** A minimal stand-in for the zustand store: plain state plus spied actions. */
function makeStore() {
  const actions = {
    addToast: vi.fn(),
    addLog: vi.fn(),
    setEsp32Host: vi.fn((h: string) => { state.esp32Host = h; }),
    setPhoneHost: vi.fn((h: string) => { state.phoneHost = h; }),
    refreshConfig: vi.fn(),
    refreshConfigQuietly: vi.fn(),
    refreshPhoneConfig: vi.fn(),
  };
  const state: Record<string, unknown> = {
    trail: [], recognized: [], protocolWarnings: {}, esp32Connected: null,
    esp32Host: '', phoneHost: '', ...actions,
  };
  const get = () => state as never;
  const set = (p: unknown) => {
    Object.assign(state, typeof p === 'function' ? (p as (s: unknown) => object)(state) : p);
  };
  registerBrainHandlers(set as never, get);
  return { state, actions };
}

const publish = (topic: string, msg: unknown) => hooks.msg!({ op: 'publish', topic, msg } as RosbridgeMsg);
const notice = (n: Record<string, unknown>) => hooks.msg!({ op: 'notice', ...n } as unknown as RosbridgeMsg);
const str = (data: string) => ({ data });

let store: ReturnType<typeof makeStore>;
beforeEach(() => { vi.useFakeTimers(); store = makeStore(); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('/brain/info', () => {
  it('stores the brain info and warns only when the protocol differs', () => {
    publish('/brain/info', str(JSON.stringify({ protocol: PROTOCOL_VERSION, brain: 'smabo-brain', version: '0.2.0' })));
    expect(store.state.brainInfo).toEqual({ brain: 'smabo-brain', version: '0.2.0', protocol: PROTOCOL_VERSION, auth: false });
    expect(store.state.protocolWarnings).toEqual({});

    publish('/brain/info', str(JSON.stringify({ protocol: PROTOCOL_VERSION + 1, brain: 'smabo-brain', version: '9.0.0' })));
    expect((store.state.protocolWarnings as Record<string, string>).brain).toMatch(/protocol/);
    expect(store.actions.addToast).toHaveBeenCalledTimes(1);

    // the same warning again does not toast twice
    publish('/brain/info', str(JSON.stringify({ protocol: PROTOCOL_VERSION + 1, brain: 'smabo-brain', version: '9.0.0' })));
    expect(store.actions.addToast).toHaveBeenCalledTimes(1);
  });

  it('a brain with pairing sends settings through its /devices relay', () => {
    publish('/brain/info', str(JSON.stringify({ protocol: PROTOCOL_VERSION, auth: true })));
    expect(esp32.setGateway).toHaveBeenLastCalledWith({ base: 'http://brain.test:9090/devices/esp32', token: 'tok' });
    expect(phone.setGateway).toHaveBeenLastCalledWith({ base: 'http://brain.test:9090/devices/app', token: 'tok' });
    expect(store.actions.refreshConfigQuietly).toHaveBeenCalled();
    publish('/brain/info', str(JSON.stringify({ protocol: PROTOCOL_VERSION, auth: false })));
    expect(esp32.setGateway).toHaveBeenLastCalledWith(null);
  });

  it('ignores malformed info', () => {
    publish('/brain/info', str('not json'));
    publish('/brain/info', str(JSON.stringify({ protocol: 'one' })));
    expect(store.state.brainInfo).toBeUndefined();
  });
});

describe('notices', () => {
  it('a failed hello warns, a good one or a disconnect clears it', () => {
    notice({ source: 'esp32', event: 'hello', ok: false, client: 'smabo-esp32', version: '0.1.0', protocol: 0, expected: 1 });
    expect((store.state.protocolWarnings as Record<string, string>).esp32).toMatch(/smabo-esp32 0\.1\.0 speaks protocol 0/);
    notice({ source: 'esp32', event: 'hello', ok: true });
    expect(store.state.protocolWarnings).toEqual({});

    notice({ source: 'app', event: 'hello', ok: false });
    notice({ source: 'app', event: 'disconnected' });
    expect(store.state.protocolWarnings).toEqual({});
  });

  it('debounces an ESP32 disconnect and cancels it on reconnect', () => {
    notice({ source: 'esp32', event: 'connected' });
    expect(store.state.esp32Connected).toBe(true);
    notice({ source: 'esp32', event: 'disconnected' });
    vi.advanceTimersByTime(5000);
    expect(store.state.esp32Connected).toBe(true);
    notice({ source: 'esp32', event: 'connected' });
    vi.advanceTimersByTime(10000);
    expect(store.state.esp32Connected).toBe(true);
    // only the first connect toasts
    expect(store.actions.addToast).toHaveBeenCalledTimes(1);

    notice({ source: 'esp32', event: 'disconnected' });
    vi.advanceTimersByTime(6000);
    expect(store.state.esp32Connected).toBe(false);
  });

  it('a notice without source shows its message', () => {
    notice({ message: 'hi' });
    expect(store.actions.addToast).toHaveBeenCalledWith('hi');
  });
});

describe('topics', () => {
  it('/config_url switches host once and reloads the config', () => {
    publish('/config_url', str('http://10.0.0.5'));
    publish('/config_url', str('http://10.0.0.5'));
    expect(store.actions.setEsp32Host).toHaveBeenCalledTimes(1);
    expect(store.actions.refreshConfig).toHaveBeenCalledTimes(1);
    // the 5 s repeat is not logged
    expect(store.actions.addLog).toHaveBeenCalledTimes(1);
  });

  it('/phone/config replaces the phone config, ignoring junk', () => {
    publish('/phone/config', str(JSON.stringify({ face: { style: 'cat' } })));
    expect(store.state.phoneConfig).toEqual({ face: { style: 'cat' } });
    publish('/phone/config', str('[1,2]'));
    publish('/phone/config', str('{'));
    expect(store.state.phoneConfig).toEqual({ face: { style: 'cat' } });
  });

  it('/odom updates odometry and appends to the trail', () => {
    const odom = {
      pose: { pose: { position: { x: 1, y: 2, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } },
      twist: { twist: { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } } },
    };
    publish('/odom', odom);
    publish('/odom', odom);
    expect(store.state.trail).toEqual([{ x: 1, y: 2 }, { x: 1, y: 2 }]);
  });

  it('/webrtc/web_offer hands the SDP to WebRTC', () => {
    publish('/webrtc/web_offer', str('v=0'));
    expect(webrtc.handleBrainOffer).toHaveBeenCalledWith('v=0');
  });
});

describe('connection status', () => {
  it('unpaired clears the per-connection state', () => {
    store.state.brainInfo = { brain: 'b', version: '1', protocol: 1, auth: true };
    hooks.status!('unpaired');
    expect(store.state).toMatchObject({ status: 'unpaired', brainInfo: null, esp32Connected: null });
  });

  it('a disconnect resets per-connection state', () => {
    store.state.brainInfo = { brain: 'b', version: '1', protocol: 1 };
    store.state.protocolWarnings = { brain: 'x' };
    hooks.status!('connected');
    hooks.status!('disconnected');
    expect(store.state).toMatchObject({ status: 'disconnected', esp32Connected: null, brainInfo: null, protocolWarnings: {} });
    expect(store.actions.addToast).toHaveBeenCalledWith('Brain disconnected');
  });
});
