import { useRef, useEffect, useCallback } from 'react';

interface JoystickProps {
  maxLin: number;
  maxAng: number;
  onCmd: (lin: number, ang: number) => void;
  onStop: () => void;
}

const SIZE = 200;
const RADIUS = SIZE / 2 - 10;
const STICK_R = 20;

export function Joystick({ maxLin, maxAng, onCmd, onStop }: JoystickProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stickRef = useRef({ x: 0, y: 0 }); // normalized -1..1
  const draggingRef = useRef(false);
  const keysRef = useRef({ w: false, a: false, s: false, d: false, space: false });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cx = SIZE / 2;
    const cy = SIZE / 2;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Outer circle
    ctx.beginPath();
    ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(15,52,96,0.4)';
    ctx.fill();

    // Cross guides
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - RADIUS, cy);
    ctx.lineTo(cx + RADIUS, cy);
    ctx.moveTo(cx, cy - RADIUS);
    ctx.lineTo(cx, cy + RADIUS);
    ctx.stroke();

    // Stick
    const sx = cx + stickRef.current.x * RADIUS;
    const sy = cy - stickRef.current.y * RADIUS;

    ctx.beginPath();
    ctx.arc(sx, sy, STICK_R, 0, Math.PI * 2);
    ctx.fillStyle = '#e94560';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, []);

  // Normalize canvas coords to -1..1 clamped to unit circle
  const posToStick = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = SIZE / rect.width;
    const scaleY = SIZE / rect.height;
    const rawX = (clientX - rect.left) * scaleX - SIZE / 2;
    const rawY = -((clientY - rect.top) * scaleY - SIZE / 2);
    const len = Math.sqrt(rawX * rawX + rawY * rawY);
    const maxR = RADIUS - STICK_R;
    if (len === 0) {
      stickRef.current = { x: 0, y: 0 };
    } else {
      const scale = Math.min(1, len / maxR);
      stickRef.current = { x: (rawX / len) * scale, y: (rawY / len) * scale };
    }
    draw();
  };

  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => {
      draggingRef.current = true;
      posToStick(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      posToStick(e.clientX, e.clientY);
    };
    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      stickRef.current = { x: 0, y: 0 };
      draw();
      onStop();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, onStop]);

  // Touch events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const t = e.touches[0];
      posToStick(t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!draggingRef.current) return;
      const t = e.touches[0];
      posToStick(t.clientX, t.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      draggingRef.current = false;
      stickRef.current = { x: 0, y: 0 };
      draw();
      onStop();
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, onStop]);

  // Keyboard events
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      const k = keysRef.current;
      switch (e.key) {
        case 'w': case 'W': case 'ArrowUp':    k.w = true; break;
        case 's': case 'S': case 'ArrowDown':  k.s = true; break;
        case 'a': case 'A': case 'ArrowLeft':  k.a = true; break;
        case 'd': case 'D': case 'ArrowRight': k.d = true; break;
        case ' ': k.space = true; e.preventDefault(); break;
        default: return;
      }
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      const k = keysRef.current;
      switch (e.key) {
        case 'w': case 'W': case 'ArrowUp':    k.w = false; break;
        case 's': case 'S': case 'ArrowDown':  k.s = false; break;
        case 'a': case 'A': case 'ArrowLeft':  k.a = false; break;
        case 'd': case 'D': case 'ArrowRight': k.d = false; break;
        case ' ': k.space = false; break;
        default: return;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Interval to send commands
  const maxLinRef = useRef(maxLin);
  const maxAngRef = useRef(maxAng);
  maxLinRef.current = maxLin;
  maxAngRef.current = maxAng;

  const onCmdRef = useRef(onCmd);
  const onStopRef = useRef(onStop);
  onCmdRef.current = onCmd;
  onStopRef.current = onStop;

  useEffect(() => {
    const interval = setInterval(() => {
      const k = keysRef.current;

      if (k.space) {
        stickRef.current = { x: 0, y: 0 };
        draw();
        onStopRef.current();
        return;
      }

      if (!draggingRef.current) {
        // Keyboard control
        let nx = 0, ny = 0;
        if (k.w) ny += 1;
        if (k.s) ny -= 1;
        if (k.a) nx -= 1;
        if (k.d) nx += 1;

        if (nx !== 0 || ny !== 0) {
          stickRef.current = { x: nx, y: ny };
          draw();
        } else if (stickRef.current.x !== 0 || stickRef.current.y !== 0) {
          stickRef.current = { x: 0, y: 0 };
          draw();
        }
      }

      const { x, y } = stickRef.current;
      if (x !== 0 || y !== 0) {
        onCmdRef.current(y * maxLinRef.current, -x * maxAngRef.current);
      }
    }, 80);

    return () => clearInterval(interval);
  }, [draw]);

  return (
    <div className="drive-center">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        style={{ width: SIZE, height: SIZE, cursor: 'crosshair', display: 'block' }}
      />
      <div className="joystick-hints">
        <span>W↑</span>
        <span>S↓</span>
        <span>A←</span>
        <span>D→</span>
        <span>Space=STOP</span>
      </div>
    </div>
  );
}
