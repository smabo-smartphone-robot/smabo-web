import React from 'react';
import { arr, b, n, rec, s, InlineNum } from './fields';

// ── ServoTable ────────────────────────────────────────────────
// Inline-editable table: one row per servo, all fields always visible.

export function ServoTable({ joints, rgroups, sorted, patch, removeConfig, setServoEnabled, handleProps, dropProps }: {
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
