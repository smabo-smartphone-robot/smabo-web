// Pure helpers: ROS message → the shapes the store keeps, and config merging.
import type { GpsMsg, ImuMsg, OdomMsg, Quat } from '../ws/types';

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
