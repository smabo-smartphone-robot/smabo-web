// Motion Plan tab: a MoveIt "MotionPlanning" panel in the browser.
//
// Everything goes over rosbridge (WebSocket) to smabo-brain-ros:
//   - robot model  : /smabo/get_file (URDF, SRDF, meshes) → rendered with three.js
//   - current state: /joint_states
//   - goal         : joint sliders / named states (SRDF) / dragging the arm tip
//                    (position-only IK via /compute_ik)
//   - planning     : /plan_kinematic_path (GetMotionPlan service — works on any rosbridge)
//   - execution    : /execute_trajectory (ExecuteTrajectory action) of the last plan;
//                    "Execute direct" sends the planned trajectory to /servo/command
//                    instead (for rosbridge builds without action support)
//   - fallback     : the goal straight to /servo/command (skips MoveIt)
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { useBrain } from '../store/useBrain';
import { rosClient } from '../ros/ros';
import {
  parseUrdf, parseSrdf, getText, loadMeshes, RobotObject,
  type UrdfModel, type SrdfModel,
} from '../ros/robotModel';
import type { ConnStatus } from '../ws/types';
import { useThemeColors, type ThemeColors } from '../theme';

const d2r = (d: number) => d * Math.PI / 180;
const r2d = (r: number) => r * 180 / Math.PI;

const ERROR_CODES: Record<number, string> = {
  1: 'SUCCESS', 99999: 'FAILURE', [-1]: 'PLANNING_FAILED', [-2]: 'INVALID_MOTION_PLAN',
  [-4]: 'CONTROL_FAILED', [-6]: 'TIMED_OUT', [-7]: 'PREEMPTED', [-10]: 'START_STATE_IN_COLLISION',
  [-12]: 'GOAL_IN_COLLISION', [-16]: 'INVALID_GROUP_NAME', [-17]: 'INVALID_GOAL_CONSTRAINTS',
  [-21]: 'FRAME_TRANSFORM_FAILURE', [-31]: 'NO_IK_SOLUTION',
};
const codeName = (v?: number) => (v == null ? 'no result' : ERROR_CODES[v] ?? `error ${v}`);

interface JointTrajectory {
  joint_names: string[];
  points: { positions: number[]; time_from_start: { sec: number; nanosec: number } }[];
}
interface RobotTrajectory { joint_trajectory: JointTrajectory }
interface PlanResponse {
  motion_plan_response?: { trajectory?: RobotTrajectory; planning_time?: number; error_code?: { val: number } };
}
interface ExecuteResult { error_code?: { val: number } }
interface IkResult { solution?: { joint_state?: { name: string[]; position: number[] } }; error_code?: { val: number } }

interface Params { vel: number; acc: number; time: number; attempts: number }

interface Scene3D {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  rosFrame: THREE.Group;       // ROS (z-up) → three (y-up)
  orbit: OrbitControls;
  gizmo: TransformControls;
  marker: THREE.Mesh;
  grid: THREE.GridHelper;
  current?: RobotObject;
  goal?: RobotObject;
  trail?: RobotObject;
  dispose(): void;
}

const tSec = (t: { sec: number; nanosec: number }) => t.sec + t.nanosec * 1e-9;

/** Joint values along a trajectory at time t (linear interpolation). */
function sampleTrajectory(jt: JointTrajectory, t: number): Record<string, number> {
  const pts = jt.points;
  let i = 0;
  while (i < pts.length - 1 && tSec(pts[i + 1].time_from_start) < t) i++;
  const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
  const ta = tSec(a.time_from_start), tb = tSec(b.time_from_start);
  const k = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 1;
  return Object.fromEntries(jt.joint_names.map((n, j) => [n, a.positions[j] + (b.positions[j] - a.positions[j]) * k]));
}

function makeGrid(c: ThemeColors): THREE.GridHelper {
  return new THREE.GridHelper(1, 20, c.gridCenter, c.grid);   // 5 cm cells
}

/** Re-colour the scene for the current theme (background + grid). */
function applySceneTheme(s: Scene3D, c: ThemeColors) {
  s.scene.background = new THREE.Color(c.bg2);
  s.scene.remove(s.grid);
  s.grid.dispose();
  s.grid = makeGrid(c);
  s.scene.add(s.grid);
}

