// The Navigation tab's view, laid out like RViz's Nav2 view: seen from above by
// default (x to the right, y up), or in 3D. Everything comes over rosbridge and is
// placed with /tf + /tf_static (TfTree), so nothing beyond rosbridge is needed on
// the ROS side:
//   map            /map                                  nav_msgs/OccupancyGrid
//   global / local /global_costmap/costmap, /local_costmap/costmap (costmap colours)
//   plans          /plan (global, green), /local_plan (controller, blue)   nav_msgs/Path
//   footprint      /local_costmap/published_footprint    geometry_msgs/PolygonStamped
//   particles      /particle_cloud (AMCL)                nav2_msgs/ParticleCloud
//   scan           /scan                                 sensor_msgs/LaserScan
//   robot          the URDF from /robot_description, meshes from /smabo/get_file
// Two tools work like RViz's "2D Pose Estimate" and "Nav2 Goal": press on the
// ground where the robot is (or should go) and drag towards where it faces.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TfTree } from './tfTree';
import type { RobotObject } from './robotModel';
import type { ThemeColors } from '../theme';

interface Header { frame_id: string }
interface Pose {
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
}

export interface OccupancyGrid {
  header: Header;
  info: { resolution: number; width: number; height: number; origin: Pose };
  data: number[] | Int8Array;
}

export interface LaserScan {
  header: Header;
  angle_min: number; angle_increment: number;
  range_min: number; range_max: number;
  ranges: (number | null)[];
}

export interface PathMsg { header: Header; poses: { pose: Pose }[] }
export interface PolygonStamped { header: Header; polygon: { points: { x: number; y: number; z: number }[] } }
export interface ParticleCloud { header: Header; particles: { pose: Pose; weight: number }[] }

export type GridLayer = 'map' | 'global' | 'local';
export type Layer = GridLayer | 'scan' | 'plan' | 'localPlan' | 'footprint' | 'particles' | 'robot';
export type Tool = 'none' | 'pose' | 'goal';
export type ViewMode = '2d' | '3d';

// frames tried in order for the view's fixed frame
const FIXED_FRAMES = ['map', 'odom'];
const clean = (f: string) => f.replace(/^\/+/, '');

/** RGBA pixels for an occupancy grid (RViz "map" colours): unknown clear, free light, occupied dark. */
export function mapPixels(data: ArrayLike<number>, n: number): Uint8Array<ArrayBuffer> {
  const px = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const v = data[i];
    let c = 0, a = 0;
    if (v >= 0) { c = Math.round(235 - Math.min(v, 100) * 2.1); a = 255; }   // 0 → 235, 100 → 25
    px[i * 4] = c; px[i * 4 + 1] = c; px[i * 4 + 2] = c; px[i * 4 + 3] = a;
  }
  return px;
}

/** One costmap cell in RViz's "costmap" colours: [r, g, b, a]. */
export function costColor(v: number): [number, number, number, number] {
  if (v <= 0) return [0, 0, 0, 0];                 // free and unknown: see-through
  if (v >= 100) return [255, 0, 255, 200];         // lethal: magenta
  if (v >= 99) return [0, 255, 255, 190];          // inscribed (the robot would touch): cyan
  const t = v / 98;                                // inflation: blue → red
  return [Math.round(255 * t), 0, Math.round(255 * (1 - t)), Math.round(90 + 90 * t)];
}

export function costmapPixels(data: ArrayLike<number>, n: number): Uint8Array<ArrayBuffer> {
  const px = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) px.set(costColor(data[i]), i * 4);
  return px;
}

/** Scan returns as x, y, z triples in the laser frame (invalid ranges dropped). */
export function scanPoints(s: LaserScan): Float32Array {
  const out: number[] = [];
  s.ranges.forEach((r, i) => {
    if (r == null || !Number.isFinite(r) || r < s.range_min || r > s.range_max) return;
    const a = s.angle_min + i * s.angle_increment;
    out.push(r * Math.cos(a), r * Math.sin(a), 0);
  });
  return new Float32Array(out);
}

/** Yaw (rad) of a quaternion about z. */
export function yawOf(q: { x: number; y: number; z: number; w: number }): number {
  return Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
}

const poseMatrix = (p: Pose, dz = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(p.position.x, p.position.y, p.position.z + dz),
  new THREE.Quaternion(p.orientation.x, p.orientation.y, p.orientation.z, p.orientation.w).normalize(),
  new THREE.Vector3(1, 1, 1),
);

