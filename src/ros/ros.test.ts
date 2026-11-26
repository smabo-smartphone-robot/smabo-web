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
const advertised: string[] = [];
class FakeTopic {
  constructor(public opts: { name: string }) {}
  advertise() { advertised.push(this.opts.name); }
  publish() {}
}
vi.mock('roslib', () => ({ Ros: FakeRos, Topic: FakeTopic, Message: class { constructor(public m: unknown) {} } }));

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
    rosClient.open('host:9090');
    made[0].emit('connection');
    rosClient.disconnect();
    rosClient.open('host:9090');             // connect again
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
    rosClient.open('host:9090');
    rosClient.disconnect();                  // cancel while still connecting
    made[0].emit('connection');
    expect(rosClient.status).toBe('disconnected');
    expect(rosClient.ros).toBeNull();
  });

  it('the current connection closing from the server side drops it', () => {
    rosClient.open('host:9090');
    made[0].emit('connection');
    made[0].emit('close');
    expect(rosClient.status).toBe('disconnected');
    expect(rosClient.ros).toBeNull();
    rosClient.open('host:9090');             // one Start reconnects
    expect(made).toHaveLength(2);
    expect(rosClient.status).toBe('connecting');
  });

  it('advertises the command topics as soon as the connection is up', () => {
    advertised.length = 0;
    rosClient.open('host:9090');
    expect(advertised).toEqual([]);
    made[0].emit('connection');
    expect(advertised).toEqual(['/web/mode/command', '/web/nav/command']);
  });

  it('open while connected or connecting does nothing', () => {
    rosClient.open('host:9090');
    rosClient.open('host:9090');             // a second Start while connecting
    expect(made).toHaveLength(1);
    made[0].emit('connection');
    rosClient.open('host:9090');             // and once connected
    expect(made).toHaveLength(1);
    expect(rosClient.status).toBe('connected');
  });

  it('open with another host switches the connection over', () => {
    rosClient.open('host:9090');
    made[0].emit('connection');
    rosClient.open('other:9090');            // the brain host was changed, then Start
    expect(made).toHaveLength(2);
    expect(made[0].closed).toBe(true);
    expect(made[1].opts.url).toBe('ws://other:9090');
    expect(rosClient.status).toBe('connecting');
  });

  it('a connection that fails stays in error after its socket closes', () => {
    rosClient.open('host:9090');
    made[0].emit('error');
    made[0].emit('close');
    expect(rosClient.status).toBe('error');
    expect(rosClient.ros).toBeNull();
    rosClient.open('host:9090');             // the next Start tries again
    expect(made).toHaveLength(2);
    expect(rosClient.status).toBe('connecting');
  });

  it('reconnecting after an error closes the failed socket', () => {
    rosClient.open('host:9090');
    made[0].emit('error');
    expect(rosClient.status).toBe('error');
    rosClient.open('host:9090');
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
    rosClient.open('host:9090');
    made[0].emit('connection');
    // reload: a new page has no connection, the browser still has the flag
    (rosClient as unknown as { _ros: unknown })._ros = null;
    rosClient.restore('host:9090');
    expect(made).toHaveLength(2);
    expect(made[1].opts.url).toBe('ws://host:9090');
  });

  it('stays disconnected after disconnect()', () => {
    rosClient.open('host:9090');
    rosClient.disconnect();
    rosClient.restore('host:9090');
    expect(made).toHaveLength(1);
    expect(rosClient.status).toBe('disconnected');
  });

  it('stays disconnected when ROS was never connected', () => {
    rosClient.restore('host:9090');
    expect(made).toHaveLength(0);
  });

  it('a connection the server dropped is still connected again on load', () => {
    rosClient.open('host:9090');
    made[0].emit('connection');
    made[0].emit('close');
    rosClient.restore('host:9090');
    expect(made).toHaveLength(2);
  });
});
