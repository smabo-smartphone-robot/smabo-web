// Renders a layout tree as split panes.
//
// * Drag a divider to resize (the ratio is saved for the open template).
// * Double-click a panel title (or press ⤢) to show it alone; Esc restores.
//   The other panels stay mounted underneath, so 3D views and form state
//   survive maximise/restore.
// * Drag a panel by its title bar onto another one: near an edge puts it on
//   that side, the middle swaps the two. While dragging, the panel follows
//   the cursor and the others already move to where the drop would put them
//   (making room); on release it glides into that place.
// * ⋯ menu: split right / down (the new pane asks which panel to show),
//   change panel, close.
// * Below 768 px the tree is flattened into one scrolling column.
//
// Wide layouts are drawn flat: every panel is absolutely placed from the tree
// (fractions of the board) and keyed by its leaf object, in a fixed DOM order.
// So when the tree changes — and while dragging, when the tree shown is the
// one after the drop — panels just glide to their new place (CSS transition)
// without remounting: 3D views, video and form state keep running.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { PANELS, PANEL_PRESETS, leafTitle } from './panels';
import { leafRects, moveNode, removeAt, replaceAt, splitAt, splitRects, type DropZone, type Rect, type SplitRect } from './tree';
import type { LayoutNode, NodePath, PanelLeaf } from './types';
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

/** A stable id per leaf object: moving a leaf in the tree keeps its id. */
const leafIds = new WeakMap<object, number>();
let nextLeafId = 1;
function leafId(leaf: object): number {
  let id = leafIds.get(leaf);
  if (id == null) { id = nextLeafId++; leafIds.set(leaf, id); }
  return id;
}

/** A blank drag image: the panel itself shows where it goes, so the browser's
 *  translucent copy of the title bar following the cursor would only be noise.
 *  (Loaded up front: setDragImage needs a ready image at dragstart.) */
const BLANK_DRAG_IMAGE = (() => {
  if (typeof Image === 'undefined') return null;
  const img = new Image(1, 1);
  img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  return img;
})();

const place = (r: Rect): CSSProperties => ({
  left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`,
});

/** Drop target over a pane's place in the layout *before* the drop (that one
 *  stays put, so the target doesn't move away while the panels slide). */
function DropTarget({ path, rect }: { path: NodePath; rect: Rect }) {
  const dragFrom = useLayout(s => s.dragFrom);
  const setDragFrom = useLayout(s => s.setDragFrom);
  const setDropPreview = useLayout(s => s.setDropPreview);
  const edit = useLayout(s => s.edit);
  if (dragFrom == null) return null;
  // both enter and over must accept, or a quick release right after entering isn't a drop
  const over = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropPreview({ to: path, zone: zoneAt(e, e.currentTarget) });
  };
  return (
    <div
      className="pane-drop"
      style={place(rect)}
      onDragEnter={over}
      onDragOver={over}
      onDragLeave={() => {
        // entering the next target fires before leaving this one: only clear our own preview
        if (useLayout.getState().dropPreview?.to === path) setDropPreview(null);
      }}
      onDrop={e => {
        e.preventDefault();
        const z = zoneAt(e, e.currentTarget);
        setDragFrom(null);
        edit(t => moveNode(t, dragFrom, path, z));
      }}
    />
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
          if (BLANK_DRAG_IMAGE) e.dataTransfer.setDragImage(BLANK_DRAG_IMAGE, 0, 0);
          setDragFrom(path);   // drop targets appear over the panes right away
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
    </section>
  );
}

/** Divider between the two halves of a split: drag (or arrow keys) to resize. */
function Divider({ split, board, onResizing }: {
  split: SplitRect; board: React.RefObject<HTMLDivElement | null>; onResizing: (on: boolean) => void;
}) {
  const setRatio = useLayout(s => s.setRatio);
  const [dragging, setDragging] = useState(false);
  const { node, path } = split;
  const row = node.split === 'row';

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    onResizing(true);
  }, [onResizing]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !board.current) return;
    const b = board.current.getBoundingClientRect();
    const size = row ? b.width * split.w : b.height * split.h;
    if (size <= 0) return;
    const start = row ? b.left + b.width * split.x : b.top + b.height * split.y;
    const pos = ((row ? e.clientX : e.clientY) - start) / size;
    const min = Math.min(0.45, MIN_PANE_PX / size);
    setRatio(path, Math.min(1 - min, Math.max(min, pos)));
  }, [dragging, board, row, split, path, setRatio]);

  const stop = useCallback(() => { setDragging(false); onResizing(false); }, [onResizing]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const dec = row ? 'ArrowLeft' : 'ArrowUp';
    const inc = row ? 'ArrowRight' : 'ArrowDown';
    if (e.key === dec) { setRatio(path, node.ratio - step); e.preventDefault(); }
    if (e.key === inc) { setRatio(path, node.ratio + step); e.preventDefault(); }
  };

  // a strip as wide as the gap between the panes, along the split line
  const at = row ? split.x + split.w * node.ratio : split.y + split.h * node.ratio;
  const style: CSSProperties = row
    ? { left: `calc(${at * 100}% - 5px)`, top: `calc(${split.y * 100}% + 5px)`, width: 10, height: `calc(${split.h * 100}% - 10px)` }
    : { top: `calc(${at * 100}% - 5px)`, left: `calc(${split.x * 100}% + 5px)`, height: 10, width: `calc(${split.w * 100}% - 10px)` };

  return (
    <div
      className={`split-divider split-divider--${row ? 'row' : 'column'}${dragging ? ' split-divider--active' : ''}`}
      style={style}
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
  );
}

/** The drop preview, applied after the pointer rests for a moment: sweeping
 *  across panes doesn't reshuffle the layout at every one it crosses. */
function useSettled<T>(value: T, active: boolean, ms = 120): T | null {
  const [settled, setSettled] = useState<T | null>(null);
  useEffect(() => {
    if (!active) { setSettled(null); return; }
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, active, ms]);
  return active ? settled : null;
}

const LAND_MS = 450;   // matches the .lay-cell transitions

/** The panel being dragged follows the cursor. Its slot (left/top/size) is the
 *  one the drop would give it; a transform, updated every frame, carries it
 *  from there to under the cursor. On release the transform eases to zero, so
 *  it glides into its slot. Imperative on purpose: no React render per frame. */
function useFollowCursor(board: React.RefObject<HTMLDivElement | null>, dragging: boolean) {
  const pointer = useRef({ x: 0, y: 0 });
  const grab = useRef({ fx: 0.5, fy: 0.1 });   // where in the panel it was picked up (fractions)

  const onDragStartCapture = useCallback((e: React.DragEvent) => {
    const cell = (e.target as HTMLElement).closest('.lay-cell');
    if (!cell) return;
    const r = cell.getBoundingClientRect();
    grab.current = { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
    pointer.current = { x: e.clientX, y: e.clientY };
  }, []);

  useLayoutEffect(() => {
    if (!dragging) return;
    let raf = 0;
    let lifted: HTMLElement | null = null;
    // transform that puts the cell's grab point under the pointer
    const offset = (el: HTMLElement) => {
      const b = board.current!.getBoundingClientRect();
      return {
        x: pointer.current.x - grab.current.fx * el.offsetWidth - (b.left + el.offsetLeft),
        y: pointer.current.y - grab.current.fy * el.offsetHeight - (b.top + el.offsetTop),
      };
    };
    const onOver = (e: DragEvent) => {
      if (e.clientX || e.clientY) pointer.current = { x: e.clientX, y: e.clientY };
    };
    const tick = () => {
      const el = board.current?.querySelector<HTMLElement>('.lay-cell--lifted');
      if (el && board.current) {
        lifted = el;
        const o = offset(el);
        el.style.transform = `translate(${o.x}px, ${o.y}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('dragover', onOver, true);
    tick();
    return () => {
      // runs in the commit that ends the drag, before paint: the cell already
      // has its final slot; start it where it is on screen and ease it in
      cancelAnimationFrame(raf);
      window.removeEventListener('dragover', onOver, true);
      const el = lifted;
      if (!el || !board.current) return;
      const before = el.getBoundingClientRect();     // still transformed: where it is on screen
      el.style.transition = 'none';
      el.style.transform = '';
      const after = el.getBoundingClientRect();      // its slot now
      el.style.transform = `translate(${before.left - after.left}px, ${before.top - after.top}px)`;
      void el.offsetWidth;                           // commit the start before animating
      el.style.transition = `transform ${LAND_MS}ms var(--lay-ease)`;
      el.style.transform = '';
      window.setTimeout(() => { el.style.transition = ''; }, LAND_MS + 50);
    };
  }, [dragging, board]);

  return onDragStartCapture;
}

