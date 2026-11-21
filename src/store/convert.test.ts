import { describe, expect, it } from 'vitest';
import { addWheelVel, deepMerge, gpsFromMsg, imuFromMsg, odomFromMsg, toEuler, scanFromMsg } from './convert';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('toEuler', () => {
  it('identity is zero', () => {
    const e = toEuler({ x: 0, y: 0, z: 0, w: 1 });
    close(e.roll, 0); close(e.pitch, 0); close(e.yaw, 0);
  });

  it('90° about z is yaw 90', () => {
    const s = Math.SQRT1_2;
    const e = toEuler({ x: 0, y: 0, z: s, w: s });
    close(e.roll, 0); close(e.pitch, 0); close(e.yaw, 90);
  });

  it('clamps pitch when rounding pushes asin past 1', () => {
    const s = Math.SQRT1_2 + 1e-9;
    expect(Number.isNaN(toEuler({ x: 0, y: s, z: 0, w: s }).pitch)).toBe(false);
  });
});

describe('deepMerge', () => {
  it('merges nested objects and keeps untouched keys', () => {
    const base = { motor: { left: 1, right: 2 }, name: 'a' };
    expect(deepMerge(base, { motor: { right: 3 } })).toEqual({ motor: { left: 1, right: 3 }, name: 'a' });
  });

  it('replaces arrays and scalars instead of merging them', () => {
    expect(deepMerge({ pins: [1, 2], n: { a: 1 } }, { pins: [3], n: 5 })).toEqual({ pins: [3], n: 5 });
  });

  it('keeps null so a removal patch reaches the store', () => {
    expect(deepMerge({ servos: { a: { x: 1 } } }, { servos: { a: null } })).toEqual({ servos: { a: null } });
  });

  it('does not mutate its inputs', () => {
    const base = { a: { b: 1 } };
    const over = { a: { c: 2 } };
    deepMerge(base, over);
    expect(base).toEqual({ a: { b: 1 } });
    expect(over).toEqual({ a: { c: 2 } });
  });
});

describe('message converters', () => {
  it('odomFromMsg takes velocity, position and yaw', () => {
    const s = Math.SQRT1_2;
    const o = odomFromMsg({
      pose: { pose: { position: { x: 1, y: 2, z: 0 }, orientation: { x: 0, y: 0, z: s, w: s } } },
      twist: { twist: { linear: { x: 0.3, y: 0, z: 0 }, angular: { x: 0, y: 0, z: -0.5 } } },
    } as never);
    expect(o).toMatchObject({ vx: 0.3, wz: -0.5, x: 1, y: 2 });
    close(o.th, 90);
  });

  it('imuFromMsg copies rates and accelerations', () => {
    const i = imuFromMsg({
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      angular_velocity: { x: 1, y: 2, z: 3 },
      linear_acceleration: { x: 4, y: 5, z: 9.8 },
    } as never);
    expect(i).toMatchObject({ gx: 1, gy: 2, gz: 3, ax: 4, ay: 5, az: 9.8 });
  });

  it('gpsFromMsg turns variance into metres, unknown into null', () => {
    const base = { latitude: 35, longitude: 139, altitude: 10 };
    expect(gpsFromMsg({ ...base, position_covariance: [16, 0, 0, 0, 16, 0, 0, 0, 16] } as never).accuracy).toBe(4);
    expect(gpsFromMsg({ ...base, position_covariance: [-1] } as never).accuracy).toBeNull();
    expect(gpsFromMsg({ ...base, position_covariance: [] } as never).accuracy).toBeNull();
  });
});

describe('addWheelVel', () => {
  const r = 0.03, turn = 2 * Math.PI * r;

  it('keeps the speeds and counts revolutions from speed × dt', () => {
    let w = addWheelVel(null, { left: turn, right: -turn / 2, dt: 0.5 }, r);
    w = addWheelVel(w, { left: turn, right: -turn / 2, dt: 0.5 }, r);
    close(w.left, turn); close(w.right, -turn / 2);
    close(w.revLeft, 1); close(w.revRight, -0.5);
  });

  it('counts nothing without a wheel radius', () => {
    const w = addWheelVel(null, { left: 1, right: 1, dt: 1 }, 0);
    expect([w.revLeft, w.revRight]).toEqual([0, 0]);
  });
});

describe('scanFromMsg', () => {
  const msg = {
    header: { frame_id: 'laser' },
    angle_min: 0, angle_increment: Math.PI / 2, range_min: 0.05, range_max: 12,
    ranges: [1, 2, 0, 0.5, 0.01, NaN, 20],
  };

  it('turns valid ranges into x-forward / y-left points', () => {
    const s = scanFromMsg(msg, 3);
    // 0 rad → ahead, π/2 → left, (π skipped: 0 = no return), 3π/2 → right
    expect(s.points).toHaveLength(3);
    expect(s.points[0].x).toBeCloseTo(1); expect(s.points[0].y).toBeCloseTo(0);
    expect(s.points[1].x).toBeCloseTo(0); expect(s.points[1].y).toBeCloseTo(2);
    expect(s.points[2].x).toBeCloseTo(0); expect(s.points[2].y).toBeCloseTo(-0.5);
    expect(s.rangeMax).toBe(2);
    expect(s.frameId).toBe('laser');
    expect(s.count).toBe(3);
  });

  it('copes with an empty scan', () => {
    const s = scanFromMsg({ angle_min: 0, angle_increment: 0.1, ranges: [] });
    expect(s.points).toEqual([]);
    expect(s.rangeMax).toBe(0);
  });
});
