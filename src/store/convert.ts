// Pure helpers: ROS message → the shapes the store keeps, and config merging.
import type { GpsMsg, ImuMsg, LaserScanMsg, OdomMsg, Quat, WheelVelMsg } from '../ws/types';

/** Quaternion → roll / pitch / yaw in degrees. */
export function toEuler(q: Quat) {
  const { x, y, z, w } = q;
  const roll  = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)) * 180 / Math.PI;
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x)))) * 180 / Math.PI;
  const yaw   = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * 180 / Math.PI;
  return { roll, pitch, yaw };
}

/** Recursively merge `over` into `base` (objects merge, everything else replaces). */
export function deepMerge(
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

export interface OdomState { vx: number; wz: number; x: number; y: number; th: number }
/** Each wheel's speed (m/s) and the revolutions counted since the last reset (signed). */
export interface WheelState { left: number; right: number; revLeft: number; revRight: number }

/** Add one /wheel_vel to the running wheel state; `radius` is dc.wheel_radius (m). */
export function addWheelVel(prev: WheelState | null, m: WheelVelMsg, radius: number): WheelState {
  const left = Number(m.left) || 0, right = Number(m.right) || 0, dt = Number(m.dt) || 0;
  const turn = radius > 0 ? 2 * Math.PI * radius : 0;
  const rev = (v: number) => (turn > 0 ? (v * dt) / turn : 0);
  return {
    left, right,
    revLeft: (prev?.revLeft ?? 0) + rev(left),
    revRight: (prev?.revRight ?? 0) + rev(right),
  };
}
export interface ImuState {
  roll: number; pitch: number; yaw: number;
  gx: number; gy: number; gz: number;
  ax: number; ay: number; az: number;
}
export interface GpsState { lat: number; lon: number; alt: number; accuracy: number | null }

export function odomFromMsg(m: OdomMsg): OdomState {
  const pos = m.pose.pose.position;
  return {
    vx: m.twist.twist.linear.x,
    wz: m.twist.twist.angular.z,
    x: pos.x,
    y: pos.y,
    th: toEuler(m.pose.pose.orientation).yaw,
  };
}

export function imuFromMsg(m: ImuMsg): ImuState {
  const { roll, pitch, yaw } = toEuler(m.orientation);
  return {
    roll, pitch, yaw,
    gx: m.angular_velocity.x, gy: m.angular_velocity.y, gz: m.angular_velocity.z,
    ax: m.linear_acceleration.x, ay: m.linear_acceleration.y, az: m.linear_acceleration.z,
  };
}

export function gpsFromMsg(m: GpsMsg): GpsState {
  const cov0 = m.position_covariance[0];
  return {
    lat: m.latitude,
    lon: m.longitude,
    alt: m.altitude,
    accuracy: (cov0 != null && cov0 >= 0) ? Math.sqrt(cov0) : null,
  };
}

/** One lidar revolution as points in the laser frame (x forward, y left, m). */
export interface ScanState {
  points: { x: number; y: number }[];
  frameId: string;
  rangeMax: number;   // the farthest valid return (m), for auto-zoom
  count: number;      // revolutions received, to show it is live
}

/** Valid returns of a LaserScan as x/y points; 0, NaN and out-of-range readings are dropped. */
export function scanFromMsg(msg: LaserScanMsg, count = 0): ScanState {
  const lo = msg.range_min ?? 0;
  const hi = msg.range_max ?? Infinity;
  const points: { x: number; y: number }[] = [];
  let rangeMax = 0;
  (msg.ranges ?? []).forEach((r, i) => {
    if (!(typeof r === 'number' && Number.isFinite(r)) || r <= 0 || r < lo || r > hi) return;
    const a = msg.angle_min + i * msg.angle_increment;
    points.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    if (r > rangeMax) rangeMax = r;
  });
  return { points, frameId: msg.header?.frame_id ?? 'laser', rangeMax, count };
}
