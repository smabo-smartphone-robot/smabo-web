// The connection checks and the Devices list, opened from the header.
// Rendered into <body>: the header's backdrop-filter would otherwise confine
// this fixed overlay to the header.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ConnectionPanel } from './ConnectionPanel';

export function ConnectionDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="dlg-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label="Connection">
        <div className="dlg-top">
          <span className="dlg-title">Connection</span>
          <button className="pane-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="dlg-body">
          <ConnectionPanel />
        </div>
      </div>
    </div>,
    document.body,
  );
}
