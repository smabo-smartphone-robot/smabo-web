// Which smabo-brain-ros mode is running (navigation, motion planning or none),
// with Start / Stop for the mode this tab needs. Only one mode runs at a time:
// starting one stops the other (mode_manager), since each drives its own robot.
import type { ConnStatus } from '../ws/types';
import { sendModeCommand, type ModeState, type RosMode } from '../ros/useRosState';

const MODE_NAME: Record<RosMode, string> = { none: 'none', nav: 'Navigation', plan: 'Motion Plan' };

export function modeSummary(rosStatus: ConnStatus, s: ModeState | null): { text: string; tone: 'ok' | 'busy' | 'off' | 'err' } {
  if (rosStatus !== 'connected') return { text: 'brain-ros not connected (start it with docker compose up, then Connect ROS)', tone: 'off' };
  if (!s) return { text: 'no mode manager on this brain-ros (rebuild the image)', tone: 'err' };
  if (s.status === 'error') return { text: `error: ${s.message}`, tone: 'err' };
  if (s.mode === 'none') return { text: 'no mode running', tone: 'off' };
  const name = MODE_NAME[s.mode];
  if (s.status === 'starting') return { text: `${name}: starting…`, tone: 'busy' };
  if (s.status === 'stopping') return { text: `${name}: stopping…`, tone: 'busy' };
  return { text: `${name}: running`, tone: 'ok' };
}

const TONE_COLOR = { ok: 'var(--green)', busy: 'var(--orange)', off: 'var(--dim)', err: 'var(--accent)' };

export function ModeBar({ want, rosStatus, state }: { want: 'nav' | 'plan'; rosStatus: ConnStatus; state: ModeState | null }) {
  const { text, tone } = modeSummary(rosStatus, state);
  const busy = state?.status === 'starting' || state?.status === 'stopping';
  const ready = rosStatus === 'connected' && !!state && !busy;
  const mine = state?.mode === want && state.status === 'running';
  const other = state && state.mode !== 'none' && state.mode !== want ? MODE_NAME[state.mode] : '';
  const start = () => sendModeCommand({ op: 'start', mode: want });
  return (
    <div className="mode-bar">
      <span className="mode-dot" style={{ background: TONE_COLOR[tone] }} />
      <span className="mode-text" title={state?.message}>{text}</span>
      <button onClick={start} disabled={!ready || mine}
        title={other ? `stops ${other} first` : undefined}>
        Start {MODE_NAME[want]}
      </button>
      <button className="danger" onClick={() => sendModeCommand({ op: 'stop' })}
        disabled={!ready || state?.mode === 'none'}>
        Stop
      </button>
    </div>
  );
}
