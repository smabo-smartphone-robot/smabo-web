import React, { useState } from 'react';
import { useBrain } from '../store/useBrain';
import { useDragOrder } from '../hooks/useDragOrder';
import { Esp32CommCheck } from './config/Esp32CommCheck';
import { PhoneSettings } from './config/PhoneSettings';
import { arr, b, n, rec, s, InlineNum, InlineStr, SectionHeader } from './config/fields';
import { RandomGroupSettings } from './config/RandomGroupSettings';
import { ServoTable } from './config/ServoTable';


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
        <PhoneSettings />
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
                <InlineNum value={n(dc['wheel_separation'], 0.13)} w={60} onChange={v => patch({ dc: { wheel_separation: v } })} />
                <span style={lbl}>pwm_freq (Hz)</span>
                <InlineNum value={n(dc['pwm_freq'], 1000)} isInt w={60} onChange={v => patch({ dc: { pwm_freq: v } })} />
                <span style={lbl}>cmd_timeout (s)</span>
                <InlineNum value={n(dc['cmd_timeout'], 0.5)} w={60} onChange={v => patch({ dc: { cmd_timeout: v } })} />
                <span style={lbl} title="0 以外の指令の duty をこの値まで引き上げる（静止摩擦対策、0 = 無効）">min_duty (0-1)</span>
                <InlineNum value={n(dc['min_duty'], 0)} w={60} onChange={v => patch({ dc: { min_duty: v } })} />
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

      {/* ── Phone (smabo-app): its own REST API ─────── */}
      <PhoneSettings />

      {/* ── Full config JSON ─────────────────────────── */}
      <details>
        <summary>Full ESP32 config (JSON)</summary>
        <div className="config-section">
          <pre className="config-full-json">{JSON.stringify(esp32Config, null, 2)}</pre>
        </div>
      </details>
    </div>
  );
}
