// A small TF buffer fed straight from /tf and /tf_static over rosbridge, so the
// Navigation 3D view needs no tf2_web_republisher on the ROS side. Only the
// latest transform of each parent → child edge is kept (no time travel).
import * as THREE from 'three';

export interface TransformStamped {
  header: { frame_id: string };
  child_frame_id: string;
  transform: {
    translation: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  };
}

const clean = (f: string) => f.replace(/^\/+/, '');

export class TfTree {
  /** child frame → its parent and the parent ← child transform */
  private edges = new Map<string, { parent: string; m: THREE.Matrix4 }>();

  /** Store every transform of a tf2_msgs/TFMessage. */
  add(transforms: TransformStamped[]): void {
    for (const t of transforms) {
      const parent = clean(t.header.frame_id), child = clean(t.child_frame_id);
      if (!parent || !child || parent === child) continue;
      const { translation: p, rotation: q } = t.transform;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, p.y, p.z),
        new THREE.Quaternion(q.x, q.y, q.z, q.w).normalize(),
        new THREE.Vector3(1, 1, 1),
      );
      this.edges.set(child, { parent, m });
    }
  }

  /** Forget every transform (the robot model changed, so its frames did too). */
  clear(): void {
    this.edges.clear();
  }

  has(frame: string): boolean {
    frame = clean(frame);
    return this.edges.has(frame) || [...this.edges.values()].some(e => e.parent === frame);
  }

  /** The top of `frame`'s tree and the top ← frame transform. */
  private toRoot(frame: string): { root: string; m: THREE.Matrix4 } {
    const m = new THREE.Matrix4();
    const seen = new Set<string>();
    let f = clean(frame);
    for (let e = this.edges.get(f); e && !seen.has(f); e = this.edges.get(f)) {
      seen.add(f);
      m.premultiply(e.m);
      f = e.parent;
    }
    return { root: f, m };
  }

  /** The fixed ← frame transform, or null when the two frames are not connected. */
  lookup(fixed: string, frame: string): THREE.Matrix4 | null {
    if (!this.has(fixed) || !this.has(frame)) return clean(fixed) === clean(frame) ? new THREE.Matrix4() : null;
    const a = this.toRoot(fixed), b = this.toRoot(frame);
    if (a.root !== b.root) return null;
    return a.m.invert().multiply(b.m);
  }
}
