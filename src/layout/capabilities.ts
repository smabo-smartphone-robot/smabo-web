// What the robot can do right now, inferred from live data.
//
// Used by the template picker to say which guide templates need parts that
// are not connected. It is a hint only: templates can always be opened (you
// may be wiring things up while following the guide).
import { useEffect, useState } from 'react';
import { useBrain } from '../store/useBrain';
import { rosClient } from '../ros/ros';
import type { ConnStatus } from '../ws/types';

export type Capability =
  | 'brain' | 'phone' | 'esp32'
  | 'servos.head' | 'servos.hand' | 'servos.arm'
  | 'wheels' | 'encoder' | 'lidar' | 'ros';

export const CAPABILITY_LABEL: Record<Capability, string> = {
  brain: 'brain',
  phone: 'smabo-app',
  esp32: 'ESP32',
  'servos.head': 'neck servo',
  'servos.hand': 'hand servos',
  'servos.arm': 'arm servos',
  wheels: 'DC motors',
  encoder: 'encoders',
  lidar: 'LiDAR',
  ros: 'brain-ros',
};

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Joints present and enabled in the ESP32 config whose name matches `re`. */
function hasJoint(cfg: Record<string, unknown> | null, re: RegExp): boolean {
  const joints = rec(rec(cfg?.['servos'])['joints']);
  return Object.entries(joints).some(([name, spec]) => re.test(name) && rec(spec)['enabled'] !== false);
}

export function useCapabilities(): Set<Capability> {
  const status = useBrain(s => s.status);
  const imu = useBrain(s => s.imu);
  const gps = useBrain(s => s.gps);
  const stream = useBrain(s => s.webrtcStream);
  const recognized = useBrain(s => s.recognized.length);
  const cfg = useBrain(s => s.esp32Config);
  const esp32Connected = useBrain(s => s.esp32Connected);
  const odom = useBrain(s => s.odom);

  const [ros, setRos] = useState<ConnStatus>(rosClient.status);
  useEffect(() => rosClient.onStatus(setRos), []);

  const caps = new Set<Capability>();
  if (status === 'connected') caps.add('brain');
  if (imu || gps || stream || recognized > 0) caps.add('phone');
  if (esp32Connected === true || cfg) caps.add('esp32');
  const modes = rec(cfg?.['modes']);
  if (modes['servos']) {
    if (hasJoint(cfg, /^head_/)) caps.add('servos.head');
    if (hasJoint(cfg, /hand/)) caps.add('servos.hand');
    if (hasJoint(cfg, /^arm_/)) caps.add('servos.arm');
  }
  if (modes['dc_drive'] || modes['encoder_drive'] || odom) caps.add('wheels');
  if (modes['encoder_drive']) caps.add('encoder');
  if (modes['lidar']) caps.add('lidar');
  if (ros === 'connected') caps.add('ros');
  return caps;
}
