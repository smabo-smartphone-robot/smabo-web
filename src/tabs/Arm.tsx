import { useState, useRef, useCallback } from 'react';
import { useBrain } from '../store/useBrain';
import { brain } from '../ws/brain';
import { useDragOrder } from '../hooks/useDragOrder';

interface ServoSpec {
  init_angle?: number;
  min_angle?: number;
  max_angle?: number;
  enabled?: boolean;
  last_angle?: number;
  [key: string]: unknown;
}

function rec(v: unknown): Record<string, unknown> {
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};
}

interface ServoEntry {
  name: string;
  spec: ServoSpec;
  inGroup: string | null;
}

function saveAngles(next: Record<string, number>): void {
  try { localStorage.setItem('smabo-arm-angles', JSON.stringify(next)); } catch { /* ignore */ }
}

function getAllServos(config: Record<string, unknown> | null): ServoEntry[] {
  if (!config) return [];
  const svCfg = rec(config['servos']);
  const joints = rec(svCfg['joints']);
  const groupMap = new Map<string, string>();
  const rg = svCfg['random_groups'];
  if (Array.isArray(rg)) {
    for (const g of rg) {
      const gr = rec(g);
      const gname = typeof gr['name'] === 'string' ? (gr['name'] as string) : '';
      const jArr = gr['joints'];
      if (Array.isArray(jArr)) {
        for (const j of jArr) {
          if (typeof j === 'string') groupMap.set(j, gname);
        }
      }
    }
  }
  return Object.entries(joints).map(([name, v]) => ({
    name,
    spec: v as ServoSpec,
    inGroup: groupMap.get(name) ?? null,
  }));
}

export function Arm() {
  const esp32Config   = useBrain(s => s.esp32Config);
  const brainStatus   = useBrain(s => s.status);
  const esp32Connected = useBrain(s => s.esp32Connected);
  const refreshConfig = useBrain(s => s.refreshConfig);
  const setServoEnabled = useBrain(s => s.setServoEnabled);
  const allServos = getAllServos(esp32Config);

  const brainOk = brainStatus === 'connected';
  // esp32Connected===null は未確認（接続直後）→ 楽観的に操作可能とする
  const connected = brainOk && esp32Connected !== false;
  const { sort, handleProps, dropProps } = useDragOrder('smabo-arm-order');

  const [angles, setAngles] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('smabo-arm-angles') ?? '{}'); }
    catch { return {}; }
  });
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>();

  const getAngle = (name: string, spec: ServoSpec): number => {
    if (angles[name] !== undefined) return angles[name];
    const la = spec.last_angle;
    return typeof la === 'number' ? la : (spec.init_angle ?? 0);
  };

  const sendCmd = useCallback((names: string[], degs: number[], sec: number) => {
    brain.publish('/servo/command', {
      joint_names: names,
      points: [{
        positions: degs.map(d => d * Math.PI / 180),
        velocities: [],
        time_from_start: { sec, nanosec: 0 },
      }],
    });
  }, []);

  const handleChange = (name: string, val: number) => {
    setAngles(prev => {
      const next = { ...prev, [name]: val };
      saveAngles(next);
      return next;
    });
    const refs = (debounceRefs.current ??= {});
    clearTimeout(refs[name]);
    refs[name] = setTimeout(() => sendCmd([name], [val], 0), 30);
  };

  const handleHome = () => {
    const manual = allServos.filter(s => s.spec.enabled !== false && s.inGroup === null);
    const names = manual.map(s => s.name);
    const degs  = manual.map(s => s.spec.init_angle ?? 0);
    const next  = Object.fromEntries(names.map((n, i) => [n, degs[i]]));
    setAngles(next);
    saveAngles(next);
    if (names.length > 0) sendCmd(names, degs, 1);
  };

  const handleHomeOne = useCallback((name: string, initAngle: number) => {
    setAngles(prev => {
      const next = { ...prev, [name]: initAngle };
      saveAngles(next);
      return next;
    });
    sendCmd([name], [initAngle], 0);
  }, [sendCmd]);

  const names = allServos.map(s => s.name);
  const sorted = sort(names).map(n => allServos.find(s => s.name === n)!);

  const hasManual = allServos.some(s => s.spec.enabled !== false && s.inGroup === null);

  return (
    <div className="arm-layout">
      <div className="arm-header">
        <button onClick={refreshConfig}>Get Config</button>
        <button onClick={handleHome} disabled={!hasManual || !connected}>Home</button>
      </div>

      {!connected && (
        <div className="no-data" style={{ color: 'var(--muted)' }}>
          {!brainOk
            ? 'Brain not connected — controls disabled.'
            : 'smabo-esp32 disconnected — controls disabled.'}
        </div>
      )}

      {allServos.length === 0 ? (
        <div className="no-data">
          {esp32Config === null
            ? 'Set the ESP32 host in the header and press "Get Config".'
            : 'No servos configured.'}
        </div>
      ) : (
        <div className={`arm-servos${connected ? '' : ' arm-servos--disconnected'}`}>
          {sorted.map(({ name, spec, inGroup }) => {
            const enabled = spec.enabled !== false;
            const min = spec.min_angle ?? -90;
            const max = spec.max_angle ?? 90;
            const initAngle = spec.init_angle ?? 0;
            const val = getAngle(name, spec);
            return (
              <div key={name} className={`servo-card${enabled ? '' : ' servo-card--free'}`} {...dropProps(name, names)}>
                <div className="servo-name">
                  <span className="drag-handle" {...handleProps(name)}>⠿</span>
                  <span style={{ flex: 1 }}>{name}</span>
                  <button
                    style={{
                      fontSize: '.72rem',
                      padding: '2px 8px',
                      background: enabled
                        ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                        : 'transparent',
                      color: enabled ? 'var(--accent)' : 'var(--muted)',
                      border: `1px solid ${enabled ? 'var(--accent)' : 'var(--line)'}`,
                      borderRadius: 10,
                      cursor: 'pointer',
                    }}
                    onClick={() => setServoEnabled(name, !enabled)}
                  >
                    {enabled ? 'Enabled' : 'Free'}
                  </button>
                </div>

                {enabled ? (
                  inGroup !== null ? (
                    <div style={{ fontSize: '.72rem', color: 'var(--orange)', marginTop: 4 }}>
                      random motion (group: {inGroup})
                    </div>
                  ) : (
                    <>
                      <div className="servo-row">
                        <input
                          type="range"
                          min={min} max={max} step={1} value={val}
                          disabled={!connected}
                          onChange={e => handleChange(name, Number(e.target.value))}
                        />
                        <span className="servo-val">{val.toFixed(0)}°</span>
                        <button
                          style={{ fontSize: '.68rem', padding: '1px 6px', flexShrink: 0 }}
                          disabled={!connected}
                          onClick={() => handleHomeOne(name, initAngle)}
                        >Home</button>
                      </div>
                      <div style={{ fontSize: '.7rem', color: 'var(--dim)' }}>
                        {min}° ~ {max}°　init: {initAngle}°
                      </div>
                    </>
                  )
                ) : (
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
                    {spec.last_angle !== undefined
                      ? `last: ${Number(spec.last_angle).toFixed(1)}°`
                      : 'last: —'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
