import { useState, useEffect } from 'react';
import { useBrain } from '../store/useBrain';
import { useDragOrder } from '../hooks/useDragOrder';

// ── ESP32 通信確認 ───────────────────────────────────────────
// 2 経路を確認する:
//   1. REST（web → ESP32 直通）: GET /config への ping
//   2. WS テレメトリ（ESP32 → brain → web）: /odom・/joint_states の受信鮮度
function Esp32CommCheck() {
  const esp32Host = useBrain(s => s.esp32Host);
  const esp32Ping = useBrain(s => s.esp32Ping);
  const lastEsp32WsAt = useBrain(s => s.lastEsp32WsAt);
  const pingEsp32 = useBrain(s => s.pingEsp32);

  // 受信鮮度の表示を毎秒更新するための再描画トリガ
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const wsAgeSec = lastEsp32WsAt != null ? (Date.now() - lastEsp32WsAt) / 1000 : null;
  const wsLive = wsAgeSec != null && wsAgeSec < 3;

  const restDot = esp32Ping == null ? '' : esp32Ping.ok ? 'live' : 'err';
  const restText = esp32Ping == null
    ? 'Not checked'
    : esp32Ping.ok
      ? `OK ${esp32Ping.latencyMs}ms`
      : 'No response';

  return (
    <div className="card esp32-check">
      <div className="card-title">ESP32 connection check</div>

      <div className="esp32-check-row">
        <span className={`live-dot ${restDot}`} />
        <span className="esp32-check-label">REST (GET /config)</span>
        <span className="esp32-check-val">{restText}</span>
        <button
          style={{ fontSize: '.72rem', padding: '2px 10px' }}
          disabled={!esp32Host}
          onClick={pingEsp32}
        >Ping</button>
      </div>

      <div className="esp32-check-row">
        <span className={`live-dot ${wsLive ? 'live' : ''}`} />
        <span className="esp32-check-label">Telemetry (via brain)</span>
        <span className="esp32-check-val">
          {wsAgeSec == null ? 'Not received' : wsLive ? `Receiving (${wsAgeSec.toFixed(1)}s ago)` : `Stopped (${wsAgeSec.toFixed(0)}s ago)`}
        </span>
      </div>

      {!esp32Host && (
        <div className="expr-hint" style={{ marginTop: 4 }}>
          Set the ESP32 host in the header to enable Ping.
        </div>
      )}
    </div>
  );
}

// ── field components ─────────────────────────────────────────

function BoolField({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="config-field">
      <label>{label}</label>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
    </div>
  );
}

function NumField({ label, value, onSend, isInt }: {
  label: string; value: number; onSend: (v: number) => void; isInt?: boolean;
}) {
  const [local, setLocal] = useState(String(value ?? ''));
  const send = () => {
    const v = isInt ? parseInt(local, 10) : parseFloat(local);
    if (!isNaN(v)) onSend(v);
  };
  return (
    <div className="config-field">
      <label>{label}</label>
      <input type="number" value={local} step={isInt ? 1 : 'any'}
        onChange={e => setLocal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') send(); }} />
      <button style={{ padding: '3px 8px', fontSize: '.72rem' }} onClick={send}>Send</button>
    </div>
  );
}

function StrField({ label, value, onSend, isPassword }: {
  label: string; value: string; onSend: (v: string) => void; isPassword?: boolean;
}) {
  const [local, setLocal] = useState(value ?? '');
  return (
    <div className="config-field">
      <label>{label}</label>
      <input type={isPassword ? 'password' : 'text'} value={local}
        onChange={e => setLocal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSend(local); }} />
      <button style={{ padding: '3px 8px', fontSize: '.72rem' }} onClick={() => onSend(local)}>Send</button>
    </div>
  );
}

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

// ── main ─────────────────────────────────────────────────────