function createScene(div: HTMLDivElement, colors: ThemeColors): Scene3D {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(div.clientWidth || 640, div.clientHeight || 480);
  div.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(colors.bg2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(0.6, 1.0, 0.4);
  scene.add(sun);
  const grid = makeGrid(colors);
  scene.add(grid);

  const camera = new THREE.PerspectiveCamera(45, (div.clientWidth || 640) / (div.clientHeight || 480), 0.01, 20);
  camera.position.set(0.45, 0.4, 0.5);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0.12, 0);
  orbit.update();

  const rosFrame = new THREE.Group();
  rosFrame.rotation.x = -Math.PI / 2;
  scene.add(rosFrame);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.008, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x4caf50, depthTest: false }),
  );
  marker.renderOrder = 10;
  rosFrame.add(marker);
  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setMode('translate');
  gizmo.setSize(0.6);
  gizmo.attach(marker);
  gizmo.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; });
  scene.add(gizmo);

  const ro = new ResizeObserver(() => {
    const w = div.clientWidth, h = div.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  ro.observe(div);

  return {
    renderer, camera, scene, rosFrame, orbit, gizmo, marker, grid,
    dispose() {
      ro.disconnect();
      gizmo.dispose();
      orbit.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export function Plan() {
  const host = useBrain(s => s.host);
  const viewerRef = useRef<HTMLDivElement>(null);
  const s3d = useRef<Scene3D | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const [rosStatus, setRosStatus] = useState<ConnStatus>('disconnected');
  const [loadState, setLoadState] = useState('');
  const [urdf, setUrdf] = useState<UrdfModel | null>(null);
  const [srdf, setSrdf] = useState<SrdfModel | null>(null);
  const [group, setGroup] = useState('arm');
  const [goal, setGoal] = useState<Record<string, number>>({});        // rad
  const [current, setCurrent] = useState<Record<string, number>>({});  // rad
  const [params, setParams] = useState<Params>({ vel: 0.5, acc: 0.5, time: 5, attempts: 5 });
  const [traj, setTraj] = useState<JointTrajectory | null>(null);
  const [showTrail, setShowTrail] = useState(true);
  const [ik, setIk] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const goalRef = useRef(goal);       goalRef.current = goal;
  const currentRef = useRef(current); currentRef.current = current;
  const trajRef = useRef(traj);       trajRef.current = traj;
  const trailRef = useRef(showTrail); trailRef.current = showTrail;
  const draggingRef = useRef(false);
  const colors = useThemeColors();
  const colorsRef = useRef(colors);   colorsRef.current = colors;

  // theme change → recolour the live scene (it is rebuilt only on reconnect)
  useEffect(() => {
    if (s3d.current) applySceneTheme(s3d.current, colors);
  }, [colors]);

  const say = useCallback((m: string) => setLog(l => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 30)), []);

  useEffect(() => rosClient.onStatus(setRosStatus), []);

  const groupInfo = srdf?.groups.find(g => g.name === group);
  const groupJoints = groupInfo?.joints ?? [];
  const ikGroup = srdf?.groups.find(g => g.tip);          // the chain group (arm) carries the IK tip

  // ── load URDF / SRDF / meshes over rosbridge once connected ──
  useEffect(() => {
    if (rosStatus !== 'connected' || !viewerRef.current) return;
    let alive = true;
    const s = createScene(viewerRef.current, colorsRef.current);
    s3d.current = s;
    (async () => {
      try {
        setLoadState('loading robot_description…');
        const model = parseUrdf(await getText('robot_description'));
        setLoadState('loading robot_description_semantic…');
        const sem = parseSrdf(await getText('robot_description_semantic'), model);
        const meshes = await loadMeshes(model, (d, n) => setLoadState(`loading meshes ${d}/${n}…`));
        if (!alive) return;
        s.current = new RobotObject(model, meshes, 'solid');
        s.goal = new RobotObject(model, meshes, 'goal');
        s.trail = new RobotObject(model, meshes, 'trail');
        s.rosFrame.add(s.current.root, s.goal.root, s.trail.root);
        s.trail.visible = false;
        s.current.setJoints(currentRef.current);
        setUrdf(model);
        setSrdf(sem);
        setGroup(g => (sem.groups.some(x => x.name === g) ? g : sem.groups[0]?.name ?? ''));
        const zero = Object.fromEntries(model.joints.filter(j => j.type !== 'fixed').map(j => [j.name, 0]));
        setGoal(g => ({ ...zero, ...currentRef.current, ...g }));
        setLoadState('');
        say(`model loaded: ${model.links.size} links, groups ${sem.groups.map(g => g.name).join(', ')}`);
      } catch (e) {
        setLoadState(`load failed: ${(e as Error).message}`);
      }
    })();

    // render loop (+ planned-path animation)
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const tr = trajRef.current;
      if (s.trail) {
        s.trail.visible = !!tr && trailRef.current && tr.points.length > 0;
        if (tr && s.trail.visible) {
          const dur = tSec(tr.points[tr.points.length - 1].time_from_start);
          const t = ((performance.now() - t0) / 1000) % (dur + 1.0);   // 1 s pause at the end
          s.trail.setJoints(sampleTrajectory(tr, Math.min(t, dur)));
        }
      }
      s.renderer.render(s.scene, s.camera);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      s.dispose();
      s3d.current = null;
      setUrdf(null);
      setSrdf(null);
    };
  }, [rosStatus, say]);

  // ── current state ──
  useEffect(() => {
    if (rosStatus !== 'connected') return;
    return rosClient.subscribe<{ name: string[]; position: number[] }>('/joint_states', 'sensor_msgs/JointState', m => {
      const next: Record<string, number> = {};
      m.name?.forEach((n, i) => { next[n] = m.position[i]; });
      setCurrent(c => ({ ...c, ...next }));
      s3d.current?.current?.setJoints(next);
    });
  }, [rosStatus]);

  // ── goal → goal robot + IK marker ──
  useEffect(() => {
    const s = s3d.current;
    if (!s?.goal) return;
    s.goal.setJoints(goal);
    const tip = ikGroup?.tip;
    const showMarker = !!tip && group === ikGroup?.name;
    s.marker.visible = showMarker;
    s.gizmo.visible = showMarker;
    s.gizmo.enabled = showMarker;
    if (tip && showMarker && !draggingRef.current) {
      const p = s.goal.linkPosition(tip);
      if (p) s.marker.position.copy(p);
    }
  }, [goal, group, ikGroup, urdf]);

  // ── drag the arm tip → position-only IK (/compute_ik) ──
  useEffect(() => {
    const s = s3d.current;
    if (!s || !ikGroup?.tip || !urdf) return;
    let inFlight = false, pending = false;
    const root = urdf.root;
    const solve = async () => {
      if (inFlight) { pending = true; return; }
      inFlight = true;
      const p = s.marker.position;
      const seed = { ...currentRef.current, ...goalRef.current };
      try {
        const res = await rosClient.callService<IkResult>('/compute_ik', 'moveit_msgs/srv/GetPositionIK', {
          ik_request: {
            group_name: ikGroup.name,
            robot_state: { joint_state: { name: Object.keys(seed), position: Object.values(seed) } },
            avoid_collisions: true,
            ik_link_name: ikGroup.tip,
            pose_stamped: {
              header: { frame_id: root },
              pose: { position: { x: p.x, y: p.y, z: p.z }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
            },
            timeout: { sec: 0, nanosec: 200000000 },
          },
        });
        const js = res.solution?.joint_state;
        if (res.error_code?.val === 1 && js) {
          const sol = Object.fromEntries(js.name.map((n, i) => [n, js.position[i]]));
          setGoal(g => ({ ...g, ...Object.fromEntries(ikGroup.joints.map(j => [j, sol[j] ?? g[j]])) }));
          setIk('ok');
        } else setIk('fail');
      } catch { setIk('fail'); }
      inFlight = false;
      if (pending) { pending = false; solve(); }
    };
    const onChange = () => { if (draggingRef.current) solve(); };
    const onDrag = (e: { value: unknown }) => {
      draggingRef.current = !!e.value;
      if (!e.value) solve();
    };
    s.gizmo.addEventListener('objectChange', onChange);
    s.gizmo.addEventListener('dragging-changed', onDrag);
    return () => {
      s.gizmo.removeEventListener('objectChange', onChange);
      s.gizmo.removeEventListener('dragging-changed', onDrag);
    };
  }, [ikGroup, urdf]);

  useEffect(() => {
    const m = s3d.current?.marker.material as THREE.MeshBasicMaterial | undefined;
    m?.color.set(ik === 'fail' ? 0xe94560 : 0x4caf50);
  }, [ik]);

  // ── MoveIt requests ──
  const planRequest = () => ({
    motion_plan_request: {
      group_name: group,
      num_planning_attempts: params.attempts,
      allowed_planning_time: params.time,
      max_velocity_scaling_factor: params.vel,
      max_acceleration_scaling_factor: params.acc,
      start_state: { is_diff: true },
      goal_constraints: [{
        joint_constraints: groupJoints.map(j => ({
          joint_name: j, position: goal[j] ?? 0, tolerance_above: 0.01, tolerance_below: 0.01, weight: 1.0,
        })),
      }],
    },
  });

  /** Plan with GetMotionPlan; resolves with the trajectory (or null on failure). */
  const plan = async (): Promise<JointTrajectory | null> => {
    say(`plan [${group}]…`);
    try {
      const res = await rosClient.callService<PlanResponse>(
        '/plan_kinematic_path', 'moveit_msgs/srv/GetMotionPlan', planRequest(), (params.time + 5) * 1000);
      const r = res.motion_plan_response;
      const jt = r?.trajectory?.joint_trajectory;
      const ok = r?.error_code?.val === 1 && !!jt?.points?.length;
      say(`plan: ${codeName(r?.error_code?.val)}` +
        (r?.planning_time != null ? ` (${r.planning_time.toFixed(2)} s)` : '') +
        (jt?.points?.length ? `, ${jt.points.length} points` : ''));
      if (ok && jt) { setTraj(jt); return jt; }
    } catch (e) { say(`plan: ${(e as Error).message}`); }
    return null;
  };

  const execute = (jt: JointTrajectory | null = traj) => {
    if (!jt) return;
    cancelRef.current?.();
    setBusy(true);
    say('execute…');
    const done = (m: string) => { say(m); setBusy(false); cancelRef.current = null; };
    cancelRef.current = rosClient.sendActionGoal('/execute_trajectory', 'moveit_msgs/action/ExecuteTrajectory',
      { trajectory: { joint_trajectory: jt } }, {
        onResult: v => done(`execute: ${codeName(((v ?? {}) as ExecuteResult).error_code?.val)}`),
        onError: m => done(`execute failed (${m}) — try "Execute direct"`),
      });
  };

  const runPlan = async (thenExecute: boolean) => {
    setBusy(true);
    const jt = await plan();
    setBusy(false);
    if (jt && thenExecute) execute(jt);
  };

  // Send the planned trajectory to the servos as-is (same message servo_trajectory_bridge emits).
  const executeDirect = () => {
    if (!traj) return;
    rosClient.publishWeb('/servo/command', 'trajectory_msgs/JointTrajectory', {
      joint_names: traj.joint_names,
      points: traj.points.map(p => ({ positions: p.positions, velocities: [], time_from_start: p.time_from_start })),
    });
    say(`execute direct: sent ${traj.points.length} points to /servo/command`);
  };

  const stop = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setBusy(false);
    say('stop requested');
  };

  // Fallback: skip MoveIt, drive the group's servos directly (same path as the Servo tab).
  const sendDirect = () => {
    rosClient.publishWeb('/servo/command', 'trajectory_msgs/JointTrajectory', {
      joint_names: groupJoints,
      points: [{ positions: groupJoints.map(j => goal[j] ?? 0), velocities: [], time_from_start: { sec: 1, nanosec: 0 } }],
    });
    say(`sent /servo/command [${group}]`);
  };

  const setGoalJoints = (vals: Record<string, number>) => setGoal(g => ({ ...g, ...vals }));
  const jointLimits = (j: string) => urdf?.joints.find(x => x.name === j);
  const states = srdf?.states.filter(s => s.group === group) ?? [];
  const connected = rosStatus === 'connected';
  const ready = connected && !!urdf;

  return (
    <div className="nav-layout">
      <div className="nav-controls card" style={{ width: 380 }}>
        <div className="card-title">MoveIt2 — rosbridge</div>
        <div className="nav-row">
          <button onClick={() => rosClient.connect(host)}>
            {connected ? 'Disconnect ROS' : 'Connect ROS'}
          </button>
          <span className={`dot ${rosStatus}`} title={rosStatus} />
          <span style={{ fontSize: '.7rem', color: 'var(--dim)' }}>{host}</span>
        </div>
        {loadState && <div className="nav-status">{loadState}</div>}

        <div className="card-title">Planning group</div>
        <div className="nav-row">
          <select value={group} onChange={e => { setGroup(e.target.value); setTraj(null); }} disabled={!ready}>
            {(srdf?.groups ?? []).map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
          <span style={{ fontSize: '.7rem', color: 'var(--dim)' }}>{groupJoints.join(', ')}</span>
        </div>

        <div className="card-title">Goal state</div>
        <div className="nav-row">
          <button disabled={!ready} onClick={() => setGoalJoints(Object.fromEntries(groupJoints.map(j => [j, current[j] ?? 0])))}>
            current
          </button>
          {states.map(s => (
            <button key={s.name} disabled={!ready} onClick={() => setGoalJoints(s.values)}>{s.name}</button>
          ))}
        </div>
        {groupJoints.map(j => {
          const lim = jointLimits(j);
          return (
            <div key={j} className="servo-row">
              <label style={{ width: 90 }}>{j}</label>
              <input type="range" step={1} disabled={!ready}
                min={Math.round(r2d(lim?.lower ?? -Math.PI))} max={Math.round(r2d(lim?.upper ?? Math.PI))}
                value={Math.round(r2d(goal[j] ?? 0))}
                onChange={e => setGoalJoints({ [j]: d2r(Number(e.target.value)) })} />
              <span className="servo-val">{r2d(goal[j] ?? 0).toFixed(0)}°</span>
              <span style={{ fontSize: '.7rem', color: 'var(--dim)', width: 64, whiteSpace: 'nowrap' }}>
                cur {current[j] != null ? r2d(current[j]).toFixed(0) + '°' : '--'}
              </span>
            </div>
          );
        })}
        {ikGroup?.tip && group === ikGroup.name && (
          <div className="nav-status" style={{ color: ik === 'fail' ? 'var(--accent)' : 'var(--dim)' }}>
            drag the green ball ({ikGroup.tip}) in 3D to set the goal by IK
            {ik === 'fail' ? ' — no IK solution' : ''}
          </div>
        )}

        <div className="card-title">Planning parameters</div>
        {([
          ['vel', 'velocity scaling', 0.05, 1, 0.05],
          ['acc', 'accel. scaling', 0.05, 1, 0.05],
          ['time', 'planning time (s)', 0.5, 20, 0.5],
          ['attempts', 'attempts', 1, 20, 1],
        ] as const).map(([k, label, min, max, step]) => (
          <div key={k} className="servo-row">
            <label style={{ width: 130 }}>{label}</label>
            <input type="number" min={min} max={max} step={step} value={params[k]} style={{ width: 70 }}
              onChange={e => setParams(p => ({ ...p, [k]: Math.min(max, Math.max(min, Number(e.target.value) || min)) }))} />
          </div>
        ))}

        <div className="card-title">Commands</div>
        <div className="nav-row">
          <button onClick={() => runPlan(false)} disabled={!ready || busy}>Plan</button>
          <button onClick={() => execute()} disabled={!ready || busy || !traj}>Execute</button>
          <button onClick={() => runPlan(true)} disabled={!ready || busy}>Plan &amp; Execute</button>
          <button className="danger" onClick={stop} disabled={!busy}>Stop</button>
        </div>
        <div className="nav-row">
          <button onClick={executeDirect} disabled={!connected || !traj}>Execute direct (/servo/command)</button>
        </div>
        <div className="nav-row">
          <label style={{ fontSize: '.75rem' }}>
            <input type="checkbox" checked={showTrail} onChange={e => setShowTrail(e.target.checked)} /> show planned path
          </label>
          <button onClick={sendDirect} disabled={!connected || !groupJoints.length}>Send goal direct</button>
        </div>
        <div className="plan-log">
          {log.length === 0 ? <span style={{ color: 'var(--dim)' }}>no activity yet</span>
            : log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>

      <div className="nav-viewer card">
        <div className="card-title">
          3D View — <span style={{ color: 'var(--text)' }}>current</span>
          {' / '}<span style={{ color: 'var(--orange)' }}>goal</span>
          {' / '}<span style={{ color: '#4fc3f7' }}>planned path</span>
        </div>
        <div ref={viewerRef} className="viewer3d" />
      </div>
    </div>
  );
}
