// Renders a layout tree as split panes.
//
// * Drag a divider to resize (the ratio is saved for the open template).
// * Double-click a panel title (or press ⤢) to show it alone; Esc restores.
//   The other panels stay mounted underneath, so 3D views and form state
//   survive maximise/restore.
// * Drag a panel by its title bar onto another one: near an edge puts it on
//   that side, the middle swaps the two.
// * ⋯ menu: split right / down (the new pane asks which panel to show),
//   change panel, close.
// * Below 768 px the tree is flattened into one scrolling column.
import { useCallback, useEffect, useRef, useState } from 'react';
import { PANELS, PANEL_PRESETS, leafTitle } from './panels';
import { moveNode, removeAt, replaceAt, splitAt, type DropZone } from './tree';
import { isSplit, type LayoutNode, type NodePath, type PanelLeaf, type SplitNode } from './types';
import { useLayout } from './useLayout';

const MIN_PANE_PX = 140;       // a pane never gets narrower/shorter than this
const NARROW_QUERY = '(max-width: 767px)';

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const m = window.matchMedia(NARROW_QUERY);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** The panels a pane can show, as buttons (a new pane, or "Change panel…"). */
function PanelChooser({ onPick }: { onPick: (leaf: PanelLeaf) => void }) {
  const groups = [...new Set(PANEL_PRESETS.map(p => p.group))];
  return (
    <div className="panel-chooser">
      {groups.map(g => (
        <div key={g} className="panel-chooser-group">
          <div className="panel-chooser-label">{g}</div>
          <div className="panel-chooser-items">
            {PANEL_PRESETS.filter(p => p.group === g).map(p => (
              <button key={leafTitle(p.leaf)} onClick={() => onPick(p.leaf)}>{leafTitle(p.leaf)}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** ⋯ menu in a pane's title bar: split, change, close. */
function PaneMenu({ path, onChange }: { path: NodePath; onChange: () => void }) {
  const edit = useLayout(s => s.edit);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [open]);

  const run = (fn: () => void) => () => { setOpen(false); fn(); };
  const split = (zone: 'right' | 'bottom') => run(() => edit(t => splitAt(t, path, zone, { panel: 'empty' })));

  return (
    <div className="pane-menu-wrap" ref={ref}>
      <button
        className="pane-btn"
        onClick={() => setOpen(o => !o)}
        aria-label="Panel menu"
        aria-expanded={open}
        title="Split, change or close this panel"
      >⋯</button>
      {open && (
        <div className="pane-menu" role="menu">
          <button role="menuitem" onClick={split('right')}>◫ Split right</button>
          <button role="menuitem" onClick={split('bottom')}>⊟ Split down</button>
          <button role="menuitem" onClick={run(onChange)}>⇄ Change panel…</button>
          <button
            role="menuitem"
            className="pane-menu-danger"
            disabled={path === ''}
            title={path === '' ? 'The last panel can’t be closed' : undefined}
            onClick={run(() => edit(t => removeAt(t, path)))}
          >✕ Close</button>
        </div>
      )}
    </div>
  );
}

function zoneAt(e: React.DragEvent, el: HTMLElement): DropZone {
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  const edges: [DropZone, number][] = [['left', x], ['right', 1 - x], ['top', y], ['bottom', 1 - y]];
  const [zone, d] = edges.reduce((m, c) => (c[1] < m[1] ? c : m));
  return d < 0.28 ? zone : 'center';
}

/** Drop target laid over a pane while another pane is being dragged. */
function DropOverlay({ path }: { path: NodePath }) {
  const dragFrom = useLayout(s => s.dragFrom);
  const setDragFrom = useLayout(s => s.setDragFrom);
  const edit = useLayout(s => s.edit);
  const [zone, setZone] = useState<DropZone | null>(null);
  if (dragFrom == null || dragFrom === path) return null;
  // both enter and over must accept, or a quick release right after entering isn't a drop
  const over = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setZone(zoneAt(e, e.currentTarget));
  };

  return (
    <div
      className="pane-drop"
      onDragEnter={over}
      onDragOver={over}
      onDragLeave={() => setZone(null)}
      onDrop={e => {
        e.preventDefault();
        const z = zoneAt(e, e.currentTarget);
        setDragFrom(null);
        edit(t => moveNode(t, dragFrom, path, z));
      }}
    >
      {zone && (
        <div className={`pane-drop-hint pane-drop-hint--${zone}`}>
          <span>{zone === 'center' ? 'Swap' : 'Move here'}</span>
        </div>
      )}
    </div>
  );
}

function Panel({ leaf, path, narrow }: { leaf: PanelLeaf; path: NodePath; narrow: boolean }) {
  const maximized = useLayout(s => s.maximized);
  const setMaximized = useLayout(s => s.setMaximized);
  const dragFrom = useLayout(s => s.dragFrom);
  const setDragFrom = useLayout(s => s.setDragFrom);
  const edit = useLayout(s => s.edit);
  const [choosing, setChoosing] = useState(false);
  const def = PANELS[leaf.panel];
  const isMax = maximized === path;
  const toggle = () => setMaximized(isMax ? null : path);
  const Body = def.component;
  const title = leafTitle(leaf);
  const empty = leaf.panel === 'empty';
  const pick = (next: PanelLeaf) => { setChoosing(false); edit(t => replaceAt(t, path, () => next)); };

  return (
    <section
      className={`pane${isMax ? ' pane--max' : ''}${narrow ? ' pane--narrow' : ''}${dragFrom === path ? ' pane--dragging' : ''}`}
      aria-label={title}
      style={narrow && def.narrowMinHeight && !empty ? { minHeight: def.narrowMinHeight } : undefined}
    >
      <header
        className="pane-head"
        onDoubleClick={narrow || empty ? undefined : toggle}
        draggable={!narrow && !isMax}
        title={narrow ? undefined : 'Drag to move this panel'}
        onDragStart={e => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', title);
          setDragFrom(path);   // drop targets appear on the other panes right away
        }}
        onDragEnd={() => setDragFrom(null)}
      >
        {!narrow && <span className="pane-grip" aria-hidden>⠿</span>}
        <span className="pane-title">{title}</span>
        <PaneMenu path={path} onChange={() => setChoosing(true)} />
        {!narrow && !empty && (
          <button
            className="pane-btn"
            onClick={toggle}
            title={isMax ? 'Restore (Esc)' : 'Maximize (double-click the title)'}
            aria-label={isMax ? 'Restore panel' : 'Maximize panel'}
          >
            {isMax ? '⤡' : '⤢'}
          </button>
        )}
      </header>
      <div className={`pane-body${def.flush && !choosing ? ' pane-body--flush' : ''}`}>
        {empty || choosing ? (
          <>
            {choosing && (
              <div className="panel-chooser-top">
                <span className="expr-hint">Show in this pane:</span>
                <button onClick={() => setChoosing(false)}>Cancel</button>
              </div>
            )}
            <PanelChooser onPick={pick} />
          </>
        ) : (
          <Body {...(leaf.props ?? {})} />
        )}
      </div>
      {!narrow && <DropOverlay path={path} />}
    </section>
  );
}

function Split({ node, path, narrow }: { node: SplitNode; path: NodePath; narrow: boolean }) {
  const setRatio = useLayout(s => s.setRatio);
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const row = node.split === 'row';

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const size = row ? r.width : r.height;
    if (size <= 0) return;
    const pos = (row ? e.clientX - r.left : e.clientY - r.top) / size;
    const min = Math.min(0.45, MIN_PANE_PX / size);
    setRatio(path, Math.min(1 - min, Math.max(min, pos)));
  }, [dragging, row, path, setRatio]);

  const stop = useCallback(() => setDragging(false), []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const dec = row ? 'ArrowLeft' : 'ArrowUp';
    const inc = row ? 'ArrowRight' : 'ArrowDown';
    if (e.key === dec) { setRatio(path, node.ratio - step); e.preventDefault(); }
    if (e.key === inc) { setRatio(path, node.ratio + step); e.preventDefault(); }
  };

  if (narrow) {
    return (
      <>
        <Node node={node.a} path={path + 'a'} narrow />
        <Node node={node.b} path={path + 'b'} narrow />
      </>
    );
  }

  return (
    <div ref={boxRef} className={`split split--${node.split}${dragging ? ' split--dragging' : ''}`}>
      <div className="split-cell" style={{ flex: `${node.ratio} 1 0` }}>
        <Node node={node.a} path={path + 'a'} narrow={false} />
      </div>
      <div
        className="split-divider"
        role="separator"
        aria-orientation={row ? 'vertical' : 'horizontal'}
        aria-valuenow={Math.round(node.ratio * 100)}
        aria-valuemin={10}
        aria-valuemax={90}
        tabIndex={0}
        title="Drag to resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={onKeyDown}
      />
      <div className="split-cell" style={{ flex: `${1 - node.ratio} 1 0` }}>
        <Node node={node.b} path={path + 'b'} narrow={false} />
      </div>
    </div>
  );
}

function Node({ node, path, narrow }: { node: LayoutNode; path: NodePath; narrow: boolean }) {
  return isSplit(node)
    ? <Split node={node} path={path} narrow={narrow} />
    : <Panel leaf={node} path={path} narrow={narrow} />;
}

export function SplitLayout({ layout }: { layout: LayoutNode }) {
  const narrow = useNarrow();
  const maximized = useLayout(s => s.maximized);
  const setMaximized = useLayout(s => s.setMaximized);

  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMaximized(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized, setMaximized]);

  const dragFrom = useLayout(s => s.dragFrom);
  return (
    <div className={`layout-root${dragFrom != null ? ' layout-root--dragging' : ''}${narrow ? ' layout-root--narrow' : ''}${maximized && !narrow ? ' layout-root--max' : ''}`}>
      <Node node={layout} path="" narrow={narrow} />
    </div>
  );
}
