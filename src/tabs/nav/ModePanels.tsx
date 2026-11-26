// The Navigation tab's two sub-tabs: SLAM (build a map and save it) and Navigation
// (navigate on a saved map with AMCL). Both run the same smabo-brain-ros "nav" mode;
// mode_manager starts it (with a map, or "" for SLAM) and, while it runs, nav_manager
// switches between SLAM and AMCL without restarting Nav2:
//   /web/nav/command (std_msgs/String, JSON) → {"op": "mapping" | "save" | "navigate" | "stop", "name"?}
//   /nav/state       (std_msgs/String, JSON) ← {mode, map, maps, busy, message, maps_dir}
import { useEffect, useRef, useState } from 'react';
import { rosClient } from '../../ros/ros';
import type { ConnStatus } from '../../ws/types';
import { sendModeCommand, type ModeState } from '../../ros/useRosState';
import { modeSummary } from '../../components/ModeBar';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useConnectThenStart } from '../../ros/useConnectThenStart';

export interface NavManagerState {
  mode: 'off' | 'mapping' | 'navigation';
  map: string;
  busy: boolean;
  message: string;
  maps_dir: string;
}

/** nav_manager's state while the nav mode runs (its last /nav/state stays latched
 *  after it stops, so it is ignored otherwise). */
export function useNavManager(rosStatus: ConnStatus, active: boolean): NavManagerState | null {
  const [latest, setLatest] = useState<NavManagerState | null>(null);
  useEffect(() => {
    if (rosStatus !== 'connected') { setLatest(null); return; }
    return rosClient.subscribe<{ data: string }>('/nav/state', 'std_msgs/String', m => {
      try { setLatest(JSON.parse(m.data) as NavManagerState); } catch { /* ignore */ }
    });
  }, [rosStatus]);
  return active ? latest : null;
}

const sendNav = (cmd: Record<string, unknown>) =>
  rosClient.publishWeb('/nav/command', 'std_msgs/String', { data: JSON.stringify(cmd) });

/** the value of "a new map by SLAM" in mode_manager's start command */
export const NEW_MAP = '';

/** The saved map to keep selected: the current one while it still exists, else the newest. */
export function pickStartMap(current: string | null, maps: { name: string }[]): string {
  if (current === NEW_MAP || (current && maps.some(m => m.name === current))) return current;
  return maps[0]?.name ?? NEW_MAP;
}

