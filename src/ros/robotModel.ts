// Robot model for the Motion Plan tab: URDF / SRDF parsing and a three.js robot
// that can be posed from joint values (current state, goal, planned trajectory).
//
// Everything comes over rosbridge (WebSocket): the URDF / SRDF and every mesh are
// fetched from smabo-brain-ros' robot_model_server (/smabo/get_file), so the web
// never needs file access to the ROS host.
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { rosClient } from './ros';

// ── URDF / SRDF model ─────────────────────────────────────────

export type Vec3 = [number, number, number];

export interface UrdfVisual {
  xyz: Vec3;
  rpy: Vec3;
  mesh?: { uri: string; scale: Vec3 };
  box?: Vec3;
  cylinder?: { radius: number; length: number };
  sphere?: number;
  color: [number, number, number, number];
}

export interface UrdfJoint {
  name: string;
  type: string;            // revolute | continuous | prismatic | fixed
  parent: string;
  child: string;
  xyz: Vec3;
  rpy: Vec3;
  axis: Vec3;
  lower: number;
  upper: number;
}

export interface UrdfModel {
  root: string;
  links: Map<string, UrdfVisual[]>;
  joints: UrdfJoint[];
  jointByChild: Map<string, UrdfJoint>;
}

export interface SrdfGroup { name: string; joints: string[]; tip?: string }  // tip: chain tip link (IK target)
export interface SrdfState { name: string; group: string; values: Record<string, number> }
export interface SrdfModel { groups: SrdfGroup[]; states: SrdfState[] }

const nums = (s: string | null, n: number, def = 0): number[] => {
  const v = (s ?? '').trim().split(/\s+/).filter(Boolean).map(Number);
  return Array.from({ length: n }, (_, i) => (Number.isFinite(v[i]) ? v[i] : def));
};

function originOf(el: Element | null): { xyz: Vec3; rpy: Vec3 } {
  const o = el?.querySelector(':scope > origin') ?? null;
  return { xyz: nums(o?.getAttribute('xyz') ?? null, 3) as Vec3, rpy: nums(o?.getAttribute('rpy') ?? null, 3) as Vec3 };
}

export function parseUrdf(xml: string): UrdfModel {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const robot = doc.documentElement;

  // named materials defined at robot level
  const materials = new Map<string, [number, number, number, number]>();
  robot.querySelectorAll(':scope > material').forEach(m => {
    const c = m.querySelector('color');
    if (c) materials.set(m.getAttribute('name') ?? '', nums(c.getAttribute('rgba'), 4, 1) as [number, number, number, number]);
  });

  const links = new Map<string, UrdfVisual[]>();
  robot.querySelectorAll(':scope > link').forEach(l => {
    const visuals: UrdfVisual[] = [];
    l.querySelectorAll(':scope > visual').forEach(v => {
      const { xyz, rpy } = originOf(v);
      const g = v.querySelector('geometry');
      const mat = v.querySelector('material');
      const inline = mat?.querySelector('color');
      const color = inline
        ? nums(inline.getAttribute('rgba'), 4, 1) as [number, number, number, number]
        : materials.get(mat?.getAttribute('name') ?? '') ?? [0.7, 0.7, 0.7, 1];
      const vis: UrdfVisual = { xyz, rpy, color };
      const mesh = g?.querySelector('mesh');
      const box = g?.querySelector('box');
      const cyl = g?.querySelector('cylinder');
      const sph = g?.querySelector('sphere');
      if (mesh) vis.mesh = { uri: mesh.getAttribute('filename') ?? '', scale: nums(mesh.getAttribute('scale'), 3, 1) as Vec3 };
      else if (box) vis.box = nums(box.getAttribute('size'), 3) as Vec3;
      else if (cyl) vis.cylinder = { radius: Number(cyl.getAttribute('radius')), length: Number(cyl.getAttribute('length')) };
      else if (sph) vis.sphere = Number(sph.getAttribute('radius'));
      visuals.push(vis);
    });
    links.set(l.getAttribute('name') ?? '', visuals);
  });

  const joints: UrdfJoint[] = [];
  robot.querySelectorAll(':scope > joint').forEach(j => {
    const { xyz, rpy } = originOf(j);
    const lim = j.querySelector('limit');
    const type = j.getAttribute('type') ?? 'fixed';
    joints.push({
      name: j.getAttribute('name') ?? '',
      type,
      parent: j.querySelector('parent')?.getAttribute('link') ?? '',
      child: j.querySelector('child')?.getAttribute('link') ?? '',
      xyz, rpy,
      axis: nums(j.querySelector('axis')?.getAttribute('xyz') ?? '1 0 0', 3) as Vec3,
      lower: type === 'continuous' ? -Math.PI : Number(lim?.getAttribute('lower') ?? -Math.PI),
      upper: type === 'continuous' ? Math.PI : Number(lim?.getAttribute('upper') ?? Math.PI),
    });
  });

  const jointByChild = new Map(joints.map(j => [j.child, j]));
  const root = [...links.keys()].find(l => !jointByChild.has(l)) ?? '';
  return { root, links, joints, jointByChild };
}