/** A flat arrow along +x in the ROS xy plane. */
function arrowShape(len: number, width: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  const hw = width / 2, head = Math.min(len * 0.35, width * 1.6);
  s.moveTo(0, -hw / 2); s.lineTo(len - head, -hw / 2); s.lineTo(len - head, -hw);
  s.lineTo(len, 0); s.lineTo(len - head, hw); s.lineTo(len - head, hw / 2); s.lineTo(0, hw / 2);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

interface Placed { obj: THREE.Object3D; frame: string; local?: THREE.Matrix4 }

export class NavScene {
  readonly tf = new TfTree();
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private persp: THREE.PerspectiveCamera;
  private ortho: THREE.OrthographicCamera;
  private orbit3d: OrbitControls;
  private orbit2d: OrbitControls;
  private view: ViewMode = '2d';
  private rosFrame = new THREE.Group();   // ROS axes (z up) inside three's y-up scene
  private grid: THREE.GridHelper;
  private placed = new Map<Layer | 'goal' | 'drag', Placed>();
  private hidden = new Set<Layer>();
  private robot: RobotObject | null = null;
  private robotRoot = 'base_link';
  private ro: ResizeObserver;
  private raf = 0;
  private tool: Tool = 'none';
  private drag: { x: number; y: number } | null = null;
  /** the frame everything is drawn in ('' until TF has one of FIXED_FRAMES or the robot) */
  fixedFrame = '';

  constructor(
    div: HTMLDivElement,
    colors: ThemeColors,
    private handlers: {
      onFixedFrame?: (f: string) => void;
      /** a pose picked with a tool, in the fixed frame */
      onPick?: (tool: Exclude<Tool, 'none'>, x: number, y: number, yaw: number, frame: string) => void;
    } = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    const w = div.clientWidth || 640, h = div.clientHeight || 480;
    this.renderer.setSize(w, h);
    div.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(1, 2, 1);
    this.scene.add(sun);
    this.rosFrame.rotation.x = -Math.PI / 2;
    this.scene.add(this.rosFrame);
    this.grid = new THREE.GridHelper(10, 20);          // 0.5 m cells
    this.scene.add(this.grid);
    this.setColors(colors);

    // 3D: orbit around the origin
    this.persp = new THREE.PerspectiveCamera(45, w / h, 0.05, 200);
    this.persp.position.set(-2.5, 3, 2.5);
    this.orbit3d = new OrbitControls(this.persp, this.renderer.domElement);
    // 2D: straight down, ROS x to the right and y up (RViz TopDownOrtho); pan + zoom only
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.ortho.position.set(0, 50, 0);
    this.ortho.up.set(0, 0, -1);
    this.ortho.zoom = 1;
    this.orbit2d = new OrbitControls(this.ortho, this.renderer.domElement);
    this.orbit2d.enableRotate = false;
    this.orbit2d.screenSpacePanning = true;
    this.orbit2d.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.orbit2d.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.fitOrtho(w, h);
    this.setView('2d');

    this.add('scan', new THREE.Points(new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: 0xff4560, size: 3, sizeAttenuation: false })));
    for (const [k, color] of [['plan', 0x22c55e], ['localPlan', 0x3b82f6]] as const) {
      this.add(k, new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true })), 5);
    }
    this.add('footprint', new THREE.LineLoop(new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x22c55e, depthTest: false, transparent: true })), 6);
    this.add('particles', new THREE.Group(), 4);
    this.add('goal', new THREE.Mesh(arrowShape(0.4, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xff3d9a, side: THREE.DoubleSide, depthTest: false, transparent: true })), 7);
    this.add('drag', new THREE.Mesh(arrowShape(0.4, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide, depthTest: false, transparent: true })), 8);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);

    this.ro = new ResizeObserver(() => {
      const cw = div.clientWidth, ch = div.clientHeight;
      if (!cw || !ch) return;
      this.renderer.setSize(cw, ch);
      this.persp.aspect = cw / ch;
      this.persp.updateProjectionMatrix();
      this.fitOrtho(cw, ch);
    });
    this.ro.observe(div);

    const loop = () => {
      this.update();
      this.renderer.render(this.scene, this.view === '2d' ? this.ortho : this.persp);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  // ------------------------------------------------------------------ //
  // view
  // ------------------------------------------------------------------ //
  private fitOrtho(w: number, h: number): void {
    const half = 3;                                   // 6 m across the shorter side at zoom 1
    const a = w / h;
    Object.assign(this.ortho, a >= 1
      ? { left: -half * a, right: half * a, top: half, bottom: -half }
      : { left: -half, right: half, top: half / a, bottom: -half / a });
    this.ortho.updateProjectionMatrix();
  }

  setView(v: ViewMode): void {
    this.view = v;
    this.orbit2d.enabled = v === '2d' && this.tool === 'none';
    this.orbit3d.enabled = v === '3d' && this.tool === 'none';
  }

  setTool(t: Tool): void {
    this.tool = t;
    this.drag = null;
    this.placed.get('drag')!.obj.visible = false;
    this.renderer.domElement.style.cursor = t === 'none' ? '' : 'crosshair';
    this.setView(this.view);
  }

  setLayerVisible(layer: Layer, on: boolean): void {
    if (on) this.hidden.delete(layer); else this.hidden.add(layer);
  }

  setColors(c: ThemeColors): void {
    this.scene.background = new THREE.Color(c.bg2);
    const mats = (Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]) as THREE.LineBasicMaterial[];
    this.scene.remove(this.grid);
    mats.forEach(m => m.dispose());
    this.grid.geometry.dispose();
    this.grid = new THREE.GridHelper(10, 20, c.gridCenter, c.grid);
    this.scene.add(this.grid);
  }

  // ------------------------------------------------------------------ //
  // data
  // ------------------------------------------------------------------ //
  private add(key: Layer | 'goal' | 'drag', obj: THREE.Object3D, renderOrder = 0): void {
    obj.matrixAutoUpdate = false;
    obj.visible = false;
    obj.renderOrder = renderOrder;
    this.rosFrame.add(obj);
    this.placed.set(key, { obj, frame: '' });
  }

  private replace(key: Layer, obj: THREE.Object3D, frame: string, local?: THREE.Matrix4, renderOrder = 0): void {
    const old = this.placed.get(key);
    if (old) {
      this.rosFrame.remove(old.obj);
      old.obj.traverse(o => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          (x as THREE.MeshBasicMaterial).map?.dispose();
          x.dispose();
        }
      });
    }
    obj.matrixAutoUpdate = false;
    obj.visible = false;
    obj.renderOrder = renderOrder;
    this.rosFrame.add(obj);
    this.placed.set(key, { obj, frame: clean(frame), local });
  }

  setRobot(robot: RobotObject | null, rootLink: string): void {
    if (this.robot) this.rosFrame.remove(this.robot.root);
    this.robot = robot;
    this.robotRoot = rootLink;
    this.placed.delete('robot');
    if (!robot) return;
    robot.root.matrixAutoUpdate = false;
    robot.root.visible = false;
    this.rosFrame.add(robot.root);
    this.placed.set('robot', { obj: robot.root, frame: rootLink });
  }

  setGrid(layer: GridLayer, g: OccupancyGrid): void {
    const { width, height, resolution, origin } = g.info;
    if (!width || !height) return;
    const px = layer === 'map' ? mapPixels(g.data, width * height) : costmapPixels(g.data, width * height);
    const tex = new THREE.DataTexture(px, width, height, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    // the plane's v = 0 edge is its -y side, which is the grid's row 0
    const geom = new THREE.PlaneGeometry(width * resolution, height * resolution)
      .translate(width * resolution / 2, height * resolution / 2, 0);
    const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      opacity: layer === 'map' ? 1 : 0.75,
    }));
    // stack slightly apart so they do not flicker: map, global, local
    const dz = { map: -0.003, global: -0.002, local: -0.001 }[layer];
    this.replace(layer, mesh, g.header.frame_id || 'map', poseMatrix(origin, dz),
      { map: -3, global: -2, local: -1 }[layer]);
  }

  setScan(s: LaserScan): void {
    const p = this.placed.get('scan')!;
    const pts = p.obj as THREE.Points;
    pts.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(scanPoints(s), 3));
    pts.geometry = g;
    p.frame = clean(s.header.frame_id);
  }

  setPath(layer: 'plan' | 'localPlan', path: PathMsg): void {
    const p = this.placed.get(layer)!;
    const line = p.obj as THREE.Line;
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(
      path.poses.map(q => new THREE.Vector3(q.pose.position.x, q.pose.position.y, 0.01)));
    p.frame = clean(path.header.frame_id);
  }

  setFootprint(f: PolygonStamped): void {
    const p = this.placed.get('footprint')!;
    const line = p.obj as THREE.LineLoop;
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(
      f.polygon.points.map(q => new THREE.Vector3(q.x, q.y, 0.012)));
    p.frame = clean(f.header.frame_id);
  }

  setParticles(c: ParticleCloud): void {
    const group = new THREE.Group();
    const geom = arrowShape(0.18, 0.05);
    const mat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.8 });
    const n = c.particles.length;
    const step = Math.max(1, Math.floor(n / 400));          // draw at most ~400
    for (let i = 0; i < n; i += step) {
      const a = new THREE.Mesh(geom, mat);
      a.matrixAutoUpdate = false;
      a.matrix.copy(poseMatrix(c.particles[i].pose, 0.008));
      a.renderOrder = 4;
      group.add(a);
    }
    this.replace('particles', group, c.header.frame_id, undefined, 4);
  }

  /** Show (or hide with null) the goal being driven to, in `frame`. */
  setGoal(goal: { x: number; y: number; yaw: number; frame: string } | null): void {
    const p = this.placed.get('goal')!;
    p.frame = goal ? clean(goal.frame) : '';
    if (goal) p.local = new THREE.Matrix4().makeRotationZ(goal.yaw).setPosition(goal.x, goal.y, 0.015);
  }

  setJoints(values: Record<string, number>): void {
    this.robot?.setJoints(values);
  }

  /** Drop the data of a robot model that is gone (TF frames, plans, particles). */
  reset(): void {
    this.tf.clear();
    for (const [k, p] of this.placed) if (k !== 'robot') { p.frame = ''; p.obj.visible = false; }
  }

  // ------------------------------------------------------------------ //
  // tools: press where the pose is, drag towards where it faces
  // ------------------------------------------------------------------ //
  private ground(e: PointerEvent): { x: number; y: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.view === '2d' ? this.ortho : this.persp);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    return { x: hit.x, y: -hit.z };                    // three (x, -z) on the ground = ROS (x, y)
  }

  private onDown = (e: PointerEvent) => {
    if (this.tool === 'none' || e.button !== 0) return;
    const g = this.ground(e);
    if (!g) return;
    this.drag = g;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.showDrag(g.x, g.y, 0);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drag) return;
    const g = this.ground(e);
    if (g) this.showDrag(this.drag.x, this.drag.y, Math.atan2(g.y - this.drag.y, g.x - this.drag.x));
  };

  private onUp = (e: PointerEvent) => {
    if (!this.drag) return;
    const g = this.ground(e) ?? this.drag;
    const { x, y } = this.drag;
    const moved = Math.hypot(g.x - x, g.y - y) > 0.02;
    const yaw = moved ? Math.atan2(g.y - y, g.x - x) : 0;
    const tool = this.tool as Exclude<Tool, 'none'>;
    this.setTool('none');
    if (this.fixedFrame) this.handlers.onPick?.(tool, x, y, yaw, this.fixedFrame);
  };

  private showDrag(x: number, y: number, yaw: number): void {
    const d = this.placed.get('drag')!;
    const mesh = d.obj as THREE.Mesh;
    (mesh.material as THREE.MeshBasicMaterial).color.set(this.tool === 'goal' ? 0xff3d9a : 0x22c55e);
    mesh.visible = true;
    mesh.matrix.makeRotationZ(yaw).setPosition(x, y, 0.02);   // already in the fixed frame
  }

  // ------------------------------------------------------------------ //
  // per frame: place everything from the latest TF
  // ------------------------------------------------------------------ //
  private update(): void {
    const fixed = FIXED_FRAMES.find(f => this.tf.has(f)) ?? (this.tf.has(this.robotRoot) ? this.robotRoot : '');
    if (fixed !== this.fixedFrame) {
      this.fixedFrame = fixed;
      this.handlers.onFixedFrame?.(fixed);
    }
    for (const [key, p] of this.placed) {
      if (key === 'drag') continue;
      const m = fixed && p.frame && !this.hidden.has(key as Layer) ? this.tf.lookup(fixed, p.frame) : null;
      p.obj.visible = !!m;
      if (m) p.obj.matrix.copy(p.local ? m.multiply(p.local) : m);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    this.orbit2d.dispose();
    this.orbit3d.dispose();
    this.renderer.dispose();
    el.remove();
  }
}
