import { useState, useRef, useCallback } from 'react';
import { useBrain } from '../store/useBrain';
import { brain } from '../ws/brain';
import { useDragOrder } from '../hooks/useDragOrder';

interface ServoSpec {
  init_angle?: number;
  min_angle?: number;
  max_angle?: number;
  [key: string]: unknown;
}

function rec(v: unknown): Record<string, unknown> {
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};
}

function getManualServos(config: Record<string, unknown> | null): { name: string; spec: ServoSpec }[] {
  if (!config) return [];

  const svCfg = rec(config['servos']);
  const joints = rec(svCfg['joints']);

  const randomJoints = new Set<string>();
  const rg = svCfg['random_groups'];
  if (Array.isArray(rg)) {
    for (const g of rg) {
      const jArr = rec(g)['joints'];
      if (Array.isArray(jArr)) {
        for (const j of jArr) {
          if (typeof j === 'string') randomJoints.add(j);
        }
      }
    }
  }

  return Object.entries(joints)
    .filter(([name]) => !randomJoints.has(name))
    .map(([name, v]) => ({ name, spec: v as ServoSpec }));
}

export function Arm() {
  const esp32Config = useBrain(s => s.esp32Config);
  const refreshConfig = useBrain(s => s.refreshConfig);
  const manualServos = getManualServos(esp32Config);
  const { sort, handleProps, dropProps } = useDragOrder('smabo-arm-order');

  const [angles, setAngles] = useState<Record<string, number>>({});
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const getAngle = (name: string, spec: ServoSpec): number =>
    angles[name] !== undefined ? angles[name] : (spec.init_angle ?? 0);

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
    setAngles(prev => ({ ...prev, [name]: val }));
    clearTimeout(debounceRefs.current[name]);
    debounceRefs.current[name] = setTimeout(() => sendCmd([name], [val], 0), 30);
  };

  const handleHome = () => {
    const names = manualServos.map(s => s.name);
    const degs  = manualServos.map(s => s.spec.init_angle ?? 0);
    setAngles(Object.fromEntries(names.map((n, i) => [n, degs[i]])));
    if (names.length > 0) sendCmd(names, degs, 1);
  };

  const names = manualServos.map(s => s.name);
  const sortedNames = sort(names);
  const sortedServos = sortedNames.map(n => manualServos.find(s => s.name === n)!);

  return (
    <div className="arm-layout">
      <div className="arm-header">
        <button onClick={refreshConfig}>Get Config</button>
        <button onClick={handleHome} disabled={manualServos.length === 0}>Home</button>
      </div>

      {manualServos.length === 0 ? (
        <div className="no-data">
          {esp32Config === null
            ? 'Set the ESP32 host in the header and press "Get Config".'
            : 'No servos outside random_groups.'}
        </div>
      ) : (
        <div className="arm-servos">
          {sortedServos.map(({ name, spec }) => {
            const min = spec.min_angle ?? -90;
            const max = spec.max_angle ?? 90;
            const val = getAngle(name, spec);
            return (
              <div key={name} className="servo-card" {...dropProps(name, names)}>
                <div className="servo-name">
                  <span className="drag-handle" {...handleProps(name)}>⠿</span>
                  {name}
                </div>
                <div className="servo-row">
                  <input
                    type="range"
                    min={min} max={max} step={1} value={val}
                    onChange={e => handleChange(name, Number(e.target.value))}
                  />
                  <span className="servo-val">{val.toFixed(0)}°</span>
                </div>
                <div style={{ fontSize: '.7rem', color: 'var(--dim)' }}>
                  {min}° ~ {max}°　init: {spec.init_angle ?? 0}°
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
