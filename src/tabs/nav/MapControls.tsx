// Map workflow for the Nav tab: build a map with SLAM, save it, then navigate
// on a saved map (AMCL). Talks to smabo-brain-ros's nav_manager:
//   /web/nav/command (std_msgs/String, JSON) → {"op": "mapping" | "save" | "navigate" | "stop", "name"?}
//   /nav/state       (std_msgs/String, JSON) ← {mode, map, maps, busy, message, maps_dir}
import { useEffect, useState } from 'react';
import { rosClient } from '../../ros/ros';
import type { ConnStatus } from '../../ws/types';

interface SavedMap { name: string; saved: string; resolution: number | null }
interface NavState {
  mode: 'off' | 'mapping' | 'navigation';
  map: string;
  maps: SavedMap[];
  busy: boolean;
  message: string;
  maps_dir: string;
}

const MODE_LABEL: Record<NavState['mode'], string> = {
  off: 'off',
  mapping: 'building a map (SLAM)',
  navigation: 'navigating (AMCL)',
};

function defaultName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `map_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function savedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export function MapControls({ rosStatus }: { rosStatus: ConnStatus }) {
  const [state, setState] = useState<NavState | null>(null);
  const [name, setName] = useState(defaultName);
  const [pick, setPick] = useState('');

  useEffect(() => {
    if (rosStatus !== 'connected') { setState(null); return; }
    return rosClient.subscribe<{ data: string }>('/nav/state', 'std_msgs/String', m => {
      try { setState(JSON.parse(m.data) as NavState); } catch { /* ignore */ }
    });
  }, [rosStatus]);

  // keep the selection valid: default to the map in use, else the newest
  useEffect(() => {
    if (!state) return;
    if (!state.maps.some(m => m.name === pick)) {
      setPick(state.maps.some(m => m.name === state.map) ? state.map : state.maps[0]?.name ?? '');
    }
  }, [state, pick]);

  const send = (cmd: Record<string, unknown>) =>
    rosClient.publishWeb('/nav/command', 'std_msgs/String', { data: JSON.stringify(cmd) });

  const ready = rosStatus === 'connected' && !!state && !state.busy;
  const mapping = state?.mode === 'mapping';
  const nameOk = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(name);

  return (
    <>
      <div className="card-title">Map (SLAM → save → navigate)</div>
      {rosStatus === 'connected' && !state && (
        <div className="nav-hint">Waiting for nav_manager (/nav/state)… It runs with smabo-brain-ros bringup.</div>
      )}
      {state && (
        <div className="nav-status">
          mode: {MODE_LABEL[state.mode]}{state.map ? ` — ${state.map}` : ''}{state.busy ? ' (working…)' : ''}
        </div>
      )}
      {state?.message && <div className="nav-hint">{state.message}</div>}

      <div className="nav-step">1. Build a map</div>
      <div className="nav-row">
        <button onClick={() => send({ op: 'mapping' })} disabled={!ready}
          title="Start slam_toolbox with an empty map, then drive smabo around (Drive tab)">
          {mapping ? 'Restart SLAM' : 'Start SLAM'}
        </button>
        <span className="nav-hint">then drive around with the Drive tab</span>
      </div>

      <div className="nav-step">2. Save it</div>
      <div className="nav-row">
        <input value={name} onChange={e => setName(e.target.value)} aria-label="map name"
          className={nameOk ? '' : 'invalid'} style={{ flex: 1, minWidth: 0 }} />
        <button onClick={() => send({ op: 'save', name })} disabled={!ready || !mapping || !nameOk}
          title={mapping ? 'Save the SLAM map' : 'Start SLAM first'}>Save</button>
      </div>
      {!nameOk && <div className="nav-hint">letters, digits, _ . - only</div>}

      <div className="nav-step">3. Navigate on a saved map</div>
      <div className="nav-row">
        <select value={pick} onChange={e => setPick(e.target.value)} disabled={!state?.maps.length}
          aria-label="saved map" style={{ flex: 1, minWidth: 0 }}>
          {!state?.maps.length && <option value="">(no saved maps)</option>}
          {state?.maps.map(m => (
            <option key={m.name} value={m.name}>{m.name}{m.saved ? ` · ${savedAt(m.saved)}` : ''}</option>
          ))}
        </select>
        <button onClick={() => send({ op: 'navigate', name: pick })} disabled={!ready || !pick}>Use</button>
      </div>
      <div className="nav-row">
        <button onClick={() => send({ op: 'stop' })} disabled={!ready || state?.mode === 'off'}
          className="danger">Stop SLAM / AMCL</button>
        {state?.maps_dir && <span className="nav-hint">saved in {state.maps_dir}</span>}
      </div>
    </>
  );
}