/** Movable joints on the chain from `base` down to `tip` (ordered base → tip). */
function chainJoints(model: UrdfModel, base: string, tip: string): string[] {
  const out: string[] = [];
  let link = tip;
  while (link !== base) {
    const j = model.jointByChild.get(link);
    if (!j) break;
    if (j.type !== 'fixed') out.unshift(j.name);
    link = j.parent;
  }
  return out;
}

export function parseSrdf(xml: string, urdf: UrdfModel): SrdfModel {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const groups: SrdfGroup[] = [];
  doc.querySelectorAll('group').forEach(g => {
    const joints: string[] = [];
    let tip: string | undefined;
    g.querySelectorAll('chain').forEach(c => {
      tip = c.getAttribute('tip_link') ?? undefined;
      joints.push(...chainJoints(urdf, c.getAttribute('base_link') ?? '', tip ?? ''));
    });
    g.querySelectorAll('joint').forEach(j => joints.push(j.getAttribute('name') ?? ''));
    groups.push({ name: g.getAttribute('name') ?? '', joints, tip });
  });
  const states: SrdfState[] = [];
  doc.querySelectorAll('group_state').forEach(s => {
    const values: Record<string, number> = {};
    s.querySelectorAll('joint').forEach(j => { values[j.getAttribute('name') ?? ''] = Number(j.getAttribute('value')); });
    states.push({ name: s.getAttribute('name') ?? '', group: s.getAttribute('group') ?? '', values });
  });
  return { groups, states };
}

// ── fetching over rosbridge ───────────────────────────────────

interface GetFileRes { success: boolean; message: string; data: string | number[] }

function toBytes(data: string | number[]): Uint8Array {
  if (typeof data !== 'string') return Uint8Array.from(data);
  const bin = atob(data);                       // rosbridge sends uint8[] as base64
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function getFile(uri: string): Promise<Uint8Array> {
  const res = await rosClient.callService<GetFileRes>(
    '/smabo/get_file', 'smabo_interfaces/srv/GetFile', { uri }, 60000);
  if (!res.success) throw new Error(`${uri}: ${res.message}`);
  return toBytes(res.data);
}

export const getText = async (uri: string) => new TextDecoder().decode(await getFile(uri));

/** Fetch every mesh the URDF references (once each). */
export async function loadMeshes(
  model: UrdfModel, onProgress?: (done: number, total: number) => void,
): Promise<Map<string, THREE.BufferGeometry>> {
  const uris = [...new Set([...model.links.values()].flat().map(v => v.mesh?.uri).filter((u): u is string => !!u))];
  const loader = new STLLoader();
  const out = new Map<string, THREE.BufferGeometry>();
  let done = 0;
  onProgress?.(0, uris.length);
  for (const uri of uris) {
    const bytes = await getFile(uri);
    const geom = loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    geom.computeVertexNormals();
    out.set(uri, geom);
    onProgress?.(++done, uris.length);
  }
  return out;
}

// ── three.js robot ────────────────────────────────────────────

export type RobotLook = 'solid' | 'goal' | 'trail';

const LOOK: Record<Exclude<RobotLook, 'solid'>, { color: number; opacity: number }> = {
  goal:  { color: 0xffa726, opacity: 0.45 },
  trail: { color: 0x4fc3f7, opacity: 0.35 },
};

const rpyQuat = (rpy: Vec3) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rpy[0], rpy[1], rpy[2], 'ZYX'));

