// Template list: pick the layout for the guide you are following.
import { useEffect, useMemo, useRef, useState } from 'react';
import { TEMPLATES, GUIDE_BASE, PHASE_LABEL } from '../layout/templates';
import { useLayout, useTemplate } from '../layout/useLayout';
import { useCapabilities, CAPABILITY_LABEL } from '../layout/capabilities';
import { PANELS } from '../layout/panels';
import { isSplit, type LayoutNode, type Template } from '../layout/types';

/** Miniature of a layout tree. */
function Thumb({ node }: { node: LayoutNode }) {
  if (!isSplit(node)) {
    const title = node.title ?? PANELS[node.panel].title;
    return <div className="thumb-leaf" title={title}><span>{title}</span></div>;
  }
  return (
    <div className={`thumb-split thumb-split--${node.split}`}>
      <div style={{ flex: `${node.ratio} 1 0` }}><Thumb node={node.a} /></div>
      <div style={{ flex: `${1 - node.ratio} 1 0` }}><Thumb node={node.b} /></div>
    </div>
  );
}

function Card({ t, current, missing, onOpen, onDelete }: {
  t: Template; current: boolean; missing: string[]; onOpen: () => void; onDelete?: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className={`tpl-card${current ? ' tpl-card--current' : ''}${missing.length ? ' tpl-card--missing' : ''}`}
      onClick={onOpen}
      title={missing.length ? `Not detected: ${missing.join(', ')} (you can still open it)` : undefined}
    >
      <div className="tpl-thumb"><Thumb node={t.layout} /></div>
      <div className="tpl-name">{t.title}</div>
      {onDelete && (
        <button
          className="pane-btn tpl-delete"
          aria-label={`Delete ${t.title}`}
          title="Delete this layout"
          onClick={e => { e.stopPropagation(); if (window.confirm(`Delete “${t.title}”?`)) onDelete(); }}
        >✕</button>
      )}
      <div className="tpl-sub">
        {current ? 'open now' : missing.length ? `missing: ${missing.join(', ')}` : t.note ?? (t.guide ? `guide: ${t.guide}` : '')}
      </div>
    </div>
  );
}

export function TemplatePicker() {
  const open = useLayout(s => s.pickerOpen);
  const setOpen = useLayout(s => s.setPickerOpen);
  const currentId = useLayout(s => s.templateId);
  const openTemplate = useLayout(s => s.open);
  const reset = useLayout(s => s.reset);
  const customized = useLayout(s => s.edited != null);
  const custom = useLayout(s => s.custom);
  const saveAs = useLayout(s => s.saveAs);
  const saveChanges = useLayout(s => s.saveChanges);
  const deleteCustom = useLayout(s => s.deleteCustom);
  const current = useTemplate();
  const [naming, setNaming] = useState<string | null>(null);   // "Save as" name being typed
  const caps = useCapabilities();
  const [query, setQuery] = useState('');
  const [onlyUsable, setOnlyUsable] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setNaming(null);
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { phase: Template['phase']; items: { t: Template; missing: string[] }[] }[] = [];
    for (const t of [...custom, ...TEMPLATES]) {
      const missing = t.requires.filter(r => !caps.has(r)).map(r => CAPABILITY_LABEL[r]);
      if (onlyUsable && missing.length) continue;
      if (q && !`${t.title} ${t.guide ?? ''} ${t.id} ${t.note ?? ''}`.toLowerCase().includes(q)) continue;
      let g = out.find(x => x.phase === t.phase);
      if (!g) out.push(g = { phase: t.phase, items: [] });
      g.items.push({ t, missing });
    }
    return out;
  }, [query, onlyUsable, caps, custom]);

  if (!open) return null;
  const isMine = current.phase === 'mine';
  const save = () => { if (naming != null) { saveAs(naming); setNaming(null); } };

  return (
    <div className="tpl-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="tpl-dialog" role="dialog" aria-modal="true" aria-label="Layout templates">
        <div className="tpl-top">
          <span className="card-title" style={{ margin: 0 }}>Templates</span>
          <input
            ref={searchRef}
            type="search"
            placeholder="Search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const first = groups[0]?.items[0];
                if (first) openTemplate(first.t.id);
              }
            }}
          />
          <label className="tpl-filter">
            <input type="checkbox" checked={onlyUsable} onChange={e => setOnlyUsable(e.target.checked)} />
            usable now
          </label>
          <button className="pane-btn" onClick={() => setOpen(false)} aria-label="Close">✕</button>
        </div>

        <div className="tpl-scroll">
          {groups.length === 0 && <div className="no-data">No template matches.</div>}
          {groups.map(g => (
            <div key={g.phase}>
              <div className="tpl-phase">{PHASE_LABEL[g.phase]}</div>
              <div className="tpl-grid">
                {g.items.map(({ t, missing }) => (
                  <Card key={t.id} t={t} current={t.id === currentId} missing={missing} onOpen={() => openTemplate(t.id)}
                    onDelete={t.phase === 'mine' ? () => deleteCustom(t.id) : undefined} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="tpl-foot">
          {naming != null ? (
            <>
              <input
                autoFocus
                className="tpl-name-input"
                value={naming}
                placeholder="Layout name"
                onChange={e => setNaming(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') save();
                  if (e.key === 'Escape') { e.stopPropagation(); setNaming(null); }
                }}
              />
              <button onClick={save}>Save</button>
              <button className="tpl-quiet" onClick={() => setNaming(null)}>Cancel</button>
            </>
          ) : (
            <>
              <span className="expr-hint tpl-hint">
                Drag a panel's title to move it · ⋯ to split / change / close · drag borders to resize
              </span>
              <span style={{ flex: 1 }} />
              {current.guide && (
                <a className="tpl-link" href={`${GUIDE_BASE}${current.guide}.html`} target="_blank" rel="noreferrer">
                  📖 Open guide
                </a>
              )}
              {isMine && customized && <button onClick={saveChanges}>Save changes</button>}
              <button
                onClick={() => setNaming(isMine ? `${current.title} 2` : `${current.title} (mine)`)}
                title="Keep the current screen as a layout of your own"
              >
                Save as My layout…
              </button>
              <button onClick={reset} disabled={!customized} title={isMine ? 'Back to the saved layout' : 'Back to the standard layout of this template'}>
                Reset layout
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
