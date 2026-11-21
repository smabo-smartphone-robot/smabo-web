import React from 'react';
import { arr, n, s, InlineNum, SectionHeader } from './fields';

// ── RandomGroupSettings ──────────────────────────────────────

export function RandomGroupSettings({ rgroups, patch }: {
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
