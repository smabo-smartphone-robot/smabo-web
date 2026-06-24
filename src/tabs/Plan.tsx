import { useEffect, useRef, useState } from 'react';
import { useBrain } from '../store/useBrain';
import { rosClient } from '../ros/ros';
import { createViewer3D, type Viewer3DHandle } from '../ros/viewer3d';
import type { ConnStatus } from '../ws/types';

const ARM_JOINTS = ['arm_joint_1', 'arm_joint_2', 'arm_joint_3', 'arm_joint_4'];
const d2r = (d: number) => d * Math.PI / 180;
const r2d = (r: number) => r * 180 / Math.PI;

interface JointStateMsg { name: string[]; position: number[]; }

function buildMoveGroupGoal(targetDeg: Record<string, number>) {
  return {
    request: {
      group_name: 'arm',
      num_planning_attempts: 5,
      allowed_planning_time: 5.0,
      max_velocity_scaling_factor: 0.5,
      max_acceleration_scaling_factor: 0.5,
      goal_constraints: [{
        joint_constraints: ARM_JOINTS.map(j => ({
          joint_name: j,
          position: d2r(targetDeg[j] ?? 0),
          tolerance_above: 0.01,
          tolerance_below: 0.01,
          weight: 1.0,
        })),
      }],
    },
    planning_options: {
      plan_only: false,
      planning_scene_diff: { is_diff: true, robot_state: { is_diff: true } },
    },
  };
}

export function Plan() {
  const host = useBrain(s => s.host);
  const viewerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<Viewer3DHandle | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const [rosStatus, setRosStatus] = useState<ConnStatus>('disconnected');
  const [target, setTarget] = useState<Record<string, number>>(
    Object.fromEntries(ARM_JOINTS.map(j => [j, 0])),
  );
  const [current, setCurrent] = useState<Record<string, number>>({});
  const [planState, setPlanState] = useState('idle');

  useEffect(() => rosClient.onStatus(setRosStatus), []);

  // 3D viewer of the arm (fixed frame base_link).
  useEffect(() => {
    if (rosStatus !== 'connected' || !rosClient.ros || !viewerRef.current) return;
    let disposed = false;
    createViewer3D({
      div: viewerRef.current,
      ros: rosClient.ros,
      fixedFrame: 'base_link',
      showUrdf: true,
    }).then(h => {
      if (disposed) { h.dispose(); return; }
      handleRef.current = h;
    }).catch(e => console.warn('viewer init failed', e));
    return () => { disposed = true; handleRef.current?.dispose(); handleRef.current = null; };
  }, [rosStatus]);

  // Track current joint state.
  useEffect(() => {
    if (rosStatus !== 'connected') return;
    return rosClient.subscribe<JointStateMsg>('/joint_states', 'sensor_msgs/JointState', m => {
      const next: Record<string, number> = {};
      m.name?.forEach((n, i) => { if (ARM_JOINTS.includes(n)) next[n] = r2d(m.position[i]); });
      if (Object.keys(next).length) setCurrent(c => ({ ...c, ...next }));
    });
  }, [rosStatus]);

  const connect = () => rosClient.connect(host);

  const planExecute = () => {
    cancelRef.current?.();
    setPlanState('planning…');
    cancelRef.current = rosClient.sendActionGoal(
      '/move_action', 'moveit_msgs/action/MoveGroup', buildMoveGroupGoal(target),
      { onResult: () => { setPlanState('executed'); cancelRef.current = null; } },
    );
  };

  // Fallback: skip MoveIt, drive the servos directly (same path as the Servo tab).
  const sendDirect = () => {
    rosClient.publishWeb('/servo/command', 'trajectory_msgs/JointTrajectory', {
      joint_names: ARM_JOINTS,
      points: [{
        positions: ARM_JOINTS.map(j => d2r(target[j] ?? 0)),
        velocities: [],
        time_from_start: { sec: 1, nanosec: 0 },
      }],
    });
    setPlanState('sent /servo/command');
  };

  return (
    <div className="nav-layout">
      <div className="nav-controls card">
        <div className="card-title">MoveIt2 — rosbridge</div>
        <div className="nav-row">
          <button onClick={connect}>
            {rosStatus === 'connected' ? 'Disconnect ROS' : 'Connect ROS'}
          </button>
          <span className={`dot ${rosStatus}`} title={rosStatus} />
          <span style={{ fontSize: '.7rem', color: 'var(--dim)' }}>{host}</span>
        </div>

        <div className="card-title">Arm joint targets (deg)</div>
        {ARM_JOINTS.map(j => (
          <div key={j} className="servo-row">
            <label style={{ width: 90 }}>{j}</label>
            <input type="range" min={-90} max={90} step={1}
              value={target[j]}
              onChange={e => setTarget(t => ({ ...t, [j]: Number(e.target.value) }))} />
            <span className="servo-val">{target[j].toFixed(0)}°</span>
            <span style={{ fontSize: '.7rem', color: 'var(--dim)', width: 60 }}>
              cur {current[j] != null ? current[j].toFixed(0) + '°' : '--'}
            </span>
          </div>
        ))}

        <div className="nav-row">
          <button onClick={planExecute} disabled={rosStatus !== 'connected'}>Plan &amp; Execute</button>
          <button onClick={sendDirect} disabled={rosStatus !== 'connected'}>Send direct</button>
        </div>
        <div className="nav-status">state: {planState}</div>
      </div>

      <div className="nav-viewer card">
        <div className="card-title">3D View (arm)</div>
        <div id="plan-viewer3d" ref={viewerRef} className="viewer3d" />
      </div>
    </div>
  );
}
