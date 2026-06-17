export type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface RosbridgeMsg {
  op: string;
  topic?: string;
  msg?: unknown;
}

export interface Vec3 { x: number; y: number; z: number; }
export interface Quat { x: number; y: number; z: number; w: number; }

export interface OdomMsg {
  pose: { pose: { position: Vec3; orientation: Quat } };
  twist: { twist: { linear: Vec3; angular: Vec3 } };
}

export interface ImuMsg {
  orientation: Quat;
  angular_velocity: Vec3;
  linear_acceleration: Vec3;
}

export interface GpsMsg {
  latitude: number;
  longitude: number;
  altitude: number;
  position_covariance: number[];
}

export interface CompressedImageMsg {
  format: string;
  data: string; // base64 JPEG
}
