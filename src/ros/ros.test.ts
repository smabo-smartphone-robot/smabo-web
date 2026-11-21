import { describe, it, expect, vi, beforeEach } from 'vitest';

// A stand-in for ROSLIB.Ros: the test fires its socket events by hand, in any order.
const made: FakeRos[] = [];
class FakeRos {
  handlers: Record<string, ((e?: unknown) => void)[]> = {};
  closed = false;
  constructor(public opts: { url: string }) { made.push(this); }
  on(ev: string, cb: (e?: unknown) => void) { (this.handlers[ev] ??= []).push(cb); }
  emit(ev: string) { (this.handlers[ev] ?? []).forEach(cb => cb()); }
  close() { this.closed = true; }
}
vi.mock('roslib', () => ({ Ros: FakeRos }));

// a stand-in for the browser's localStorage
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
});

const { rosClient } = await import('./ros');

describe('rosClient connect / disconnect', () => {
  beforeEach(() => {
    if (rosClient.ros) rosClient.disconnect();
    made.length = 0;
  });

  it('ignores a closed connection whose close event comes after the next one is up', () => {
    const seen: string[] = [];
    const off = rosClient.onStatus(s => seen.push(s));
    rosClient.connect('host:9090');
    made[0].emit('connection');
    rosClient.connect('host:9090');          // Disconnect ROS
    rosClient.connect('host:9090');          // Connect ROS again
    made[1].emit('connection');
    made[0].emit('close');                   // the first socket's close, late
    made[0].emit('error');
    expect(rosClient.status).toBe('connected');
    expect(rosClient.ros).toBe(made[1]);
    expect(made[0].closed).toBe(true);
    expect(seen.slice(-1)).toEqual(['connected']);
    off();
  });

  it('a closed connection cannot report itself connected', () => {
    rosClient.connect('host:9090');
    rosClient.connect('host:9090');          // cancel while still connecting
    made[0].emit('connection');
    expect(rosClient.status).toBe('disconnected');
    expect(rosClient.ros).toBeNull();
  });

  it('the current connection closing from the server side drops it', () => {
    rosClient.connect('host:9090');
    made[0].emit('connection');
    made[0].emit('close');
    expect(rosClient.status).toBe('disconnected');
    expect(rosClient.ros).toBeNull();
    rosClient.connect('host:9090');          // one click reconnects
    expect(made).toHaveLength(2);
    expect(rosClient.status).toBe('connecting');
  });

  it('reconnecting after an error closes the failed socket', () => {
    rosClient.connect('host:9090');
    made[0].emit('error');
    expect(rosClient.status).toBe('error');
    rosClient.connect('host:9090');
    expect(made[0].closed).toBe(true);
    expect(rosClient.ros).toBe(made[1]);
  });
});

describe('rosClient across a reload', () => {
  beforeEach(() => {
    if (rosClient.ros) rosClient.disconnect();
    store.clear();
    made.length = 0;
  });

  it('connects again on load when ROS was connected', () => {
    rosClient.connect('host:9090');
    made[0].emit('connection');
    // reload: a new page has no connection, the browser still has the flag
    (rosClient as unknown as { _ros: unknown })._ros = null;
    rosClient.restore('host:9090');
    expect(made).toHaveLength(2);
    expect(made[1].opts.url).toBe('ws://host:9090');
  });

  it('stays disconnected after Disconnect ROS', () => {
    rosClient.connect('host:9090');
    rosClient.connect('host:9090');          // Disconnect ROS
    rosClient.restore('host:9090');
    expect(made).toHaveLength(1);
    expect(rosClient.status).toBe('disconnected');
  });

  it('stays disconnected when ROS was never connected', () => {
    rosClient.restore('host:9090');
    expect(made).toHaveLength(0);
  });

  it('a connection the server dropped is still connected again on load', () => {
    rosClient.connect('host:9090');
    made[0].emit('connection');
    made[0].emit('close');
    rosClient.restore('host:9090');
    expect(made).toHaveLength(2);
  });
});
