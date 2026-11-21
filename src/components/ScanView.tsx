import { useRef, useEffect } from 'react';
import { useThemeColors } from '../theme';
import type { ScanState } from '../store/convert';

const SIZE = 300;
const MARGIN = 12;
// view radius (m): the smallest of these that holds the farthest return
const RANGES = [0.5, 1, 2, 3, 5, 8, 12];

// the view zooms out at once, but zooms in only after this long without a far point
export const SHRINK_DELAY_MS = 3000;

export function viewRange(rangeMax: number): number {
  return RANGES.find(r => r >= rangeMax * 1.05) ?? RANGES[RANGES.length - 1];
}

export interface ViewHold {
  range: number;
  shrinkSince: number | null;   // when a smaller radius first became enough
}

/** The next view radius: grow straight away, shrink only once a smaller one has fitted for SHRINK_DELAY_MS. */
export function holdViewRange(prev: ViewHold | null, rangeMax: number, now: number): ViewHold {
  const want = viewRange(rangeMax);
  if (!prev || want >= prev.range) return { range: want, shrinkSince: null };
  const since = prev.shrinkSince ?? now;
  if (now - since >= SHRINK_DELAY_MS) return { range: want, shrinkSince: null };
  return { range: prev.range, shrinkSince: since };
}

/** The lidar's points seen from above, centred on the laser frame, forward (x) up and left (y) to the left. */
export function ScanView({ scan }: { scan: ScanState | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = useThemeColors();
  const holdRef = useRef<ViewHold | null>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const c = SIZE / 2;
    holdRef.current = holdViewRange(holdRef.current, scan?.rangeMax ?? 0, Date.now());
    const range = holdRef.current.range;
    const scale = (c - MARGIN) / range;              // px/m
    const toPx = (x: number, y: number) => [c - y * scale, c - x * scale] as const;

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = colors.canvas;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // range rings: quarters of the view radius, labelled in metres
    ctx.strokeStyle = colors.grid;
    ctx.fillStyle = colors.dim;
    ctx.lineWidth = 1;
    ctx.font = '10px sans-serif';
    for (let i = 1; i <= 4; i++) {
      const r = (range * i) / 4;
      ctx.beginPath();
      ctx.arc(c, c, r * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText(`${+r.toFixed(2)} m`, c + 3, c - r * scale + 11);
    }
    ctx.strokeStyle = colors.gridCenter;
    ctx.beginPath();
    ctx.moveTo(MARGIN, c); ctx.lineTo(SIZE - MARGIN, c);
    ctx.moveTo(c, MARGIN); ctx.lineTo(c, SIZE - MARGIN);
    ctx.stroke();

    // points
    ctx.fillStyle = colors.cyan;
    for (const p of scan?.points ?? []) {
      const [px, py] = toPx(p.x, p.y);
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }

    // the robot: a triangle pointing forward
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(c, c - 9);
    ctx.lineTo(c - 6, c + 6);
    ctx.lineTo(c + 6, c + 6);
    ctx.closePath();
    ctx.fill();
  }, [scan, colors]);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      style={{ width: '100%', maxWidth: SIZE, height: 'auto', display: 'block', margin: '0 auto', borderRadius: 6, border: '1px solid var(--border)' }}
    />
  );
}
