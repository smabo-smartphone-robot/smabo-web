import { useEffect, useRef, useState } from 'react';
import { useBrain } from '../store/useBrain';
import { rosClient } from '../ros/ros';
import { createViewer3D, type Viewer3DHandle } from '../ros/viewer3d';
import type { ConnStatus } from '../ws/types';

function yawToQuat(yawDeg: number) {
  const h = (yawDeg * Math.PI / 180) / 2;
  return { x: 0, y: 0, z: Math.sin(h), w: Math.cos(h) };
}

function poseMsg(x: number, y: number, yawDeg: number) {
  return { position: { x, y, z: 0 }, orientation: yawToQuat(yawDeg) };
}

// 6x6 diagonal covariance for an initial pose estimate (x, y, yaw).
const INITPOSE_COV = (() => {
  const c = new Array(36).fill(0);
  c[0] = 0.25; c[7] = 0.25; c[35] = 0.07;
  return c;
})();

export function Nav() {
  const host = useBrain(s => s.host);
  const viewerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<Viewer3DHandle | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const [rosStatus, setRosStatus] = useState<ConnStatus>('disconnected');
  const [init, setInit] = useState({ x: 0, y: 0, yaw: 0 });
  const [goal, setGoal] = useState({ x: 1, y: 0, yaw: 0 });
  const [navState, setNavState] = useState<string>('idle');

  useEffect(() => rosClient.onStatus(setRosStatus), []);

  // (Re)build the 3D viewer whenever ROS connects.
  useEffect(() => {
    if (rosStatus !== 'connected' || !rosClient.ros || !viewerRef.current) return;
    let disposed = false;
    createViewer3D({
      div: viewerRef.current,
      ros: rosClient.ros,
      fixedFrame: 'map',
      showMap: true,
      showScan: true,
      showUrdf: true,
    }).then(h => {
      if (disposed) { h.dispose(); return; }
      handleRef.current = h;
    }).catch(e => console.warn('viewer init failed', e));
    return () => {
      disposed = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [rosStatus]);

  const connect = () => rosClient.connect(host);

  const sendInitialPose = () => {
    rosClient.publishWeb('/initialpose', 'geometry_msgs/PoseWithCovarianceStamped', {
      header: { frame_id: 'map' },
      pose: { pose: poseMsg(init.x, init.y, init.yaw), covariance: INITPOSE_COV },
    });
    setNavState('initial pose sent');
  };

  const sendGoal = () => {
    cancelRef.current?.();
    setNavState('navigating…');
    cancelRef.current = rosClient.sendActionGoal(
      '/navigate_to_pose',
      'nav2_msgs/action/NavigateToPose',
      { pose: { header: { frame_id: 'map' }, pose: poseMsg(goal.x, goal.y, goal.yaw) } },
      {
        onResult: () => { setNavState('goal reached / finished'); cancelRef.current = null; },
      },
    );
  };

  const cancelGoal = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setNavState('cancelled');
  };

  const numField = (
    label: string, v: number, on: (n: number) => void,
  ) => (
    <label className="nav-field">
      {label}
      <input type="number" step={0.1} value={v}
        onChange={e => on(Number(e.target.value))} style={{ width: 70 }} />
    </label>
  );

  return (
    <div className="nav-layout">
      <div className="nav-controls card">
        <div className="card-title">Nav2 — rosbridge</div>
        <div className="nav-row">
          <button onClick={connect}>
            {rosStatus === 'connected' ? 'Disconnect ROS' : 'Connect ROS'}
          </button>
          <span className={`dot ${rosStatus}`} title={rosStatus} />
          <span style={{ fontSize: '.7rem', color: 'var(--dim)' }}>{host}</span>
        </div>

        <div className="card-title">Initial Pose (/initialpose)</div>
        <div className="nav-row">
          {numField('x', init.x, n => setInit({ ...init, x: n }))}
          {numField('y', init.y, n => setInit({ ...init, y: n }))}
          {numField('θ°', init.yaw, n => setInit({ ...init, yaw: n }))}
          <button onClick={sendInitialPose} disabled={rosStatus !== 'connected'}>Set</button>
        </div>

        <div className="card-title">Nav Goal (navigate_to_pose)</div>
        <div className="nav-row">
          {numField('x', goal.x, n => setGoal({ ...goal, x: n }))}
          {numField('y', goal.y, n => setGoal({ ...goal, y: n }))}
          {numField('θ°', goal.yaw, n => setGoal({ ...goal, yaw: n }))}
          <button onClick={sendGoal} disabled={rosStatus !== 'connected'}>Go</button>
          <button onClick={cancelGoal} className="danger">Cancel</button>
        </div>

        <div className="nav-status">state: {navState}</div>
        <div style={{ fontSize: '.7rem', color: 'var(--dim)' }}>
          3D view needs tf2_web_republisher on the ROS side (see README).
        </div>
      </div>

      <div className="nav-viewer card">
        <div className="card-title">3D View (map / scan / robot)</div>
        <div id="nav-viewer3d" ref={viewerRef} className="viewer3d" />
      </div>
    </div>
  );
}
