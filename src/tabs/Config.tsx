import React, { useState, useEffect } from 'react';
import { useBrain } from '../store/useBrain';
import { useDragOrder } from '../hooks/useDragOrder';

// ── ESP32 connectivity check ─────────────────────────────────
// Verifies two paths:
//   1. REST (web → ESP32 direct): GET /config ping
//   2. WS telemetry (ESP32 → brain → web): freshness of /odom and /joint_states
function Esp32CommCheck() {
  const esp32Host = useBrain(s => s.esp32Host);
  const esp32Ping = useBrain(s => s.esp32Ping);
  const esp32WsPing = useBrain(s => s.esp32WsPing);
  const status = useBrain(s => s.status);
  const pingEsp32 = useBrain(s => s.pingEsp32);
  const pingEsp32Ws = useBrain(s => s.pingEsp32Ws);

  const brainConnected = status === 'connected';

  const restDot = esp32Ping == null ? '' : esp32Ping.ok ? 'live' : 'err';
  const restText = esp32Ping == null
    ? 'Not checked'
    : esp32Ping.ok
      ? `OK ${esp32Ping.latencyMs}ms`
      : 'No response';

  const wsPingDot = esp32WsPing == null ? '' : esp32WsPing.ok ? 'live' : 'err';
  const wsPingText = esp32WsPing == null
    ? 'Not checked'
    : esp32WsPing.ok
      ? `OK ${esp32WsPing.latencyMs}ms`
      : 'No response';

  return (
    <div className="card esp32-check">
      <div className="card-title">ESP32 connection check</div>

      <div className="esp32-check-row">
        <span className={`live-dot ${restDot}`} />
        <span className="esp32-check-label" title="Direct HTTP from web → ESP32 (GET /config)">
          REST (web↔ESP32)
        </span>
        <span className="esp32-check-val">{restText}</span>
        <button
          style={{ fontSize: '.72rem', padding: '2px 10px' }}
          disabled={!esp32Host}
          onClick={pingEsp32}
        >Ping</button>
      </div>

      <div className="esp32-check-row">
        <span className={`live-dot ${wsPingDot}`} />
        <span className="esp32-check-label"
          title="Echoes /ping→/pong via the brain. Only works while web↔brain is connected, so the result indicates brain↔ESP32 WS connectivity.">
          WS (brain↔ESP32)
        </span>
        <span className="esp32-check-val">{wsPingText}</span>
        <button
          style={{ fontSize: '.72rem', padding: '2px 10px' }}
          disabled={!brainConnected}
          onClick={pingEsp32Ws}
        >Ping</button>
      </div>

      {!esp32Host && (
        <div className="expr-hint" style={{ marginTop: 4 }}>
          Set the ESP32 host in the header to enable REST Ping. WS ping needs the brain connected.
        </div>
      )}
    </div>
  );
}

// ── field components (legacy — kept for Advanced staged inputs only) ─────

// ── type helpers ─────────────────────────────────────────────

function rec(v: unknown): Record<string, unknown> {
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? v as T[] : [];
}
function n(v: unknown, def = 0): number {
  return typeof v === 'number' ? v : def;
}
function b(v: unknown, def = false): boolean {
  return typeof v === 'boolean' ? v : def;
}
function s(v: unknown, def = ''): string {
  return typeof v === 'string' ? v : def;
}

// ── SectionHeader ────────────────────────────────────────────
// Section heading that acts as a visual table-of-contents marker

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '.72rem', fontWeight: 700, color: 'var(--ink)',
      borderLeft: '3px solid var(--accent)', paddingLeft: 8,
      marginTop: 10, marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

// ── InlineStr ────────────────────────────────────────────────

function InlineStr({ value, onChange, isPassword, w = 120 }: {
  value: string; onChange: (v: string) => void; isPassword?: boolean; w?: number;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <input
      type={isPassword ? 'password' : 'text'} value={local}
      style={{ width: w, fontSize: '.72rem', padding: '1px 4px',
               background: 'transparent', border: '1px solid var(--line)',
               borderRadius: 3, color: 'var(--ink)', boxSizing: 'border-box' }}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onChange(local); }}
      onKeyDown={e => { if (e.key === 'Enter' && local !== value) onChange(local); }}
    />
  );
}

