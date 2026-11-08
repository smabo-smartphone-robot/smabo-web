import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWS {
  static OPEN = 1;
  static all: FakeWS[] = [];
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeWS.all.push(this); }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; }
  open() { this.onopen?.(); }
  reply(obj: object) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}

const store = new Map<string, string>();
vi.stubGlobal('WebSocket', FakeWS);
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
});

const { brain } = await import('./brain');
const statuses: string[] = [];
brain.onStatus(s => statuses.push(s));

const last = () => FakeWS.all[FakeWS.all.length - 1];
const ops = (ws: FakeWS) => ws.sent.map(f => f['op']);
const TOKEN_KEY = 'smabo-web.token.brain:9090';

beforeEach(() => { vi.useFakeTimers(); store.clear(); statuses.length = 0; FakeWS.all = []; });
afterEach(() => { brain.disconnect(); vi.useRealTimers(); });

describe('brain pairing', () => {
  it('without a token asks anyway; a --no-auth brain says yes', () => {
    brain.connect('brain:9090');
    last().open();
    expect(last().sent).toEqual([{ op: 'auth', token: '' }]);
    expect(statuses[statuses.length - 1]).toBe('connecting');
    last().reply({ op: 'auth', ok: true, auth: false });
    expect(ops(last())).toContain('advertise');
    expect(statuses[statuses.length - 1]).toBe('connected');
  });

  it('without a token, a brain with pairing goes to the pairing screen without "connected"', () => {
    brain.connect('brain:9090');
    last().open();
    last().reply({ op: 'auth', ok: false, reason: 'unauthorized' });
    expect(statuses).not.toContain('connected');
    expect(statuses[statuses.length - 1]).toBe('unpaired');
  });

  it('pairs with a code, keeps the token and then handshakes', () => {
    brain.pair('brain:9090', 'ABCD-EFGH', 'Chrome');
    last().open();
    expect(last().sent[0]).toEqual({ op: 'pair', code: 'ABCD-EFGH', name: 'Chrome', role: 'web' });
    expect(statuses[statuses.length - 1]).toBe('connecting');
    last().reply({ op: 'pair', ok: true, token: 'tok', role: 'web', name: 'Chrome', id: 'p1' });
    expect(store.get(TOKEN_KEY)).toBe('tok');
    expect(brain.auth).toEqual({ role: 'web', name: 'Chrome', id: 'p1' });
    expect(ops(last())).toContain('advertise');
    expect(statuses[statuses.length - 1]).toBe('connected');
  });

  it('shows its token first and stops when the brain no longer knows it', () => {
    store.set(TOKEN_KEY, 'old');
    brain.connect('brain:9090');
    last().open();
    expect(last().sent).toEqual([{ op: 'auth', token: 'old' }]);
    last().reply({ op: 'auth', ok: false, reason: 'unauthorized' });
    expect(statuses[statuses.length - 1]).toBe('unpaired');
    expect(store.has(TOKEN_KEY)).toBe(false);
    expect(brain.refusal?.reason).toBe('unauthorized');
    last().onclose?.();
    vi.advanceTimersByTime(10000);
    expect(FakeWS.all).toHaveLength(1);      // no reconnect loop
  });

  it('a brain that ignores the token (--no-auth) still gets the handshake', () => {
    store.set(TOKEN_KEY, 'tok');
    brain.connect('brain:9090');
    last().open();
    expect(ops(last())).toEqual(['auth']);
    vi.advanceTimersByTime(1600);
    expect(ops(last())).toContain('advertise');
    expect(statuses[statuses.length - 1]).toBe('connected');
  });

  it('auth frames are not passed to the message handlers', () => {
    const seen: unknown[] = [];
    const off = brain.onMsg(m => seen.push(m));
    brain.connect('brain:9090');
    last().open();
    last().reply({ op: 'publish', topic: '/odom', msg: {} });
    last().reply({ op: 'auth', ok: false, reason: 'unauthorized' });
    expect(seen).toHaveLength(1);
    off();
  });
});
