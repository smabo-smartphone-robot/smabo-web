import { useEffect, useMemo, useRef, useState } from 'react';
import { useBrain } from '../store/useBrain';
import { rosClient } from '../ros/ros';
import {
  NavScene, type Layer, type LaserScan, type OccupancyGrid, type ParticleCloud,
  type PathMsg, type PolygonStamped, type Tool, type ViewMode,
} from '../ros/navScene';
import type { TransformStamped } from '../ros/tfTree';
import * as THREE from 'three';
import { parseUrdf, getText, loadMeshes, RobotObject, type UrdfModel } from '../ros/robotModel';
import { useModeState, useRobotDescription } from '../ros/useRosState';
import type { ConnStatus } from '../ws/types';
import { useThemeColors } from '../theme';
import { SlamPanel, NavPanel, useNavManager } from './nav/ModePanels';
import { Details } from '../components/Details';
import { HoverReadout } from './nav/HoverReadout';
import { usePersistentState, isStrings } from '../hooks/usePersistentState';

type SubTab = 'slam' | 'nav';
const isSubTab = (v: unknown): v is SubTab => v === 'slam' || v === 'nav';
const isViewMode = (v: unknown): v is ViewMode => v === '2d' || v === '3d';

function yawToQuat(yaw: number) {
  return { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) };
}

function poseMsg(x: number, y: number, yaw: number) {
  return { position: { x, y, z: 0 }, orientation: yawToQuat(yaw) };
}


// 6x6 diagonal covariance for an initial pose estimate (x, y, yaw).
const INITPOSE_COV = (() => {
  const c = new Array(36).fill(0);
  c[0] = 0.25; c[7] = 0.25; c[35] = 0.07;
  return c;
})();

/** The fixed joints of a URDF as TF transforms (what robot_state_publisher sends on
 *  /tf_static), so the laser frame is known for a previewed robot and right after a switch. */
function fixedJointTransforms(model: UrdfModel): TransformStamped[] {
  return model.joints.filter(j => j.type === 'fixed').map(j => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(j.rpy[0], j.rpy[1], j.rpy[2], 'ZYX'));
    return {
      header: { frame_id: j.parent },
      child_frame_id: j.child,
      transform: {
        translation: { x: j.xyz[0], y: j.xyz[1], z: j.xyz[2] },
        rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
      },
    };
  });
}

const LAYERS: { key: Layer; label: string }[] = [
  { key: 'map', label: 'Map' },
  { key: 'global', label: 'Global costmap' },
  { key: 'local', label: 'Local costmap' },
  { key: 'plan', label: 'Plan' },
  { key: 'localPlan', label: 'Local plan' },
  { key: 'footprint', label: 'Footprint' },
  { key: 'particles', label: 'Particles' },
  { key: 'scan', label: 'Scan' },
  { key: 'robot', label: 'Robot' },
];