// ── InlineNum ────────────────────────────────────────────────
// Number input that commits on blur or Enter — no Send button needed.

function InlineNum({ value, onChange, isInt, w = 50 }: {
  value: number; onChange: (v: number) => void; isInt?: boolean; w?: number | string;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = () => {
    const v = isInt ? parseInt(local, 10) : parseFloat(local);
    if (!isNaN(v) && v !== value) onChange(v);
  };
  return (
    <input
      type="text" inputMode={isInt ? 'numeric' : 'decimal'} value={local}
      style={{ width: w, fontSize: '.72rem', padding: '1px 4px', textAlign: 'right',
               background: 'transparent', border: '1px solid var(--line)',
               borderRadius: 3, color: 'var(--ink)', boxSizing: 'border-box' }}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); }}
    />
  );
}

// ── ServoTable ────────────────────────────────────────────────
// Inline-editable table: one row per servo, all fields always visible.

function ServoTable({ joints, rgroups, sorted, patch, removeConfig, setServoEnabled, handleProps, dropProps }: {
  joints: Record<string, unknown>;
  rgroups: Record<string, unknown>[];
  sorted: string[];
  patch: (v: Record<string, unknown>) => void;
  removeConfig: (v: Record<string, unknown>) => void;
  setServoEnabled: (name: string, enabled: boolean) => void;
  handleProps: (name: string) => Record<string, unknown>;
  dropProps: (name: string, allNames: string[]) => Record<string, unknown>;
}) {
  const allNames = Object.keys(joints);

  const behaviorFor = (groups: Record<string, unknown>[]) =>
    groups.some(g => arr<string>(g['joints']).length > 0) ? 'random' : 'manual';

  const without = (name: string): Record<string, unknown>[] =>
    rgroups.map(g => ({ ...g, joints: arr<string>(g['joints']).filter(j => j !== name) }));

  const setMode = (name: string, val: 'manual' | 'random') => {
    const w = without(name);
    if (val === 'manual') {
      patch({ servos: { behavior: behaviorFor(w), random_groups: w } });
    } else {
      // assign to first group when switching to random
      const first = rgroups[0] ? s(rgroups[0]['name']) : null;
      if (!first) return;
      const updated = w.map(g => s(g['name']) === first ? { ...g, joints: [...arr<string>(g['joints']), name] } : g);
      patch({ servos: { behavior: 'random', random_groups: updated } });
    }
  };

  const setGroup = (name: string, groupName: string) => {
    const w = without(name);
    const updated = w.map(g => s(g['name']) === groupName ? { ...g, joints: [...arr<string>(g['joints']), name] } : g);
    patch({ servos: { behavior: 'random', random_groups: updated } });
  };

  // th padding-right=5px aligns header text with input digits (input: padding-right 4px + border 1px)
  const th: React.CSSProperties = {
    fontSize: '.68rem', color: 'var(--dim)', fontWeight: 600,
    padding: '2px 5px 6px 6px', whiteSpace: 'nowrap', textAlign: 'right',
  };
  const td: React.CSSProperties = { padding: '2px 0 2px 6px' };
  const selStyle: React.CSSProperties = { fontSize: '.72rem', padding: '1px 2px', background: 'transparent',
                                           border: '1px solid var(--line)', borderRadius: 3, color: 'var(--ink)',
                                           textAlign: 'right' };

  const numTh: React.CSSProperties = { ...th, minWidth: 56, width: 56 };

  return (
    <div style={{ overflowX: 'auto', marginBottom: 4 }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'auto', fontSize: '.72rem' }}>
        <thead>
          <tr>
            <th style={{ ...th, padding: '2px 6px 6px 0', width: 20 }}></th>
            <th style={{ ...th, textAlign: 'center', width: 28 }}></th>
            <th style={{ ...th, textAlign: 'left', width: 100 }}>name</th>
            <th style={numTh}>ch</th>
            <th style={numTh}>min°</th>
            <th style={numTh}>max°</th>
            <th style={numTh}>default°</th>
            <th style={numTh}>speed</th>
            <th style={numTh}>min µs</th>
            <th style={numTh}>max µs</th>
            <th style={{ ...th, textAlign: 'center', width: 44 }}>invert</th>
            <th style={{ ...th, whiteSpace: 'nowrap' }}>mode</th>
            <th style={th}>group</th>
            <th style={{ ...th, width: 26 }}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(name => {
            const jv = joints[name];
            if (!jv) return null;
            const j = rec(jv);
            const enabled = j['enabled'] !== false;
            const inGroup = rgroups.find(g => arr<string>(g['joints']).includes(name));
            const jp = (f: string, v: unknown) => patch({ servos: { joints: { [name]: { [f]: v } } } });
            return (
              <tr key={name} {...dropProps(name, allNames)}>
                <td style={{ ...td, padding: '2px 6px 2px 0', cursor: 'grab', color: 'var(--muted)' }}
                  {...handleProps(name)}>⠿</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <input type="checkbox" checked={enabled}
                    onChange={() => setServoEnabled(name, !enabled)} />
                </td>
                <td style={{ ...td, fontSize: '.76rem', color: enabled ? 'var(--ink)' : 'var(--muted)',
                             maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </td>
                <td style={td}><InlineNum value={n(j['channel'])}        isInt w="100%" onChange={v => jp('channel',    v)} /></td>
                <td style={td}><InlineNum value={n(j['min_angle'],  -90)}       w="100%" onChange={v => jp('min_angle',  v)} /></td>
                <td style={td}><InlineNum value={n(j['max_angle'],   90)}       w="100%" onChange={v => jp('max_angle',  v)} /></td>
                <td style={td}><InlineNum value={n(j['init_angle'])}            w="100%" onChange={v => jp('init_angle', v)} /></td>
                <td style={td}><InlineNum value={n(j['max_speed'],   90)}       w="100%" onChange={v => jp('max_speed',  v)} /></td>
                <td style={td}><InlineNum value={n(j['min_us'],     500)} isInt w="100%" onChange={v => jp('min_us',     v)} /></td>
                <td style={td}><InlineNum value={n(j['max_us'],    2500)} isInt w="100%" onChange={v => jp('max_us',     v)} /></td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <input type="checkbox" checked={b(j['invert'])}
                    onChange={e => jp('invert', e.target.checked)} />
                </td>
                <td style={td}>
                  <select value={inGroup ? 'random' : 'manual'}
                    style={{ ...selStyle, width: '100%' }}
                    onChange={e => setMode(name, e.target.value as 'manual' | 'random')}>
                    <option value="manual">manual</option>
                    <option value="random" disabled={rgroups.length === 0}>random</option>
                  </select>
                </td>
                <td style={td}>
                  <select value={inGroup ? s(inGroup['name']) : ''}
                    disabled={!inGroup}
                    style={{ ...selStyle, width: '100%', color: inGroup ? 'var(--orange)' : 'var(--muted)' }}
                    onChange={e => setGroup(name, e.target.value)}>
                    {!inGroup && <option value="">—</option>}
                    {rgroups.map(g => <option key={s(g['name'])} value={s(g['name'])}>{s(g['name'])}</option>)}
                  </select>
                </td>
                <td style={{ ...td, paddingLeft: 4 }}>
                  <button
                    style={{ fontSize: '.65rem', padding: '0 4px', lineHeight: '18px',
                             background: 'transparent', border: '1px solid var(--line)',
                             borderRadius: 3, color: 'var(--muted)', cursor: 'pointer' }}
                    onClick={() => { if (confirm(`Delete "${name}"?`)) removeConfig({ servos: { joints: { [name]: null } } }); }}>×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── RandomGroupSettings ──────────────────────────────────────

function RandomGroupSettings({ rgroups, patch }: {
  rgroups: Record<string, unknown>[];
  patch: (v: Record<string, unknown>) => void;
}) {
  if (rgroups.length === 0) return null;

  const behaviorFor = (groups: Record<string, unknown>[]) =>
    groups.some(g => arr<string>(g['joints']).length > 0) ? 'random' : 'manual';

  const updGroup = (name: string, fields: Record<string, unknown>) => {
    const updated = rgroups.map(g =>
      s(g['name']) === name ? { ...g, ...fields } : g
    );
    patch({ servos: { behavior: 'random', random_groups: updated } });
  };

  const deleteGroup = (name: string) => {
    if (!confirm(`Delete group "${name}"?`)) return;
    const updated = rgroups.filter(g => s(g['name']) !== name);
    patch({ servos: { behavior: behaviorFor(updated), random_groups: updated } });
  };

  const th: React.CSSProperties = {
    fontSize: '.68rem', color: 'var(--dim)', fontWeight: 600,
    padding: '2px 5px 6px 6px', whiteSpace: 'nowrap', textAlign: 'right',
  };
  const td: React.CSSProperties = { padding: '2px 0 2px 6px' };

  const numTh: React.CSSProperties = { ...th, width: 88 };

  return (
    <>
      <SectionHeader>Random groups</SectionHeader>
      <div style={{ overflowX: 'auto', marginBottom: 4 }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '.72rem' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', paddingLeft: 0 }}>name</th>
              <th style={{ ...th, textAlign: 'left' }}>joints</th>
              <th style={numTh}>interval min</th>
              <th style={numTh}>interval max</th>
              <th style={numTh}>saccade</th>
              <th style={numTh}>drift</th>
              <th style={numTh}>center pull</th>
              <th style={numTh}>drift speed</th>
              <th style={numTh}>long pause</th>
              <th style={{ ...th, width: 26 }}></th>
            </tr>
          </thead>
          <tbody>
            {rgroups.map(g => {
              const gn  = s(g['name']);
              const iv  = arr<number>(g['interval']);
              const jts = arr<string>(g['joints']);
              return (
                <tr key={gn}>
                  <td style={{ ...td, paddingLeft: 0, fontSize: '.76rem', color: 'var(--orange)',
                               overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gn}</td>
                  <td style={{ ...td, fontSize: '.68rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {jts.length > 0 ? jts.join(', ') : '—'}
                  </td>
                  <td style={td}><InlineNum value={n(iv[0], 1)}                  w="100%" onChange={v => updGroup(gn, { interval: [v, n(iv[1], 3)] })} /></td>
                  <td style={td}><InlineNum value={n(iv[1], 3)}                  w="100%" onChange={v => updGroup(gn, { interval: [n(iv[0], 1), v] })} /></td>
                  <td style={td}><InlineNum value={n(g['saccade_prob'],   0.18)} w="100%" onChange={v => updGroup(gn, { saccade_prob: v })} /></td>
                  <td style={td}><InlineNum value={n(g['drift'],          0.07)} w="100%" onChange={v => updGroup(gn, { drift: v })} /></td>
                  <td style={td}><InlineNum value={n(g['center_pull'],    0.12)} w="100%" onChange={v => updGroup(gn, { center_pull: v })} /></td>
                  <td style={td}><InlineNum value={n(g['drift_speed'],    0.40)} w="100%" onChange={v => updGroup(gn, { drift_speed: v })} /></td>
                  <td style={td}><InlineNum value={n(g['long_pause_prob'],0.22)} w="100%" onChange={v => updGroup(gn, { long_pause_prob: v })} /></td>
                  <td style={{ ...td, paddingLeft: 4 }}>
                    <button
                      style={{ fontSize: '.65rem', padding: '0 4px', lineHeight: '18px',
                               background: 'transparent', border: '1px solid var(--line)',
                               borderRadius: 3, color: 'var(--muted)', cursor: 'pointer' }}
                      onClick={() => deleteGroup(gn)}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button style={{ fontSize: '.75rem', marginTop: 4 }} onClick={() => {
        const gname = prompt('Group name:')?.trim();
        if (!gname) return;
        if (rgroups.some(g => s(g['name']) === gname)) {
          alert(`Group "${gname}" already exists.`);
          return;
        }
        const updated = [...rgroups, { name: gname, joints: [], interval: [1, 3] }];
        patch({ servos: { behavior: behaviorFor(updated), random_groups: updated } });
      }}>+ Add Random group</button>
    </>
  );
}

// ── main ─────────────────────────────────────────────────────

export function Config() {
  const esp32Config = useBrain(st => st.esp32Config);
  const patchConfig = useBrain(st => st.patchConfig);
  const removeConfig = useBrain(st => st.removeConfig);
  const setMode = useBrain(st => st.setMode);
  const setServoEnabled = useBrain(st => st.setServoEnabled);
  const refreshConfig = useBrain(st => st.refreshConfig);
  const { sort: sortServos, handleProps: servoHandle, dropProps: servoDrop, order: savedServoOrder } = useDragOrder(
    'smabo-config-servos-order',
    (newOrder) => patchConfig({ servos: { joint_order: newOrder } }),
  );

  // staged holds a nested patch for the Advanced section
  const [staged, setStaged] = useState<Record<string, unknown>>({});
  const stagedCount = Object.keys(staged).length;

  if (!esp32Config) {
    return (
      <div className="config-layout">
        <Esp32CommCheck />
        <div className="no-data" style={{ padding: 16, gap: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span>Config not received (set the ESP32 host in the header)</span>
          <button onClick={refreshConfig}>Get config</button>
        </div>
      </div>
    );
  }

  const cfg = esp32Config;

  // Parsed config sections
  const modes      = rec(cfg['modes']);
  const svCfg      = rec(cfg['servos']);
  const joints     = rec(svCfg['joints']);
  const jointOrder = arr<string>(svCfg['joint_order']);
  const rgroups    = arr<Record<string, unknown>>(svCfg['random_groups']);
  const dc         = rec(cfg['dc']);
  const dcPins     = rec(dc['pins']);
  const enc        = rec(cfg['encoder']);
  const encLeft    = rec(enc['left']);
  const encRight   = rec(enc['right']);
  const encCov     = rec(enc['covariance']);
  const i2c        = rec(cfg['i2c']);
  const pca        = rec(cfg['pca9685']);
  const wifi       = rec(cfg['wifi']);
  const brainCfg   = rec(cfg['brain']);
  const lidar      = rec(cfg['lidar']);

  const patch = (p: Record<string, unknown>) => patchConfig(p);
  const sendMode = (m: Record<string, unknown>) => setMode(m);

  // Stage helpers for Advanced section
  type MergeSetFn = (prev: Record<string, unknown>) => Record<string, unknown>;
  const stage = (fn: MergeSetFn) => setStaged(fn);

  // Shared layout helpers
  const lbl: React.CSSProperties = { fontSize: '.68rem', color: 'var(--dim)', whiteSpace: 'nowrap' };
  const fg2: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: 'max-content auto',
    columnGap: 10, rowGap: 4, alignItems: 'center', marginBottom: 8,
  };
  const zero: React.CSSProperties = {
    fontSize: '.72rem', color: 'var(--line)', textAlign: 'center',
    padding: '1px 4px', border: '1px solid var(--line)', borderRadius: 3,
    minWidth: 32,
  };
  const stageInput = (w: number, val: number | string, type: 'number' | 'text' | 'password', onChg: (e: React.ChangeEvent<HTMLInputElement>) => void) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input type={type} defaultValue={val} step={type === 'number' ? 1 : undefined}
        style={{ width: w, fontSize: '.72rem', padding: '1px 4px',
                 textAlign: type === 'number' ? 'right' : 'left',
                 background: 'transparent', border: '1px solid var(--line)',
                 borderRadius: 3, color: 'var(--ink)' }}
        onChange={onChg} />
      <span className="stage-badge">staged</span>
    </span>
  );

  return (
    <div className="config-layout">

      <Esp32CommCheck />

      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <button onClick={refreshConfig}>Get config</button>
      </div>

      {/* ── Modes ───────────────────────────────────── */}
      <details open>
        <summary>Modes</summary>
        <div className="config-section">

          {/* servos */}
          <details>
            <summary>
              <span style={{ flex: 1 }}>servos</span>
              <input type="checkbox" checked={b(modes['servos'])}
                onClick={e => e.stopPropagation()}
                onChange={e => sendMode({ ...modes, servos: e.target.checked })} />
            </summary>
            <div className="config-section">
              <SectionHeader>General settings</SectionHeader>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.72rem', marginBottom: 6 }}>
                <span style={lbl}>joint_states_rate</span>
                <InlineNum value={n(svCfg['joint_states_rate'], 10)} isInt w={50}
                  onChange={v => patch({ servos: { joint_states_rate: v } })} />
                <span style={{ color: 'var(--dim)' }}>Hz</span>
              </div>
              <SectionHeader>Servo settings</SectionHeader>
              <ServoTable
                joints={joints}
                rgroups={rgroups}
                sorted={(() => {
                  const names = Object.keys(joints);
                  if (savedServoOrder.length === 0 && jointOrder.length > 0) {
                    return [...jointOrder.filter(n => names.includes(n)), ...names.filter(n => !jointOrder.includes(n))];
                  }
                  return sortServos(names);
                })()}
                patch={patch}
                removeConfig={removeConfig}
                setServoEnabled={setServoEnabled}
                handleProps={servoHandle}
                dropProps={servoDrop}
              />
              <button style={{ fontSize: '.75rem', marginTop: 4, marginBottom: 6 }} onClick={() => {
                const name = prompt('Joint name:');
                if (!name) return;
                patch({ servos: { joints: { [name]: { channel: 0, min_angle: -90, max_angle: 90, init_angle: 0, max_speed: 90, min_us: 500, max_us: 2500, enabled: false } } } });
              }}>+ Add servo</button>
              <RandomGroupSettings rgroups={rgroups} patch={patch} />
            </div>
          </details>

          {/* dc_drive */}
          <details>
            <summary>
              <span style={{ flex: 1 }}>dc_drive</span>
              <input type="checkbox" checked={b(modes['dc_drive'])}
                onClick={e => e.stopPropagation()}
                onChange={e => sendMode({ ...modes, dc_drive: e.target.checked })} />
            </summary>
            <div className="config-section">
              <div style={fg2}>
                <span style={lbl}>max_linear (m/s)</span>
                <InlineNum value={n(dc['max_linear'], 0.3)} w={60} onChange={v => patch({ dc: { max_linear: v } })} />
                <span style={lbl}>max_angular (rad/s)</span>
                <InlineNum value={n(dc['max_angular'], 1.5)} w={60} onChange={v => patch({ dc: { max_angular: v } })} />
                <span style={lbl}>wheel_radius (m)</span>
                <InlineNum value={n(dc['wheel_radius'], 0.03)} w={60} onChange={v => patch({ dc: { wheel_radius: v } })} />
                <span style={lbl}>wheel_separation (m)</span>
                <InlineNum value={n(dc['wheel_separation'], 0.15)} w={60} onChange={v => patch({ dc: { wheel_separation: v } })} />
                <span style={lbl}>pwm_freq (Hz)</span>
                <InlineNum value={n(dc['pwm_freq'], 1000)} isInt w={60} onChange={v => patch({ dc: { pwm_freq: v } })} />
                <span style={lbl}>cmd_timeout (s)</span>
                <InlineNum value={n(dc['cmd_timeout'], 0.5)} w={60} onChange={v => patch({ dc: { cmd_timeout: v } })} />
                <span style={lbl}>invert_left</span>
                <input type="checkbox" checked={b(dc['invert_left'])} onChange={e => patch({ dc: { invert_left: e.target.checked } })} />
                <span style={lbl}>invert_right</span>
                <input type="checkbox" checked={b(dc['invert_right'])} onChange={e => patch({ dc: { invert_right: e.target.checked } })} />
              </div>
            </div>
          </details>

          {/* encoder_drive */}
          <details>
            <summary>
              <span style={{ flex: 1 }}>encoder_drive</span>
              <input type="checkbox" checked={b(modes['encoder_drive'])}
                onClick={e => e.stopPropagation()}
                onChange={e => sendMode({ ...modes, encoder_drive: e.target.checked })} />
            </summary>
            <div className="config-section">
              <div style={fg2}>
                <span style={lbl}>cpr (counts/rev)</span>
                <InlineNum value={n(enc['cpr'], 1320)} isInt w={60} onChange={v => patch({ encoder: { cpr: v } })} />
                <span style={lbl}>publish_rate (Hz)</span>
                <InlineNum value={n(enc['publish_rate'], 20)} w={60} onChange={v => patch({ encoder: { publish_rate: v } })} />
                <span style={lbl}>odom_frame</span>
                <InlineStr value={s(enc['odom_frame'], 'odom')} w={110} onChange={v => patch({ encoder: { odom_frame: v } })} />
                <span style={lbl}>base_frame</span>
                <InlineStr value={s(enc['base_frame'], 'base_footprint')} w={110} onChange={v => patch({ encoder: { base_frame: v } })} />
              </div>
              <div style={{ fontSize: '.68rem', color: 'var(--dim)', marginBottom: 4 }}>covariance (applied on smabo-brain side)</div>
              <div style={{ fontSize: '.68rem', color: 'var(--dim)', marginBottom: 2 }}>pose (x, y, θ)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 3, marginBottom: 8, width: 'fit-content' }}>
                <InlineNum value={n(encCov['pose_xx'], 0.001)} w={64} onChange={v => patch({ encoder: { covariance: { pose_xx: v } } })} />
                <span style={zero}>0</span><span style={zero}>0</span>
                <span style={zero}>0</span>
                <InlineNum value={n(encCov['pose_yy'], 0.001)} w={64} onChange={v => patch({ encoder: { covariance: { pose_yy: v } } })} />
                <span style={zero}>0</span>
                <span style={zero}>0</span><span style={zero}>0</span>
                <InlineNum value={n(encCov['pose_aa'], 0.001)} w={64} onChange={v => patch({ encoder: { covariance: { pose_aa: v } } })} />
              </div>
              <div style={{ fontSize: '.68rem', color: 'var(--dim)', marginBottom: 2 }}>twist (v, ω)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: 3, marginBottom: 8, width: 'fit-content' }}>
                <InlineNum value={n(encCov['twist_vv'], 0.001)} w={64} onChange={v => patch({ encoder: { covariance: { twist_vv: v } } })} />
                <span style={zero}>0</span>
                <span style={zero}>0</span>
                <InlineNum value={n(encCov['twist_ww'], 0.001)} w={64} onChange={v => patch({ encoder: { covariance: { twist_ww: v } } })} />
              </div>
            </div>
          </details>

          {/* lidar */}
          <details>
            <summary>
              <span style={{ flex: 1 }}>lidar</span>
              <input type="checkbox" checked={b(modes['lidar'])}
                onClick={e => e.stopPropagation()}
                onChange={e => sendMode({ ...modes, lidar: e.target.checked })} />
            </summary>
            <div className="config-section">
              <div style={{ fontSize: '.68rem', color: 'var(--dim)', marginBottom: 4 }}>
                LD06 → /scan (Nav2). UART pin changes hot-reload (no reboot).
              </div>
              <div style={fg2}>
                <span style={lbl}>uart</span>
                <InlineNum value={n(lidar['uart'], 1)} isInt w={48} onChange={v => patch({ lidar: { uart: v } })} />
                <span style={lbl}>rx pin</span>
                <InlineNum value={n(lidar['rx'], 20)} isInt w={48} onChange={v => patch({ lidar: { rx: v } })} />
                <span style={lbl}>tx pin (−1=off)</span>
                <InlineNum value={n(lidar['tx'], -1)} isInt w={48} onChange={v => patch({ lidar: { tx: v } })} />
                <span style={lbl}>baud</span>
                <InlineNum value={n(lidar['baud'], 230400)} isInt w={72} onChange={v => patch({ lidar: { baud: v } })} />
                <span style={lbl}>frame_id</span>
                <InlineStr value={s(lidar['frame_id'], 'laser')} w={90} onChange={v => patch({ lidar: { frame_id: v } })} />
                <span style={lbl}>bins</span>
                <InlineNum value={n(lidar['bins'], 360)} isInt w={56} onChange={v => patch({ lidar: { bins: v } })} />
                <span style={lbl}>range_min (m)</span>
                <InlineNum value={n(lidar['range_min'], 0.05)} w={60} onChange={v => patch({ lidar: { range_min: v } })} />
                <span style={lbl}>range_max (m)</span>
                <InlineNum value={n(lidar['range_max'], 12.0)} w={60} onChange={v => patch({ lidar: { range_max: v } })} />
              </div>
            </div>
          </details>

        </div>
      </details>

      {/* ── Advanced ─────────────────────────────────── */}
      <details>
        <summary>Advanced – pins / bus / WiFi ⚠️ reboot</summary>
        <div className="config-section">
          <div style={{ color: 'var(--orange)', fontSize: '.72rem', marginBottom: 6 }}>
            Changes are batched via Stage → Apply (ESP32 reboots). WiFi changes may drop the connection.
          </div>
          {stagedCount > 0 && <div className="staged-notice" style={{ marginBottom: 6 }}>{stagedCount} field(s) staged</div>}

          <SectionHeader>I2C</SectionHeader>
          <div style={fg2}>
            {(['sda','scl'] as const).flatMap(f => [
              <span key={`l${f}`} style={lbl}>i2c.{f}</span>,
              stageInput(56, n(i2c[f]), 'number', e => stage(p => ({ ...p, i2c: { ...rec(p['i2c']), [f]: parseInt(e.target.value, 10) } }))),
            ])}
            <span style={lbl}>i2c.freq</span>
            {stageInput(72, n(i2c['freq'], 400000), 'number', e => stage(p => ({ ...p, i2c: { ...rec(p['i2c']), freq: parseInt(e.target.value, 10) } })))}
          </div>

          <SectionHeader>PCA9685</SectionHeader>
          <div style={fg2}>
            {(['address','freq'] as const).flatMap(f => [
              <span key={`l${f}`} style={lbl}>pca9685.{f}</span>,
              stageInput(64, n(pca[f]), 'number', e => stage(p => ({ ...p, pca9685: { ...rec(p['pca9685']), [f]: parseInt(e.target.value, 10) } }))),
            ])}
          </div>

          <SectionHeader>DC motor pins</SectionHeader>
          <div style={fg2}>
            {(['stby','ain1','ain2','pwma','bin1','bin2','pwmb'] as const).flatMap(f => [
              <span key={`l${f}`} style={lbl}>dc.pins.{f}</span>,
              stageInput(52, n(dcPins[f]), 'number', e => stage(p => ({
                ...p, dc: { ...rec(p['dc']), pins: { ...rec(rec(p['dc'])['pins']), [f]: parseInt(e.target.value, 10) } }
              }))),
            ])}
          </div>

          <SectionHeader>Encoder pins</SectionHeader>
          <div style={fg2}>
            {(['a','b'] as const).flatMap(f => [
              <span key={`lL${f}`} style={lbl}>encoder.left.{f}</span>,
              stageInput(52, n(encLeft[f]), 'number', e => stage(p => ({
                ...p, encoder: { ...rec(p['encoder']), left: { ...rec(rec(p['encoder'])['left']), [f]: parseInt(e.target.value, 10) } }
              }))),
              <span key={`lR${f}`} style={lbl}>encoder.right.{f}</span>,
              stageInput(52, n(encRight[f]), 'number', e => stage(p => ({
                ...p, encoder: { ...rec(p['encoder']), right: { ...rec(rec(p['encoder'])['right']), [f]: parseInt(e.target.value, 10) } }
              }))),
            ])}
          </div>

          <SectionHeader>Brain</SectionHeader>
          <div style={fg2}>
            <span style={lbl}>brain.host</span>
            {stageInput(120, s(brainCfg['host']), 'text', e => stage(p => ({ ...p, brain: { ...rec(p['brain']), host: e.target.value } })))}
            <span style={lbl}>brain.port</span>
            {stageInput(64, n(brainCfg['port'], 9090), 'number', e => stage(p => ({ ...p, brain: { ...rec(p['brain']), port: parseInt(e.target.value, 10) } })))}
          </div>

          <SectionHeader>WiFi ⚠️</SectionHeader>
          <div style={fg2}>
            {(['ssid','password','hostname'] as const).flatMap(f => [
              <span key={`l${f}`} style={lbl}>wifi.{f}</span>,
              stageInput(120, s(wifi[f]), f === 'password' ? 'password' : 'text',
                e => stage(p => ({ ...p, wifi: { ...rec(p['wifi']), [f]: e.target.value } }))),
            ])}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              style={{ background: 'var(--orange)', color: '#000' }}
              disabled={stagedCount === 0}
              onClick={() => { patchConfig(staged); setStaged({}); }}
            >Apply ({stagedCount})</button>
            <button
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)' }}
              disabled={stagedCount === 0}
              onClick={() => setStaged({})}
            >Discard</button>
          </div>
        </div>
      </details>

      {/* ── Full config JSON ─────────────────────────── */}
      <details>
        <summary>Full config (JSON)</summary>
        <div className="config-section">
          <pre className="config-full-json">{JSON.stringify(esp32Config, null, 2)}</pre>
        </div>
      </details>
    </div>
  );
}
