// Shared ROS state for the Navigation and Motion Plan tabs, both fed over
// rosbridge from smabo-brain-ros:
//   /mode/state         (std_msgs/String, JSON, latched) ← mode_manager
//   /robot_description  (std_msgs/String, latched)      ← robot_state_publisher
// The URDF changes when mode_manager switches mode (nav: mobile base, plan: arm),
// so the 3D views rebuild their robot whenever it does.
import { useEffect, useState } from 'react';
import { rosClient } from './ros';
import type { ConnStatus } from '../ws/types';

export type RosMode = 'none' | 'nav' | 'plan';
export type ModeStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface SavedMap { name: string; saved?: string }

export interface ModeState {
  mode: RosMode;
  status: ModeStatus;
  message: string;
  model: Record<string, string>;
  /** saved maps (from mode_manager), to pick one before starting navigation */
  maps: SavedMap[];
}

export function parseModeState(text: string): ModeState | null {
  try {
    const s = JSON.parse(text);
    if (!s || typeof s !== 'object' || typeof s.mode !== 'string' || typeof s.status !== 'string') return null;
    const maps = Array.isArray(s.maps)
      ? s.maps.filter((m: unknown): m is SavedMap => !!m && typeof (m as SavedMap).name === 'string')
      : [];
    return { mode: s.mode, status: s.status, message: String(s.message ?? ''), model: s.model ?? {}, maps };
  } catch {
    return null;
  }
}

/** mode_manager's state, or null before it has said anything (or when not connected). */
export function useModeState(rosStatus: ConnStatus): ModeState | null {
  const [state, setState] = useState<ModeState | null>(null);
  useEffect(() => {
    if (rosStatus !== 'connected') { setState(null); return; }
    return rosClient.subscribe<{ data: string }>('/mode/state', 'std_msgs/msg/String', m => {
      const s = parseModeState(m.data);
      if (s) setState(s);
    });
  }, [rosStatus]);
  return state;
}

/** The URDF robot_state_publisher publishes now (null until it arrives). */
export function useRobotDescription(rosStatus: ConnStatus): string | null {
  const [urdf, setUrdf] = useState<string | null>(null);
  useEffect(() => {
    if (rosStatus !== 'connected') { setUrdf(null); return; }
    return rosClient.subscribe<{ data: string }>('/robot_description', 'std_msgs/msg/String', m => {
      if (m.data) setUrdf(prev => (prev === m.data ? prev : m.data));
    });
  }, [rosStatus]);
  return urdf;
}

/** map (navigation only): a saved map's name to navigate on, or '' to build a new map by SLAM */
export type ModeCommand = { op: 'start'; mode: 'nav' | 'plan'; map?: string } | { op: 'stop' };

export function sendModeCommand(cmd: ModeCommand): void {
  rosClient.publishWeb('/mode/command', 'std_msgs/msg/String', { data: JSON.stringify(cmd) });
}
