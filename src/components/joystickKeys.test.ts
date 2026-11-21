import { describe, expect, it } from 'vitest';
import { keyStick, keyTick } from './joystickKeys';

const none = { w: false, a: false, s: false, d: false };

describe('keyboard driving', () => {
  it('follows the keys held down', () => {
    expect(keyStick({ ...none, w: true })).toEqual({ x: 0, y: 1 });
    expect(keyStick({ ...none, s: true, a: true })).toEqual({ x: -1, y: -1 });
    expect(keyStick({ ...none, w: true, s: true })).toEqual({ x: 0, y: 0 });
  });

  it('stops once when the last key is released (a short tap)', () => {
    let t = keyTick({ ...none, w: true }, false);
    expect(t).toMatchObject({ driving: true, stop: false });
    t = keyTick(none, t.driving);
    expect(t).toMatchObject({ x: 0, y: 0, driving: false, stop: true });
    t = keyTick(none, t.driving);
    expect(t.stop).toBe(false);              // nothing more while idle
  });

  it('does not stop while another key is still held', () => {
    const t = keyTick({ ...none, d: true }, true);
    expect(t).toMatchObject({ driving: true, stop: false });
  });
});
