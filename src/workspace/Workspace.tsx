// The workspace, laid out like a browser with split view.
//
// * Each pane has a tab bar with every tab (wrapping onto more rows when the
//   pane is narrow); clicking one shows it in that pane.
// * Two split buttons open a new pane on the right (a new column) or below
//   (in the same column), up to 4 panes in all.
// * × closes a pane (not the last one).
// * Drag a pane by its grip (six dots) onto another pane to swap their places.
// * Drag the gap between two panes to resize them.
// * Below 768 px the panes are stacked in one column instead.
//
// A pane keeps every tab it has shown mounted (just hidden), so 3D views,
// video and form state survive switching tabs.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { TABS } from './tabs';
import { MAX_PANES, paneCount, type At, type Pane as PaneState, type TabId } from './model';
import { useWorkspace } from './useWorkspace';

const NARROW_QUERY = '(max-width: 767px)';
const DRAG_TYPE = 'application/x-smabo-pane';

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

function SplitIcon({ down }: { down?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d={down ? 'M1.5 8h13' : 'M8 2.5v11'} />
    </svg>
  );
}

function Pane({ pane, at, count }: { pane: PaneState; at: At; count: number }) {
  const setTab = useWorkspace(s => s.setTab);
  const splitRight = useWorkspace(s => s.splitRight);
  const splitDown = useWorkspace(s => s.splitDown);
  const close = useWorkspace(s => s.close);
  const swap = useWorkspace(s => s.swap);
  const [dropOver, setDropOver] = useState(false);
  // tabs this pane has shown: they stay mounted
  const [opened, setOpened] = useState<TabId[]>([pane.tab]);
  useEffect(() => {
    setOpened(o => (o.includes(pane.tab) ? o : [...o, pane.tab]));
  }, [pane.tab]);
  const full = count >= MAX_PANES;
  const fullTitle = `Up to ${MAX_PANES} panes`;

  return (
    <section
      className={`pane ws-pane${dropOver ? ' ws-pane--drop' : ''}`}
      aria-label="Pane"
      onDragOver={e => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropOver(true);
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOver(false);
      }}
      onDrop={e => {
        setDropOver(false);
        const from = e.dataTransfer.getData(DRAG_TYPE);
        if (!from) return;
        e.preventDefault();
        const [col, row] = from.split(',').map(Number);
        swap({ col, row }, at);
      }}
    >
      <div className="ws-tabbar">
        <nav className="tab-nav ws-tabs" role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={pane.tab === t.id}
              className={pane.tab === t.id ? 'active' : ''}
              onClick={() => setTab(at, t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ws-actions">
          {count > 1 && (
            <span
              className="pane-btn ws-grip"
              draggable
              role="button"
              aria-label="Move pane: drag onto another pane to swap"
              title="Drag onto another pane to swap them"
              onDragStart={e => {
                e.dataTransfer.setData(DRAG_TYPE, `${at.col},${at.row}`);
                e.dataTransfer.effectAllowed = 'move';
                const pane = e.currentTarget.closest('.ws-pane');
                if (pane) e.dataTransfer.setDragImage(pane, 20, 20);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                {[4, 8, 12].flatMap(y => [6, 10].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />))}
              </svg>
            </span>
          )}
          <button className="pane-btn" onClick={() => splitRight(at)} disabled={full}
            title={full ? fullTitle : 'Split right: open a pane on the right'} aria-label="Split right">
            <SplitIcon />
          </button>
          <button className="pane-btn" onClick={() => splitDown(at)} disabled={full}
            title={full ? fullTitle : 'Split down: open a pane below'} aria-label="Split down">
            <SplitIcon down />
          </button>
          {count > 1 && (
            <button className="pane-btn" onClick={() => close(at)} title="Close this pane" aria-label="Close pane">
              ×
            </button>
          )}
        </div>
      </div>
      <div className="pane-body pane-body--flush tab-panels">
        {TABS.filter(t => opened.includes(t.id)).map(t => (
          <div key={t.id} className={`tab-panel ${pane.tab === t.id ? 'active' : ''}`} role="tabpanel">
            <t.component />
          </div>
        ))}
      </div>
    </section>
  );
}

/** A gap between two panes; drag (or arrow keys) to resize. */
function Divider({ vertical, areaRef, onMove }: {
  vertical: boolean;                       // true: between columns (moves left/right)
  areaRef: RefObject<HTMLDivElement>;      // the element the shares are of
  onMove: (delta: number) => void;
}) {
  const last = useRef(0);
  const pos = (e: ReactPointerEvent) => (vertical ? e.clientX : e.clientY);

  return (
    <div
      className={`split-divider ws-divider ${vertical ? 'ws-divider--col' : 'ws-divider--row'}`}
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      tabIndex={0}
      title="Drag to resize"
      onPointerDown={e => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = pos(e);
      }}
      onPointerMove={e => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const el = areaRef.current;
        const size = el ? (vertical ? el.clientWidth : el.clientHeight) : 0;
        if (!size) return;
        onMove((pos(e) - last.current) / size);
        last.current = pos(e);
      }}
      onKeyDown={e => {
        const back = vertical ? 'ArrowLeft' : 'ArrowUp';
        const fwd = vertical ? 'ArrowRight' : 'ArrowDown';
        if (e.key === back) onMove(-0.02);
        if (e.key === fwd) onMove(0.02);
      }}
    />
  );
}

function ColumnView({ col, count }: { col: number; count: number }) {
  const column = useWorkspace(s => s.columns[col]);
  const resizeRows = useWorkspace(s => s.resizeRows);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="ws-col">
      {column.panes.map((p, row) => (
        <div key={p.id} className="ws-cell" style={{ flexBasis: 0, flexGrow: column.heights[row] }}>
          <Pane pane={p} at={{ col, row }} count={count} />
          {row < column.panes.length - 1 && (
            <Divider vertical={false} areaRef={ref} onMove={d => resizeRows(col, row, d)} />
          )}
        </div>
      ))}
    </div>
  );
}

export function Workspace() {
  const columns = useWorkspace(s => s.columns);
  const widths = useWorkspace(s => s.widths);
  const resizeColumns = useWorkspace(s => s.resizeColumns);
  const narrow = useNarrow();
  const boardRef = useRef<HTMLDivElement>(null);
  const count = paneCount({ columns, widths, nextId: 0 });

  if (narrow) {
    return (
      <div className="ws-root ws-root--narrow">
        {columns.flatMap((c, col) => c.panes.map((p, row) => (
          <Pane key={p.id} pane={p} at={{ col, row }} count={count} />
        )))}
      </div>
    );
  }

  return (
    <div ref={boardRef} className="ws-root">
      {columns.map((c, col) => (
        <div key={c.id} className="ws-slot" style={{ flexBasis: 0, flexGrow: widths[col] }}>
          <ColumnView col={col} count={count} />
          {col < columns.length - 1 && (
            <Divider vertical areaRef={boardRef} onMove={d => resizeColumns(col, d)} />
          )}
        </div>
      ))}
    </div>
  );
}
