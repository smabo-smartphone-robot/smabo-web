// Which smabo-brain-ros mode is running (navigation, motion planning or none),
// with Start / Stop for the mode this tab needs. Only one mode runs at a time:
// starting one stops the other (mode_manager), since each drives its own robot.
import { useEffect, useState } from 'react';
import type { ConnStatus } from '../ws/types';
import { sendModeCommand, type ModeState, type RosMode } from '../ros/useRosState';
import { useConnectThenStart } from '../ros/useConnectThenStart';

const MODE_NAME: Record<RosMode, string> = { none: 'none', nav: 'Navigation', plan: 'Motion Plan' };

export function modeSummary(rosStatus: ConnStatus, s: ModeState | null): { text: string; tone: 'ok' | 'busy' | 'off' | 'err' } {
  if (rosStatus === 'connecting') return { text: 'connecting to brain-ros…', tone: 'busy' };
  if (rosStatus === 'error') return { text: 'brain-ros not reachable (start it with docker compose up)', tone: 'err' };
  if (rosStatus !== 'connected') return { text: 'brain-ros not connected (Start connects to it)', tone: 'off' };
  if (!s) return { text: 'no mode manager on this brain-ros (rebuild the image)', tone: 'err' };
  if (s.status === 'error') return { text: `error: ${s.message}`, tone: 'err' };
  if (s.mode === 'none') return { text: 'no mode running', tone: 'off' };
  const name = MODE_NAME[s.mode];
  if (s.status === 'starting') return { text: `${name}: starting…`, tone: 'busy' };
  if (s.status === 'stopping') return { text: `${name}: stopping…`, tone: 'busy' };
  return { text: `${name}: running`, tone: 'ok' };
}

/** The warning to confirm before this tab's Start stops the other mode, or null —
 *  as the Navigation tab confirms a switch between SLAM and navigation. */
export function switchAwayWarning(want: RosMode, s: ModeState | null): string | null {
  if (!s || s.mode === 'none' || s.mode === want || s.status !== 'running') return null;
  const lost = s.mode === 'nav' ? ' A SLAM map you have not saved will be lost.' : '';
  return `${MODE_NAME[s.mode]} is running. Stop it and start ${MODE_NAME[want]}?${lost}`;
}

const TONE_COLOR = { ok: 'var(--green)', busy: 'var(--orange)', off: 'var(--dim)', err: 'var(--accent)' };

export function ModeBar({ want, rosStatus, state, host }: { want: 'nav' | 'plan'; rosStatus: ConnStatus; state: ModeState | null; host: string }) {
  const { text, tone } = modeSummary(rosStatus, state);
  const busy = state?.status === 'starting' || state?.status === 'stopping';
  const ready = rosStatus === 'connected' && !!state && !busy;
  const mine = state?.mode === want && state.status === 'running';
  const other = state && state.mode !== 'none' && state.mode !== want ? MODE_NAME[state.mode] : '';
  const warning = switchAwayWarning(want, state);
  const [asking, setAsking] = useState(false);
  useEffect(() => { if (!warning) setAsking(false); }, [warning]);
  const send = () => sendModeCommand({ op: 'start', mode: want });
  // after connecting, the latest state decides: nothing to do when this mode already
  // runs, and a confirm first when it would stop the other mode
  const start = () => { if (mine) return; if (warning) setAsking(true); else send(); };
  const { press, connecting } = useConnectThenStart(host, ready, start);
  const connected = rosStatus === 'connected';
  return (
    <div className="mode-bar">
      <span className="mode-dot" style={{ background: TONE_COLOR[tone] }} />
      <span className="mode-text" title={state?.message}>{text}</span>
      <button onClick={press} disabled={connecting || asking || (connected && (!ready || mine))}
        title={other ? `stops ${other} first` : connected ? undefined : 'connects to brain-ros, then starts'}>
        {connecting ? 'Connecting…' : `Start ${MODE_NAME[want]}`}
      </button>
      {/* stops this tab's mode only; the other mode is stopped from its own tab */}
      <button className="danger" onClick={() => sendModeCommand({ op: 'stop' })}
        disabled={!ready || state?.mode !== want}>
        Stop
      </button>
      {asking && warning && (
        <div className="nav-confirm" role="alertdialog" aria-label="confirm switch">
          <span>{warning}</span>
          <div className="nav-row">
            <button className="danger" disabled={!ready}
              onClick={() => { setAsking(false); send(); }}>Stop and start</button>
            <button onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