export function Config() {
  const esp32Config = useBrain(st => st.esp32Config);
  const patchConfig = useBrain(st => st.patchConfig);
  const removeConfig = useBrain(st => st.removeConfig);
  const setMode = useBrain(st => st.setMode);
  const refreshConfig = useBrain(st => st.refreshConfig);
  const { sort: sortServos, handleProps: servoHandle, dropProps: servoDrop } = useDragOrder('smabo-config-servos-order');

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

  const patch = (p: Record<string, unknown>) => patchConfig(p);
  const sendMode = (m: Record<string, unknown>) => setMode(m);

  // Stage helpers for Advanced section
  type MergeSetFn = (prev: Record<string, unknown>) => Record<string, unknown>;
  const stage = (fn: MergeSetFn) => setStaged(fn);

  return (
    <div className="config-layout">

      <Esp32CommCheck />

      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <button onClick={refreshConfig}>Get config</button>
      </div>

      {/* Modes */}
      <details open>
        <summary>Modes</summary>
        <div className="config-section">
          {(['servos', 'dc_drive', 'encoder_drive'] as const).map(k => (
            <BoolField key={k} label={k} value={b(modes[k])}
              onChange={v => sendMode({ ...modes, [k]: v })} />
          ))}
        </div>
      </details>

      {/* Servos – per joint */}
      <details>
        <summary>Servos</summary>
        <div className="config-section">
          <BoolField label="random motion"
            value={s(svCfg['behavior']) === 'random'}
            onChange={v => patch({ servos: { behavior: v ? 'random' : 'manual' } })} />
          <NumField label="joint_states_rate (Hz)"
            value={n(svCfg['joint_states_rate'], 10)}
            onSend={v => patch({ servos: { joint_states_rate: v } })} />

          {sortServos(Object.keys(joints)).map(name => {
            const jv = joints[name];
            const j = rec(jv);
            const jp = (f: string, v: unknown) => patch({ servos: { joints: { [name]: { [f]: v } } } });
            const allNames = Object.keys(joints);
            return (
              <details key={name} style={{ border: '1px solid var(--border)', borderRadius: 4, marginTop: 4 }} {...servoDrop(name, allNames)}>
                <summary style={{ fontSize: '.78rem', padding: '5px 8px' }}>
                  <span className="drag-handle" {...servoHandle(name)}>⠿</span>
                  {name}
                </summary>
                <div className="config-section">
                  <NumField label="channel"        value={n(j['channel'])}           isInt onSend={v => jp('channel', v)} />
                  <NumField label="min_angle (°)"  value={n(j['min_angle'], -90)}          onSend={v => jp('min_angle', v)} />
                  <NumField label="max_angle (°)"  value={n(j['max_angle'],  90)}          onSend={v => jp('max_angle', v)} />
                  <NumField label="init_angle (°)" value={n(j['init_angle'])}               onSend={v => jp('init_angle', v)} />
                  <NumField label="max_speed (°/s)" value={n(j['max_speed'], 90)}           onSend={v => jp('max_speed', v)} />
                  <NumField label="min_us"         value={n(j['min_us'], 500)}         isInt onSend={v => jp('min_us', v)} />
                  <NumField label="max_us"         value={n(j['max_us'], 2500)}        isInt onSend={v => jp('max_us', v)} />
                  <button
                    style={{ color: 'var(--accent)', border: '1px solid var(--accent)', background: 'transparent', fontSize: '.72rem', marginTop: 4 }}
                    onClick={() => {
                      if (!confirm(`Delete "${name}"?`)) return;
                      removeConfig({ servos: { joints: { [name]: null } } });
                    }}
                  >Delete</button>
                </div>
              </details>
            );
          })}

          <button style={{ fontSize: '.75rem', marginTop: 6 }} onClick={() => {
            const name = prompt('Joint name:');
            if (!name) return;
            patch({ servos: { joints: { [name]: { channel: 0, min_angle: -90, max_angle: 90, init_angle: 0, max_speed: 90, min_us: 500, max_us: 2500 } } } });
          }}>+ Add servo</button>
        </div>
      </details>

      {/* Servos – motion assignment */}
      <details>
        <summary>Servos – Motion</summary>
        <div className="config-section">
          {Object.keys(joints).map(name => {
            const inGroup = rgroups.find(g => arr<string>(g['joints']).includes(name));
            const cur = inGroup ? s(inGroup['name']) : 'manual';
            return (
              <div key={name} className="config-field">
                <label>{name}</label>
                <select value={cur} onChange={e => {
                  const next = e.target.value;
                  const updated = rgroups.map(g => {
                    const js = arr<string>(g['joints']).filter(j => j !== name);
                    if (s(g['name']) === next) js.push(name);
                    return { ...g, joints: js };
                  });
                  patch({ servos: { random_groups: updated } });
                }}>
                  <option value="manual">manual</option>
                  {rgroups.map(g => {
                    const gn = s(g['name']);
                    return <option key={gn} value={gn}>{gn}</option>;
                  })}
                </select>
              </div>
            );
          })}
        </div>
      </details>

      {/* Servos – random groups */}
      <details>
        <summary>Servos – Random groups</summary>
        <div className="config-section">
          {rgroups.map((g, i) => {
            const gn = s(g['name'], `group${i}`);
            const iv = arr<number>(g['interval']);
            const updG = (key: string, v: unknown) =>
              patch({ servos: { random_groups: rgroups.map(gg => s(gg['name']) === gn ? { ...gg, [key]: v } : gg) } });
            return (
              <div key={gn} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '.78rem', color: 'var(--orange)', marginBottom: 4 }}>
                  {gn} [{arr<string>(g['joints']).join(', ')}]
                </div>
                <NumField label="interval min (s)" value={iv[0] ?? 1}
                  onSend={v => updG('interval', [v, iv[1] ?? 3])} />
                <NumField label="interval max (s)" value={iv[1] ?? 3}
                  onSend={v => updG('interval', [iv[0] ?? 1, v])} />
                <button
                  style={{ color: 'var(--accent)', border: '1px solid var(--accent)', background: 'transparent', fontSize: '.72rem', marginTop: 4 }}
                  onClick={() => patch({ servos: { random_groups: rgroups.filter(gg => s(gg['name']) !== gn) } })}
                >Delete group</button>
              </div>
            );
          })}
          <button style={{ fontSize: '.75rem' }} onClick={() => {
            const name = prompt('Group name:');
            if (!name) return;
            patch({ servos: { random_groups: [...rgroups, { name, joints: [], interval: [1, 3] }] } });
          }}>+ Add group</button>
        </div>
      </details>

      {/* Drive (DC) */}
      <details>
        <summary>Drive (DC)</summary>
        <div className="config-section">
          <NumField label="max_linear (m/s)"      value={n(dc['max_linear'], 0.3)}    onSend={v => patch({ dc: { max_linear: v } })} />
          <NumField label="max_angular (rad/s)"   value={n(dc['max_angular'], 1.5)}   onSend={v => patch({ dc: { max_angular: v } })} />
          <NumField label="wheel_radius (m)"      value={n(dc['wheel_radius'], 0.03)} onSend={v => patch({ dc: { wheel_radius: v } })} />
          <NumField label="wheel_separation (m)"  value={n(dc['wheel_separation'], 0.15)} onSend={v => patch({ dc: { wheel_separation: v } })} />
          <NumField label="pwm_freq (Hz)"         value={n(dc['pwm_freq'], 1000)}     isInt onSend={v => patch({ dc: { pwm_freq: v } })} />
          <NumField label="cmd_timeout (s)"       value={n(dc['cmd_timeout'], 0.5)}   onSend={v => patch({ dc: { cmd_timeout: v } })} />
          <BoolField label="invert_left"  value={b(dc['invert_left'])}  onChange={v => patch({ dc: { invert_left: v } })} />
          <BoolField label="invert_right" value={b(dc['invert_right'])} onChange={v => patch({ dc: { invert_right: v } })} />
        </div>
      </details>

      {/* Encoder / Odometry */}
      <details>
        <summary>Encoder / Odometry</summary>
        <div className="config-section">
          <NumField label="cpr (counts/rev)"  value={n(enc['cpr'], 1320)}  isInt onSend={v => patch({ encoder: { cpr: v } })} />
          <NumField label="publish_rate (Hz)" value={n(enc['publish_rate'], 20)} onSend={v => patch({ encoder: { publish_rate: v } })} />
          <StrField label="odom_frame" value={s(enc['odom_frame'], 'odom')}
            onSend={v => patch({ encoder: { odom_frame: v } })} />
          <StrField label="base_frame" value={s(enc['base_frame'], 'base_footprint')}
            onSend={v => patch({ encoder: { base_frame: v } })} />
          <div style={{ fontSize: '.75rem', color: 'var(--dim)', margin: '6px 0 2px' }}>covariance (applied on smabo-brain side)</div>
          {(['pose_xx','pose_yy','pose_aa','twist_vv','twist_ww'] as const).map(f => (
            <NumField key={f} label={f} value={n(encCov[f], 0.001)}
              onSend={v => patch({ encoder: { covariance: { [f]: v } } })} />
          ))}
        </div>
      </details>

      {/* Advanced */}
      <details>
        <summary>Advanced – pins / bus / WiFi ⚠️ reboot</summary>
        <div className="config-section">
          <div style={{ color: 'var(--orange)', fontSize: '.75rem', marginBottom: 8 }}>
            Changes are batched via Stage → Apply (ESP32 reboots). WiFi changes may drop the connection.
          </div>
          {stagedCount > 0 && (
            <div className="staged-notice">{stagedCount} field(s) staged</div>
          )}

          <div className="config-sub">I2C</div>
          {(['sda','scl'] as const).map(f => (
            <div key={f} className="config-field">
              <label>i2c.{f}</label>
              <input type="number" defaultValue={n(i2c[f])} step={1}
                onChange={e => stage(p => ({ ...p, i2c: { ...rec(p['i2c']), [f]: parseInt(e.target.value, 10) } }))} />
              <span className="stage-badge">staged</span>
            </div>
          ))}
          <div className="config-field">
            <label>i2c.freq</label>
            <input type="number" defaultValue={n(i2c['freq'], 400000)} step={1}
              onChange={e => stage(p => ({ ...p, i2c: { ...rec(p['i2c']), freq: parseInt(e.target.value, 10) } }))} />
            <span className="stage-badge">staged</span>
          </div>

          <div className="config-sub">PCA9685</div>
          {(['address','freq'] as const).map(f => (
            <div key={f} className="config-field">
              <label>pca9685.{f}</label>
              <input type="number" defaultValue={n(pca[f])} step={1}
                onChange={e => stage(p => ({ ...p, pca9685: { ...rec(p['pca9685']), [f]: parseInt(e.target.value, 10) } }))} />
              <span className="stage-badge">staged</span>
            </div>
          ))}

          <div className="config-sub">DC motor pins</div>
          {(['stby','ain1','ain2','pwma','bin1','bin2','pwmb'] as const).map(f => (
            <div key={f} className="config-field">
              <label>dc.pins.{f}</label>
              <input type="number" defaultValue={n(dcPins[f])} step={1}
                onChange={e => stage(p => ({
                  ...p, dc: { ...rec(p['dc']), pins: { ...rec(rec(p['dc'])['pins']), [f]: parseInt(e.target.value, 10) } }
                }))} />
              <span className="stage-badge">staged</span>
            </div>
          ))}

          <div className="config-sub">Encoder pins</div>
          {(['a','b'] as const).map(f => (
            <div key={`L${f}`} className="config-field">
              <label>encoder.left.{f}</label>
              <input type="number" defaultValue={n(encLeft[f])} step={1}
                onChange={e => stage(p => ({
                  ...p, encoder: { ...rec(p['encoder']),
                    left: { ...rec(rec(p['encoder'])['left']), [f]: parseInt(e.target.value, 10) } }
                }))} />
              <span className="stage-badge">staged</span>
            </div>
          ))}
          {(['a','b'] as const).map(f => (
            <div key={`R${f}`} className="config-field">
              <label>encoder.right.{f}</label>
              <input type="number" defaultValue={n(encRight[f])} step={1}
                onChange={e => stage(p => ({
                  ...p, encoder: { ...rec(p['encoder']),
                    right: { ...rec(rec(p['encoder'])['right']), [f]: parseInt(e.target.value, 10) } }
                }))} />
              <span className="stage-badge">staged</span>
            </div>
          ))}

          <div className="config-sub">Brain</div>
          <div className="config-field">
            <label>brain.host</label>
            <input type="text" defaultValue={s(brainCfg['host'])}
              onChange={e => stage(p => ({ ...p, brain: { ...rec(p['brain']), host: e.target.value } }))} />
            <span className="stage-badge">staged</span>
          </div>
          <div className="config-field">
            <label>brain.port</label>
            <input type="number" defaultValue={n(brainCfg['port'], 9090)} step={1}
              onChange={e => stage(p => ({ ...p, brain: { ...rec(p['brain']), port: parseInt(e.target.value, 10) } }))} />
            <span className="stage-badge">staged</span>
          </div>

          <div className="config-sub">WiFi ⚠️</div>
          {(['ssid','password','hostname'] as const).map(f => (
            <div key={f} className="config-field">
              <label>wifi.{f}</label>
              <input type={f === 'password' ? 'password' : 'text'} defaultValue={s(wifi[f])}
                onChange={e => stage(p => ({ ...p, wifi: { ...rec(p['wifi']), [f]: e.target.value } }))} />
              <span className="stage-badge">staged</span>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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

      {/* Full config JSON */}
      <details>
        <summary>Full config (JSON)</summary>
        <div className="config-section">
          <pre className="config-full-json">{JSON.stringify(esp32Config, null, 2)}</pre>
        </div>
      </details>
    </div>
  );
}