export function Nav() {
  const host = useBrain(s => s.host);
  const viewerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<NavScene | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const colors = useThemeColors();
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  const [rosStatus, setRosStatus] = useState<ConnStatus>('disconnected');
  const mode = useModeState(rosStatus);
  const urdfText = useRobotDescription(rosStatus);
  const [sub, setSub] = usePersistentState<SubTab>('nav.subtab', 'slam', isSubTab);
  // a Nav2 goal is on its way (from Nav2 Goal until it is reached, rejected or cancelled)
  const [goalActive, setGoalActive] = useState(false);
  const [tool, setTool] = useState<Tool>('none');
  const [view, setView] = usePersistentState<ViewMode>('nav.view', '2d', isViewMode);
  // hidden layers are stored as a list (a Set has no JSON form)
  const [hiddenList, setHiddenList] = usePersistentState<Layer[]>('nav.hidden', ['particles'], isStrings as (v: unknown) => v is Layer[]);
  const hidden = useMemo(() => new Set(hiddenList), [hiddenList]);

  useEffect(() => rosClient.onStatus(setRosStatus), []);

  const [fixedFrame, setFixedFrame] = useState('');
  const [viewState, setViewState] = useState('');
  const navRunning = mode?.mode === 'nav' && mode.status === 'running';
  // the URDF is the navigation robot only once mode_manager has switched it (it reports
  // the model then); with no mode running it is bringup's default (the arm), not shown here
  const navModel = mode?.mode === 'nav' && mode.status !== 'error' && Object.keys(mode.model).length > 0;
  // before that, the robot navigation would switch to (from robot_model_server), as a preview
  const [previewUrdf, setPreviewUrdf] = useState<string | null>(null);
  useEffect(() => {
    if (rosStatus !== 'connected' || navModel || previewUrdf) return;
    let alive = true;
    getText('robot_description/nav').then(t => { if (alive) setPreviewUrdf(t); }).catch(() => {});
    return () => { alive = false; };
  }, [rosStatus, navModel, previewUrdf]);
  useEffect(() => { if (rosStatus !== 'connected') setPreviewUrdf(null); }, [rosStatus]);
  const preview = !navModel && !!previewUrdf;
  const navUrdf = navModel ? urdfText : previewUrdf;
  const canSend = rosStatus === 'connected' && navRunning;
  const nm = useNavManager(rosStatus, navRunning);
  // navigating on a saved map (AMCL), not building one
  const navigating = canSend && nm?.mode === 'navigation';

  const sendInitialPose = (x: number, y: number, yaw: number, frame = 'map') => {
    rosClient.publishWeb('/initialpose', 'geometry_msgs/PoseWithCovarianceStamped', {
      header: { frame_id: frame },
      pose: { pose: poseMsg(x, y, yaw), covariance: INITPOSE_COV },
    });
  };

  const sendGoal = (x: number, y: number, yaw: number, frame = 'map') => {
    cancelRef.current?.();
    sceneRef.current?.setGoal({ x, y, yaw, frame });
    setGoalActive(true);
    const done = () => {
      if (cancelRef.current !== cancel) return;     // a newer goal replaced this one
      cancelRef.current = null;
      setGoalActive(false);
      sceneRef.current?.setGoal(null);
    };
    const cancel = rosClient.sendActionGoal(
      '/navigate_to_pose',
      'nav2_msgs/action/NavigateToPose',
      { pose: { header: { frame_id: frame }, pose: poseMsg(x, y, yaw) } },
      {
        onResult: done,
        onError: done,
      },
    );
    cancelRef.current = cancel;
  };

  // the drag tools call back through a ref, so the scene can stay put
  // the pointer's position, shown by HoverReadout (which fills this in)
  const hoverRef = useRef<(p: { x: number; y: number } | null) => void>(() => {});
  const pickRef = useRef<(t: 'pose' | 'goal', x: number, y: number, yaw: number, frame: string) => void>(() => {});
  pickRef.current = (t, x, y, yaw, frame) => {
    setTool('none');
    if (t === 'pose') sendInitialPose(x, y, yaw, frame);
    else sendGoal(x, y, yaw, frame);
  };

  // the view lives as long as the tab; ROS data is fed in once connected
  useEffect(() => {
    if (!viewerRef.current) return;
    const s = new NavScene(viewerRef.current, colorsRef.current, {
      onFixedFrame: setFixedFrame,
      onPick: (t, x, y, yaw, frame) => pickRef.current(t, x, y, yaw, frame),
      onHover: p => hoverRef.current(p),
    });
    sceneRef.current = s;
    return () => { s.dispose(); sceneRef.current = null; };
  }, []);

  // theme change → recolour the running viewer
  useEffect(() => { sceneRef.current?.setColors(colors); }, [colors]);
  useEffect(() => { sceneRef.current?.setTool(tool); }, [tool]);
  useEffect(() => { sceneRef.current?.setView(view); }, [view]);
  useEffect(() => {
    for (const { key } of LAYERS) sceneRef.current?.setLayerVisible(key, !hidden.has(key));
  }, [hidden]);

  // /tf, /tf_static, the map, costmaps, plans, footprint, particles, scan, joints
  useEffect(() => {
    const s = sceneRef.current;
    if (rosStatus !== 'connected' || !s) return;
    const onTf = (m: { transforms: TransformStamped[] }) => s.tf.add(m.transforms ?? []);
    const grid = 'nav_msgs/msg/OccupancyGrid', path = 'nav_msgs/msg/Path';
    const offs = [
      rosClient.subscribe('/tf', 'tf2_msgs/msg/TFMessage', onTf),
      rosClient.subscribe('/tf_static', 'tf2_msgs/msg/TFMessage', onTf),
      rosClient.subscribe<OccupancyGrid>('/map', grid, m => s.setGrid('map', m)),
      rosClient.subscribe<OccupancyGrid>('/global_costmap/costmap', grid, m => s.setGrid('global', m)),
      rosClient.subscribe<OccupancyGrid>('/local_costmap/costmap', grid, m => s.setGrid('local', m)),
      rosClient.subscribe<PathMsg>('/plan', path, m => s.setPath('plan', m)),
      rosClient.subscribe<PathMsg>('/local_plan', path, m => s.setPath('localPlan', m)),
      rosClient.subscribe<PolygonStamped>('/local_costmap/published_footprint', 'geometry_msgs/msg/PolygonStamped', m => s.setFootprint(m)),
      rosClient.subscribe<ParticleCloud>('/particle_cloud', 'nav2_msgs/msg/ParticleCloud', m => s.setParticles(m)),
      rosClient.subscribe<LaserScan>('/scan', 'sensor_msgs/msg/LaserScan', m => s.setScan(m)),
      rosClient.subscribe<{ name: string[]; position: number[] }>('/joint_states', 'sensor_msgs/msg/JointState', m => {
        const v: Record<string, number> = {};
        m.name?.forEach((n, i) => { v[n] = m.position[i]; });
        s.setJoints(v);
      }),
    ];
    return () => offs.forEach(off => off());
  }, [rosStatus]);

  // the robot model: rebuilt whenever robot_state_publisher's URDF changes (mode switch)
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.reset();
    s.setRobot(null, 'base_link');
    if (!navUrdf) { setViewState(''); return; }
    let alive = true;
    (async () => {
      try {
        setViewState('loading robot model…');
        const model = parseUrdf(navUrdf);
        // robot_state_publisher's /tf_static for this model may have come before the reset above
        s.tf.add(fixedJointTransforms(model));
        const meshes = await loadMeshes(model, (d, n) => { if (alive) setViewState(`loading meshes ${d}/${n}…`); });
        if (!alive) return;
        s.setRobot(new RobotObject(model, meshes, 'solid'), model.root);
        setViewState('');
      } catch (e) {
        if (alive) setViewState(`robot model: ${(e as Error).message}`);
      }
    })();
    return () => { alive = false; };
  }, [navUrdf]);

  // leaving navigation: drop a goal still shown
  useEffect(() => {
    if (!navRunning) {
      setTool('none');
      cancelRef.current = null;
      setGoalActive(false);
      sceneRef.current?.setGoal(null);
    }
  }, [navRunning]);
  // SLAM only builds the map: no pose estimate or goals there (drive with the Drive tab)
  useEffect(() => {
    if (sub !== 'slam') return;
    setTool('none');
    // a goal sent from the Navigation sub-tab is not left running
    if (cancelRef.current) cancelGoal();
  }, [sub]);

  const cancelGoal = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setGoalActive(false);
    sceneRef.current?.setGoal(null);
  };

  const toggleLayer = (k: Layer) => setHiddenList(h => (h.includes(k) ? h.filter(x => x !== k) : [...h, k]));

  const toolButton = (t: Exclude<Tool, 'none'>, label: string) => (
    <button className={tool === t ? 'active' : ''} disabled={!navigating || !fixedFrame}
      onClick={() => setTool(tool === t ? 'none' : t)}
      title="click where the robot is (or should go), drag towards where it faces">
      {label}
    </button>
  );

  return (
    <div className="nav-layout">
      <div className="nav-controls card">
        <div className="card-title">Nav2 — rosbridge</div>
        <div className="nav-row">
          <span className={`dot ${rosStatus}`} title={rosStatus} />
          <span style={{ fontSize: '.7rem', color: 'var(--dim)' }}>{host}</span>
        </div>

        <div className="nav-subtabs" role="tablist" aria-label="navigation mode">
          {([['slam', 'SLAM'], ['nav', 'Navigation']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={sub === k}
              className={sub === k ? 'active' : ''} onClick={() => setSub(k)}>{label}</button>
          ))}
        </div>

        {sub === 'slam'
          ? <SlamPanel rosStatus={rosStatus} host={host} mode={mode} nm={nm} />
          : <NavPanel rosStatus={rosStatus} host={host} mode={mode} nm={nm} />}

      </div>

      <div className="nav-viewer card">
        <div className="card-title nav-viewer-title">
          <span>
            View
            <span style={{ fontWeight: 400, color: 'var(--dim)', marginLeft: 8 }}>
              {rosStatus !== 'connected' ? 'Start SLAM or Navigation to show data'
                : !navModel && !preview ? 'start Navigation to show the robot'
                : preview && !viewState ? 'preview — Start Navigation to run Nav2'
                : viewState || (fixedFrame ? `frame: ${fixedFrame}` : 'waiting for /tf…')}
            </span>
          </span>
          <span className="nav-tools">
            {sub === 'nav' && toolButton('pose', 'Pose Estimate')}
            {sub === 'nav' && toolButton('goal', 'Nav2 Goal')}
            {sub === 'nav' && (
              <button className="danger" onClick={cancelGoal} disabled={!navigating || !goalActive}
                title="stop going to the goal (Navigation keeps running)">Cancel goal</button>
            )}
            <button onClick={() => setView(view === '2d' ? '3d' : '2d')}>
              {view === '2d' ? '3D' : '2D'}
            </button>
          </span>
        </div>
        <div className="nav-viewer-box">
          <div ref={viewerRef} className="viewer3d" />
          <HoverReadout sceneRef={sceneRef} hoverRef={hoverRef} />
          <div className="nav-display">
            <Details id="nav.display">
              <summary>Display</summary>
              <div className="nav-layers">
                {LAYERS.map(({ key, label }) => (
                  <label key={key}>
                    <input type="checkbox" checked={!hidden.has(key)} onChange={() => toggleLayer(key)} />
                    {label}
                  </label>
                ))}
              </div>
            </Details>
          </div>
        </div>
      </div>
    </div>
  );
}
