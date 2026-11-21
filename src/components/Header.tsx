import { useBrain } from '../store/useBrain';
import { useTheme, type ThemePref } from '../theme';
import { useState } from 'react';
import { ConnectionDialog } from './ConnectionDialog';

const THEME_OPTIONS: { pref: ThemePref; label: string; title: string }[] = [
  { pref: 'auto', label: 'Auto', title: 'Follow the OS setting' },
  { pref: 'light', label: 'Light', title: 'Light theme' },
  { pref: 'dark', label: 'Dark', title: 'Dark theme' },
];

export function Header() {
  const status = useBrain(s => s.status);
  const host = useBrain(s => s.host);
  const esp32Host = useBrain(s => s.esp32Host);
  const msgRate = useBrain(s => s.msgRate);
  const protocolWarnings = useBrain(s => s.protocolWarnings);
  const warnings = Object.values(protocolWarnings);
  const setHost = useBrain(s => s.setHost);
  const connect = useBrain(s => s.connect);
  const setEsp32Host = useBrain(s => s.setEsp32Host);
  const refreshConfig = useBrain(s => s.refreshConfig);
  const themePref = useTheme(s => s.pref);
  const setThemePref = useTheme(s => s.setPref);
  const [connOpen, setConnOpen] = useState(false);

  const isConnectedOrConnecting = status === 'connected' || status === 'connecting';
  const btnLabel = isConnectedOrConnecting ? 'Disconnect' : 'Connect';

  return (
    <header>
      <div className="hrow">
        <h1>smabo<span className="brand-sub">web</span></h1>
        <button onClick={() => setConnOpen(true)} title="Connection checks and paired devices">
          Connection
        </button>
        <div className="host-group">
        <div className={`dot ${status}`} title={status} />
        <input
          type="text"
          value={host}
          onChange={e => setHost(e.target.value)}
          placeholder="brain host:port"
          style={{ width: 160 }}
          onKeyDown={e => { if (e.key === 'Enter') connect(); }}
        />
        <button className={isConnectedOrConnecting ? '' : 'primary'} onClick={connect}>{btnLabel}</button>
        </div>

        <div className="host-group">
        <input
          type="text"
          value={esp32Host}
          onChange={e => setEsp32Host(e.target.value)}
          placeholder="esp32 host (REST)"
          style={{ width: 160 }}
          onKeyDown={e => { if (e.key === 'Enter') refreshConfig(); }}
        />
        <button onClick={refreshConfig} disabled={!esp32Host}>Get Config</button>
        </div>

        <span className="msg-rate">{msgRate} msg/s</span>

        {warnings.length > 0 && (
          <span className="protocol-warn" role="status" title={warnings.join('\n')}>
            Protocol mismatch{warnings.length > 1 ? ` (${warnings.length})` : ''}
          </span>
        )}

        <div className="theme-seg" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map(o => (
            <button
              key={o.pref}
              role="radio"
              aria-checked={themePref === o.pref}
              className={themePref === o.pref ? 'on' : ''}
              title={o.title}
              onClick={() => setThemePref(o.pref)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {connOpen && <ConnectionDialog onClose={() => setConnOpen(false)} />}
    </header>
  );
}