function defaultName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `map_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function savedAt(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

const TONE_COLOR = { ok: 'var(--green)', busy: 'var(--orange)', off: 'var(--dim)', err: 'var(--accent)' };

interface PanelProps {
  rosStatus: ConnStatus;
  host: string;              // brain-ros, connected to by a Start button
  mode: ModeState | null;
  nm: NavManagerState | null;
}

/** what is running, in this sub-tab's words */
function StatusLine({ rosStatus, mode, nm }: PanelProps) {
  let { text, tone } = modeSummary(rosStatus, mode);
  if (nm && mode?.mode === 'nav' && mode.status === 'running') {
    text = nm.mode === 'mapping' ? 'SLAM: building a map'
      : nm.mode === 'navigation' ? `Navigation: on ${nm.map}`
      : 'Nav2 running, no map';
    if (nm.busy) { text += ' (working…)'; tone = 'busy'; }
  }
  return (
    <>
      <div className="mode-bar">
        <span className="mode-dot" style={{ background: TONE_COLOR[tone] }} />
        <span className="mode-text" title={mode?.message}>{text}</span>
      </div>
      {nm?.message && <div className="nav-hint">{nm.message}</div>}
    </>
  );
}

function canCommand({ rosStatus, mode, nm }: PanelProps) {
  const busy = mode?.status === 'starting' || mode?.status === 'stopping' || !!nm?.busy;
  const navRunning = mode?.mode === 'nav' && mode.status === 'running';
  // while nav runs, switching goes through nav_manager, which must have reported in
  return rosStatus === 'connected' && !!mode && !busy && (!navRunning || !!nm);
}

/** The one Start / Stop button: Stop while this sub-tab's side (SLAM or AMCL) runs,
 *  else Start (which stops Motion Plan, or switches over from the other side). */
export function toggleState(want: 'mapping' | 'navigation', mode: ModeState | null, nm: NavManagerState | null):
  'start' | 'stop' | 'starting' | 'stopping' {
  if (mode?.mode === 'nav' && mode.status === 'starting') return 'starting';
  if (mode?.status === 'stopping') return 'stopping';
  return mode?.mode === 'nav' && mode.status === 'running' && nm?.mode === want ? 'stop' : 'start';
}

/** The warning to confirm before starting one side while the other runs, or null. */
export function switchWarning(want: 'mapping' | 'navigation', mode: ModeState | null,
  nm: NavManagerState | null, pick = ''): string | null {
  if (!(mode?.mode === 'nav' && mode.status === 'running') || !nm) return null;
  if (want === 'mapping' && nm.mode === 'navigation') {
    return `Navigation on "${nm.map}" is running. Stop it and start SLAM?`;
  }
  if (want === 'navigation' && nm.mode === 'mapping') {
    return `SLAM is running. Stop it and start navigation on "${pick}"? A map you have not saved will be lost.`;
  }
  return null;
}

function ToggleButton({ p, want, label, onStart, startOk = true, title, warning }: {
  p: PanelProps; want: 'mapping' | 'navigation'; label: string;
  onStart: () => void; startOk?: boolean; title?: string;
  warning?: string | null;   // asked first when set
}) {
  const st = toggleState(want, p.mode, p.nm);
  const [asking, setAsking] = useState(false);
  useEffect(() => { if (!warning) setAsking(false); }, [warning]);
  const ok = st === 'start' && canCommand(p) && startOk;
  // also run after connecting, with brain-ros's state by then: confirm a switch, or
  // do nothing when this side already runs (or, say, there is no saved map)
  const act = () => { if (!ok) return; if (warning) setAsking(true); else onStart(); };
  const { press, connecting } = useConnectThenStart(p.host, canCommand(p), act);
  const connected = p.rosStatus === 'connected';
  if (st === 'stop') {
    return (
      <button className="danger" onClick={() => sendModeCommand({ op: 'stop' })}
        disabled={p.rosStatus !== 'connected' || !!p.nm?.busy}>Stop</button>
    );
  }
  return (
    <>
      <button onClick={press} disabled={connecting || asking || (connected && !ok)}
        title={connected ? title : 'connects to brain-ros, then starts'}>
        {connecting ? 'Connecting…' : st === 'starting' ? 'Starting…' : st === 'stopping' ? 'Stopping…' : label}
      </button>
      {asking && warning && (
        <div className="nav-confirm" role="alertdialog" aria-label="confirm switch">
          <span>{warning}</span>
          <div className="nav-row">
            <button className="danger" disabled={!ok}
              onClick={() => { setAsking(false); onStart(); }}>Stop and start</button>
            <button onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Where a "save, then stop" stands, from nav_manager's state: it is busy while
 *  saving and sets map to the name once map_saver has written the file. Only a state
 *  after the busy one counts (an older one may name a map saved earlier). */
export function saveOutcome(nm: NavManagerState | null, name: string, sawBusy: boolean): 'done' | 'failed' | 'waiting' {
  if (!nm) return 'failed';
  if (nm.busy || !sawBusy) return 'waiting';
  return nm.map === name && nm.message.startsWith('saved map') ? 'done' : 'failed';
}

export function SlamPanel(p: PanelProps) {
  const { mode, nm } = p;
  const [name, setName] = useState(defaultName);
  const ready = canCommand(p);
  const navRunning = mode?.mode === 'nav' && mode.status === 'running';
  const mapping = nm?.mode === 'mapping';
  const nameOk = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(name);
  const other = mode && mode.mode !== 'none' && mode.mode !== 'nav';

  const start = () => (navRunning
    ? sendNav({ op: 'mapping' })
    : sendModeCommand({ op: 'start', mode: 'nav', map: NEW_MAP }));

  // Save, then stop SLAM once the map is written (kept running when saving failed)
  const pending = useRef<{ name: string; sawBusy: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const save = () => {
    pending.current = { name, sawBusy: false };
    setSaving(true);
    sendNav({ op: 'save', name });
  };
  useEffect(() => {
    if (!saving) return;
    // no answer from nav_manager (map_saver gives up after 40 s): stop waiting
    const t = setTimeout(() => { pending.current = null; setSaving(false); }, 60000);
    return () => clearTimeout(t);
  }, [saving]);
  useEffect(() => {
    const w = pending.current;
    if (!w) return;
    if (nm?.busy) w.sawBusy = true;
    const out = saveOutcome(nm, w.name, w.sawBusy);
    if (out === 'waiting') return;
    pending.current = null;
    setSaving(false);
    if (out === 'done') {
      sendModeCommand({ op: 'stop' });
      setName(defaultName());
    }
  }, [nm]);

  return (
    <>
      <StatusLine {...p} />
      <div className="nav-step">1. Build a map</div>
      <div className="nav-row">
        <ToggleButton p={p} want="mapping" label="Start SLAM" onStart={start}
          warning={switchWarning('mapping', mode, nm)}
          title={other ? 'stops Motion Plan first' : 'Start SLAM with an empty map'} />
      </div>
      <div className="nav-hint">Drive smabo around with the Drive tab; the map grows in the view.</div>

      <div className="nav-step">2. Save it</div>
      <div className="nav-row">
        <input value={name} onChange={e => setName(e.target.value)} aria-label="map name"
          className={nameOk ? '' : 'invalid'} style={{ flex: 1, minWidth: 0 }} />
        <button onClick={save} disabled={!ready || !mapping || !nameOk || saving}
          title={mapping ? 'Save the map, then stop SLAM' : 'Start SLAM first'}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="nav-hint">Saving stops SLAM; navigate on the map in the Navigation tab.</div>
      {!nameOk && <div className="nav-hint">letters, digits, _ . - only</div>}
      {nm?.maps_dir && <div className="nav-hint">saved in {nm.maps_dir}</div>}
    </>
  );
}

export function NavPanel(p: PanelProps) {
  const { mode, nm } = p;
  const maps = mode?.maps ?? [];
  const [chosen, setChosen] = usePersistentState<string | null>('nav.mapPick', null,
    (v): v is string | null => v === null || typeof v === 'string');
  const navRunning = mode?.mode === 'nav' && mode.status === 'running';
  const navigating = navRunning && nm?.mode === 'navigation';
  // while navigating, the map in use (stop to pick another)
  const pick = navigating && nm ? nm.map : pickStartMap(chosen === NEW_MAP ? null : chosen, maps);
  const other = mode && mode.mode !== 'none' && mode.mode !== 'nav';

  const start = () => (navRunning
    ? sendNav({ op: 'navigate', name: pick })
    : sendModeCommand({ op: 'start', mode: 'nav', map: pick }));

  return (
    <>
      <StatusLine {...p} />
      <div className="nav-step">Map</div>
      <div className="nav-row">
        <select value={pick} onChange={e => setChosen(e.target.value)} disabled={!maps.length || navigating}
          aria-label="saved map" style={{ flex: 1, minWidth: 0 }}>
          {!maps.length && <option value="">(no saved maps — build one in SLAM)</option>}
          {maps.map(m => (
            <option key={m.name} value={m.name}>{m.name}{m.saved ? ` · ${savedAt(m.saved)}` : ''}</option>
          ))}
        </select>
      </div>
      <div className="nav-row">
        <ToggleButton p={p} want="navigation" label="Start Navigation" onStart={start} startOk={!!pick}
          warning={switchWarning('navigation', mode, nm, pick)}
          title={other ? 'stops Motion Plan first' : 'Navigate on this map (AMCL)'} />
      </div>
    </>
  );
}
