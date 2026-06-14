import { useRef, useEffect } from 'react';

interface TrailMapProps {
  trail: { x: number; y: number }[];
  robotTh: number;
  robotX: number;
  robotY: number;
}

const W = 300;
const H = 300;
const MAX_SCALE = 80; // px/m

export function TrailMap({ trail, robotTh, robotX, robotY }: TrailMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;

    // Calculate scale from trail bbox
    let scale = MAX_SCALE;
    if (trail.length > 1) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of trail) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      // Also include robot position
      if (robotX < minX) minX = robotX;
      if (robotX > maxX) maxX = robotX;
      if (robotY < minY) minY = robotY;
      if (robotY > maxY) maxY = robotY;

      const rangeX = maxX - minX;
      const rangeY = maxY - minY;
      const range = Math.max(rangeX, rangeY, 0.5);
      scale = Math.min(MAX_SCALE, (Math.min(W, H) / 2 - 20) / range);
    }

    // World to canvas: y is flipped
    const toCanvas = (wx: number, wy: number) => ({
      px: cx + wx * scale,
      py: cy - wy * scale,
    });

    // Origin cross
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    // Trail
    if (trail.length > 1) {
      ctx.strokeStyle = '#00bcd4';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const p0 = toCanvas(trail[0].x, trail[0].y);
      ctx.moveTo(p0.px, p0.py);
      for (let i = 1; i < trail.length; i++) {
        const p = toCanvas(trail[i].x, trail[i].y);
        ctx.lineTo(p.px, p.py);
      }
      ctx.stroke();
    }

    // Robot arrow
    const rp = toCanvas(robotX, robotY);
    const arrowLen = 14;
    const angle = robotTh * Math.PI / 180;
    const tipX = rp.px + Math.cos(angle) * arrowLen;
    const tipY = rp.py - Math.sin(angle) * arrowLen;

    ctx.save();
    ctx.translate(rp.px, rp.py);
    ctx.strokeStyle = '#e94560';
    ctx.fillStyle = '#e94560';
    ctx.lineWidth = 2;

    // Body
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    // Arrow
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const dx = tipX - rp.px;
    const dy = tipY - rp.py;
    ctx.lineTo(dx, dy);
    ctx.stroke();

    // Arrowhead
    const headLen = 8;
    const headAngle = 0.4;
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx - headLen * Math.cos(Math.atan2(dy, dx) - headAngle), dy - headLen * Math.sin(Math.atan2(dy, dx) - headAngle));
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx - headLen * Math.cos(Math.atan2(dy, dx) + headAngle), dy - headLen * Math.sin(Math.atan2(dy, dx) + headAngle));
    ctx.stroke();

    ctx.restore();
  }, [trail, robotX, robotY, robotTh]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ width: '100%', maxWidth: W, height: 'auto', display: 'block', borderRadius: 6, border: '1px solid #1e3a5f' }}
    />
  );
}