/** Wide layout: panels placed absolutely, gliding when the tree changes. */
function Board({ layout }: { layout: LayoutNode }) {
  const board = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const maximized = useLayout(s => s.maximized);
  const dragFrom = useLayout(s => s.dragFrom);
  const drop = useSettled(useLayout(s => s.dropPreview), dragFrom != null);
  const onDragStartCapture = useFollowCursor(board, dragFrom != null);

  const base = leafRects(layout);
  // while dragging over a target, show the layout as it would be after the drop
  const shown = dragFrom != null && drop ? leafRects(moveNode(layout, dragFrom, drop.to, drop.zone)) : base;
  const pathOf = new Map(base.map(r => [r.leaf, r.path] as const));
  const cells = shown
    .map(r => ({ ...r, id: leafId(r.leaf), path: pathOf.get(r.leaf) ?? r.path }))
    .sort((a, b) => a.id - b.id);          // fixed DOM order: moving never re-parents a panel

  return (
    <div
      ref={board}
      onDragStartCapture={onDragStartCapture}
      className={`layout-board${resizing ? ' layout-board--resizing' : ''}${dragFrom != null ? ' layout-board--dragging' : ''}`}
    >
      {cells.map(c => (
        <div
          key={c.id}
          className={`lay-cell${maximized === c.path ? ' lay-cell--max' : ''}${dragFrom === c.path ? ' lay-cell--lifted' : ''}`}
          style={place(c)}
        >
          <Panel leaf={c.leaf} path={c.path} narrow={false} />
        </div>
      ))}
      {dragFrom == null && !maximized && splitRects(layout).map(s => (
        <Divider key={s.path || 'root'} split={s} board={board} onResizing={setResizing} />
      ))}
      {dragFrom != null && base.filter(r => r.path !== dragFrom).map(r => (
        <DropTarget key={leafId(r.leaf)} path={r.path} rect={r} />
      ))}
    </div>
  );
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
      {narrow
        ? leafRects(layout).map(r => <Panel key={leafId(r.leaf)} leaf={r.leaf} path={r.path} narrow />)
        : <Board layout={layout} />}
    </div>
  );
}
