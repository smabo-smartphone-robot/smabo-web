import { useEffect, useRef } from 'react';
import { useBrain } from '../store/useBrain';

function ToastItem({ msg, type }: { msg: string; type: '' | 'ok' | 'err' }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Trigger show class on next frame
    const raf = requestAnimationFrame(() => {
      el.classList.add('show');
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={ref} className={`toast ${type}`}>
      {msg}
    </div>
  );
}

export function Toast() {
  const toasts = useBrain(s => s.toasts);

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <ToastItem key={t.id} msg={t.msg} type={t.type} />
      ))}
    </div>
  );
}
