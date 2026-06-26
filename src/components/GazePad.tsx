import { useRef, useEffect, useCallback } from 'react';

interface GazePadProps {
  /** 視線方向を通知する。x=画面右(+)、y=画面下(+)、各 -1..1 */
  onGaze: (x: number, y: number) => void;
  /** true のとき操作を受け付けない（例: Vision が gaze を制御中）。 */
  disabled?: boolean;
}

const SIZE = 200;
const PAD = 10;          // 外枠の内側余白
const DOT_R = 14;

/**
 * 2D 視線パッド。アプリの目が Follow モードのとき、ここをドラッグすると
 * `/look_at` を送って視線方向を操作できる。中央=正面、四隅=その方向を見る。
 */
export function GazePad({ onGaze, disabled = false }: GazePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotRef = useRef({ x: 0, y: 0 }); // -1..1（x:右+, y:下+）
  const draggingRef = useRef(false);
  const onGazeRef = useRef(onGaze);
  onGazeRef.current = onGaze;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const c = SIZE / 2;
    const half = SIZE / 2 - PAD;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // 枠
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD, PAD, SIZE - PAD * 2, SIZE - PAD * 2);
    ctx.fillStyle = 'rgba(15,52,96,0.4)';
    ctx.fillRect(PAD, PAD, SIZE - PAD * 2, SIZE - PAD * 2);

    // 十字ガイド
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, c); ctx.lineTo(SIZE - PAD, c);
    ctx.moveTo(c, PAD); ctx.lineTo(c, SIZE - PAD);
    ctx.stroke();

    // 視線ドット
    const dx = c + dotRef.current.x * half;
    const dy = c + dotRef.current.y * half;
    ctx.beginPath();
    ctx.arc(dx, dy, DOT_R, 0, Math.PI * 2);
    ctx.fillStyle = '#00bcd4';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, []);

  const posToGaze = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const half = SIZE / 2 - PAD;
    const sx = SIZE / rect.width;
    const sy = SIZE / rect.height;
    const rawX = ((clientX - rect.left) * sx - SIZE / 2) / half;
    const rawY = ((clientY - rect.top) * sy - SIZE / 2) / half;
    const x = Math.max(-1, Math.min(1, rawX));
    const y = Math.max(-1, Math.min(1, rawY));
    dotRef.current = { x, y };
    draw();
    onGazeRef.current(x, y);
  };

  /** 中央（正面）に戻す。外部からも呼べるよう public な操作として公開。 */
  const center = useCallback(() => {
    dotRef.current = { x: 0, y: 0 };
    draw();
    onGazeRef.current(0, 0);
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const down = (e: PointerEvent) => {
      if (disabledRef.current) return;
      e.preventDefault();
      draggingRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      posToGaze(e.clientX, e.clientY);
    };
    const move = (e: PointerEvent) => {
      if (disabledRef.current || !draggingRef.current) return;
      e.preventDefault();
      posToGaze(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      draggingRef.current = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw]);

  return (
    <div className="gaze-pad" style={disabled ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        style={{
          width: SIZE, height: SIZE,
          cursor: disabled ? 'not-allowed' : 'crosshair',
          display: 'block', touchAction: 'none',
        }}
      />
      <button className="gaze-center-btn" onClick={center} disabled={disabled}>Recenter</button>
    </div>
  );
}
