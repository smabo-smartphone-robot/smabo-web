// The pointer's position over the Navigation view, in each frame TF has
// (map / odom / base_link): where a spot is on the map, in odometry, and
// relative to the robot (base_link: x ahead, y to the left).
import { useEffect, useState, type MutableRefObject } from 'react';
import { framePoint, HOVER_FRAMES, type NavScene } from '../../ros/navScene';

type Point = { x: number; y: number };

export function hoverLines(scene: Pick<NavScene, 'tf' | 'fixedFrame'> | null, p: Point | null): string[] {
  if (!scene || !p || !scene.fixedFrame) return [];
  const out: string[] = [];
  for (const frame of HOVER_FRAMES) {
    const q = frame === scene.fixedFrame ? p : framePoint(scene.tf, scene.fixedFrame, frame, p.x, p.y);
    if (!q) continue;
    const extra = frame === 'base_link' ? `  ${Math.hypot(q.x, q.y).toFixed(2)} m` : '';
    out.push(`${frame}  x ${q.x.toFixed(2)}  y ${q.y.toFixed(2)}${extra}`);
  }
  return out;
}

/** `hoverRef` is what NavScene's onHover calls; this component fills it in. */
export function HoverReadout({ sceneRef, hoverRef }: {
  sceneRef: MutableRefObject<NavScene | null>;
  hoverRef: MutableRefObject<(p: Point | null) => void>;
}) {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    let frame = 0;
    let last: Point | null = null;
    hoverRef.current = p => {
      last = p;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; setLines(hoverLines(sceneRef.current, last)); });
    };
    return () => { hoverRef.current = () => {}; cancelAnimationFrame(frame); };
  }, [sceneRef, hoverRef]);
  if (!lines.length) return null;
  return (
    <div className="nav-hover" aria-live="off">
      {lines.map(l => <div key={l.split(' ')[0]}>{l}</div>)}
    </div>
  );
}