/** A posable robot: links are Groups, each movable joint has a "motion" Group.
 *  The goal / trail looks draw only links below a movable joint, so the static
 *  body is not drawn twice over the current robot. */
export class RobotObject {
  readonly root = new THREE.Group();
  private linkObj = new Map<string, THREE.Object3D>();
  private motion = new Map<string, { obj: THREE.Object3D; joint: UrdfJoint }>();

  constructor(private model: UrdfModel, meshes: Map<string, THREE.BufferGeometry>, look: RobotLook) {
    const build = (link: string, moving: boolean): THREE.Object3D => {
      const g = new THREE.Group();
      g.name = link;
      for (const v of (look === 'solid' || moving) ? model.links.get(link) ?? [] : []) {
        const geom = v.mesh ? meshes.get(v.mesh.uri)
          : v.box ? new THREE.BoxGeometry(...v.box)
          : v.cylinder ? new THREE.CylinderGeometry(v.cylinder.radius, v.cylinder.radius, v.cylinder.length, 24).rotateX(Math.PI / 2)
          : v.sphere ? new THREE.SphereGeometry(v.sphere, 16, 12) : undefined;
        if (!geom) continue;
        const mat = look === 'solid'
          ? new THREE.MeshStandardMaterial({
            color: new THREE.Color(v.color[0], v.color[1], v.color[2]), metalness: 0.1, roughness: 0.7,
            transparent: v.color[3] < 1, opacity: v.color[3] })
          : new THREE.MeshStandardMaterial({ ...LOOK[look], transparent: true, depthWrite: false });
        const m = new THREE.Mesh(geom, mat);
        if (v.mesh) m.scale.set(...v.mesh.scale);
        m.position.set(...v.xyz);
        m.quaternion.copy(rpyQuat(v.rpy));
        g.add(m);
      }
      this.linkObj.set(link, g);
      for (const j of model.joints.filter(jj => jj.parent === link)) {
        const origin = new THREE.Group();
        origin.position.set(...j.xyz);
        origin.quaternion.copy(rpyQuat(j.rpy));
        const motion = new THREE.Group();
        origin.add(motion);
        motion.add(build(j.child, moving || j.type !== 'fixed'));
        g.add(origin);
        if (j.type !== 'fixed') this.motion.set(j.name, { obj: motion, joint: j });
      }
      return g;
    };
    this.root.add(build(model.root, false));
  }

  setJoints(values: Record<string, number>): void {
    for (const [name, v] of Object.entries(values)) {
      const m = this.motion.get(name);
      if (!m || !Number.isFinite(v)) continue;
      const axis = new THREE.Vector3(...m.joint.axis).normalize();
      if (m.joint.type === 'prismatic') { m.obj.position.copy(axis.multiplyScalar(v)); }
      else m.obj.quaternion.setFromAxisAngle(axis, v);
    }
  }

  /** Position of `link` in the robot-root frame (ROS coordinates). */
  linkPosition(link: string): THREE.Vector3 | null {
    const o = this.linkObj.get(link);
    if (!o) return null;
    this.root.updateMatrixWorld(true);
    return this.root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
  }

  // Getter is required: an accessor with only a setter reads back as undefined,
  // which kept Plan.tsx's trail animation (`if (tr && s.trail.visible)`) from running.
  get visible(): boolean { return this.root.visible; }
  set visible(v: boolean) { this.root.visible = v; }
}
