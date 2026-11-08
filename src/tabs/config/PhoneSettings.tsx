// The phone's settings (smabo-app, or the phone in smabo-sim) over its REST
// API (port 8081), the same way as the ESP32's. The phone announces where the
// API is on /phone/config_url and sends the whole tree on /phone/config after
// every change, so this stays current whoever changes a setting.
import React from 'react';
import { useBrain } from '../../store/useBrain';
import { ExpressionEditor } from './ExpressionEditor';
import { arr, b, n, rec, s, InlineNum, InlineStr, SectionHeader } from './fields';

const lbl: React.CSSProperties = { fontSize: '.68rem', color: 'var(--dim)', whiteSpace: 'nowrap' };
const grid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'max-content auto',
  columnGap: 10, rowGap: 4, alignItems: 'center', marginBottom: 8,
};
const unit: React.CSSProperties = { color: 'var(--dim)', fontSize: '.68rem', marginLeft: 4 };

export function PhoneSettings() {
  const cfg = useBrain(st => st.phoneConfig);
  const host = useBrain(st => st.phoneHost);
  const refresh = useBrain(st => st.refreshPhoneConfig);
  const patch = useBrain(st => st.patchPhoneConfig);

  const sensors = rec(cfg?.['sensors']);
  const imu = rec(sensors['imu']);
  const gps = rec(sensors['gps']);
  const camera = rec(sensors['camera']);
  const voice = rec(cfg?.['voice']);
  const speech = rec(cfg?.['speech']);
  const face = rec(cfg?.['face']);
  const app = rec(cfg?.['app']);
  const brainCfg = rec(cfg?.['brain']);
  const expressions = arr<string>(face['expressions']).filter(e => typeof e === 'string');

  const check = (label: string, value: unknown, p: (v: boolean) => Record<string, unknown>, title?: string) => [
    <span key={`l-${label}`} style={lbl} title={title}>{label}</span>,
    <input key={`v-${label}`} type="checkbox" aria-label={label} checked={b(value)}
      onChange={e => patch(p(e.target.checked))} />,
  ];

  return (
    <details open>
      <summary>
        <span style={{ flex: 1 }}>Phone (smabo-app)</span>
        {cfg && <span style={lbl}>{s(app['name'])} {s(app['version'])}</span>}
      </summary>
      <div className="config-section">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: '.72rem' }}>
          <span style={lbl}>REST</span>
          <span style={{ color: host ? 'var(--ink)' : 'var(--dim)' }}>{host || 'waiting for /phone/config_url…'}</span>
          <button style={{ fontSize: '.72rem', padding: '2px 10px', marginLeft: 'auto' }}
            disabled={!host} onClick={refresh}>Get</button>
        </div>

        {!cfg ? (
          <div className="expr-hint">
            The phone announces its settings API once it is connected to the brain
            (smabo-app, or smabo-sim&apos;s phone).
          </div>
        ) : (
          <>
            <SectionHeader>Sensors</SectionHeader>
            <div style={grid}>
              {check('IMU', imu['enabled'], v => ({ sensors: { imu: { enabled: v } } }))}
              <span style={lbl}>IMU rate</span>
              <span>
                <InlineNum value={n(imu['rate_hz'], 20)} isInt w={50}
                  onChange={v => patch({ sensors: { imu: { rate_hz: v } } })} />
                <span style={unit}>Hz</span>
              </span>
              {check('GPS', gps['enabled'], v => ({ sensors: { gps: { enabled: v } } }))}
              {check('Camera (to brain)', camera['enabled'], v => ({ sensors: { camera: { enabled: v } } }))}
              {check('Front camera', camera['front'], v => ({ sensors: { camera: { front: v } } }),
                'off = back camera')}
            </div>

            <SectionHeader>Voice</SectionHeader>
            <div style={grid}>
              {check('Listen', voice['enabled'], v => ({ voice: { enabled: v } }), 'wake word + recording')}
              <span style={lbl}>Wake word</span>
              <InlineStr label="Wake word" value={s(voice['wake_word'])} w={120}
                onChange={v => v.trim() && patch({ voice: { wake_word: v } })} />
              <span style={lbl}>Recognition locale</span>
              <InlineStr label="Recognition locale" value={s(voice['stt_locale'])} w={80}
                onChange={v => v.trim() && patch({ voice: { stt_locale: v } })} />
            </div>

            <SectionHeader>Speech (/speech/say)</SectionHeader>
            <div style={grid}>
              {check('Read aloud', speech['tts'], v => ({ speech: { tts: v } }))}
              <span style={lbl}>TTS language</span>
              <InlineStr label="TTS language" value={s(speech['tts_language'])} w={80}
                onChange={v => v.trim() && patch({ speech: { tts_language: v } })} />
              {check('Speech bubble', speech['bubble'], v => ({ speech: { bubble: v } }))}
              {check('Ignore repeats', speech['ignore_repeated'], v => ({ speech: { ignore_repeated: v } }),
                'drop a text identical to the previous one (e.g. the same QR every frame)')}
            </div>

            <SectionHeader>Face</SectionHeader>
            <div style={grid}>
              <span style={lbl}>Expression</span>
              <select aria-label="expression" value={s(face['expression'])}
                style={{ fontSize: '.72rem', width: 'fit-content' }}
                onChange={e => patch({ face: { expression: e.target.value } })}>
                {expressions.map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              {check('Auto-hide controls', face['auto_hide'], v => ({ face: { auto_hide: v } }))}
              <span style={lbl}>after</span>
              <span>
                <InlineNum value={n(face['auto_hide_seconds'], 5)} isInt w={50}
                  onChange={v => patch({ face: { auto_hide_seconds: v } })} />
                <span style={unit}>s</span>
              </span>
            </div>

            <details>
              <summary>Edit expressions</summary>
              <div className="config-section">
                <ExpressionEditor />
              </div>
            </details>

            <div className="expr-hint">
              Brain: {s(brainCfg['host'])}:{n(brainCfg['port'])} (change it on the phone).
            </div>
            <details>
              <summary>Full phone settings (JSON)</summary>
              <pre className="config-full-json">{JSON.stringify(cfg, null, 2)}</pre>
            </details>
          </>
        )}
      </div>
    </details>
  );
}
