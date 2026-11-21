// The workspace: columns side by side, each with panes stacked top to bottom,
// up to 4 panes in all. Each pane shows one tab.
//
// Pure functions on the state (tested in model.test.ts); useWorkspace.ts
// keeps the state and saves it in localStorage.

// Tab ids in tab-bar order (tabs.ts gives each its label and component).
export const TAB_IDS = ['face', 'sensors', 'drive', 'servo', 'vision', 'nav', 'plan', 'config', 'log'] as const;
export type TabId = typeof TAB_IDS[number];
export const isTabId = (v: unknown): v is TabId => (TAB_IDS as readonly unknown[]).includes(v);

export const MAX_PANES = 4;
export const MIN_SHARE = 0.1;            // a pane never gets narrower / shorter than this share

export interface Pane {
  id: number;                            // stable key, so a pane keeps its tabs mounted
  tab: TabId;
}

export interface Column {
  id: number;                            // stable key, like a pane's
  panes: Pane[];
  heights: number[];                     // share of each pane in the column, summing to 1
}

export interface Workspace {
  columns: Column[];
  widths: number[];                      // share of each column, summing to 1
  nextId: number;
}

/** Where a pane is: column, then row within the column. */
export interface At { col: number; row: number }

export const DEFAULT_WORKSPACE: Workspace = {
  columns: [{ id: 0, panes: [{ id: 1, tab: 'face' }], heights: [1] }],
  widths: [1],
  nextId: 2,
};

export const paneCount = (ws: Workspace) => ws.columns.reduce((n, c) => n + c.panes.length, 0);

const paneAt = (ws: Workspace, at: At): Pane | undefined => ws.columns[at.col]?.panes[at.row];

const halve = (shares: number[], i: number) => [...shares.slice(0, i), shares[i] / 2, shares[i] / 2, ...shares.slice(i + 1)];

/** Give share `i` to its neighbour (left/up, or right/down for the first) and drop it. */
function dropShare(shares: number[], i: number): number[] {
  const out = [...shares];
  out[i > 0 ? i - 1 : 1] += out[i];
  out.splice(i, 1);
  return out;
}

/** Move the boundary after share `i` by `delta`, keeping both sides at least MIN_SHARE. */
function moveBoundary(shares: number[], i: number, delta: number): number[] | null {
  if (i < 0 || i >= shares.length - 1) return null;
  const a = shares[i];
  const b = shares[i + 1];
  const d = Math.max(MIN_SHARE - a, Math.min(b - MIN_SHARE, delta));
  const out = [...shares];
  out[i] = a + d;
  out[i + 1] = b - d;
  return out;
}

/** The next tab after `from` that no pane shows yet (or `from` itself if all are shown). */
function nextTab(ws: Workspace, from: TabId): TabId {
  const shown = new Set(ws.columns.flatMap(c => c.panes.map(p => p.tab)));
  const i = TAB_IDS.indexOf(from);
  return [...TAB_IDS.slice(i + 1), ...TAB_IDS.slice(0, i + 1)].find(t => !shown.has(t)) ?? from;
}

export function setTab(ws: Workspace, at: At, tab: TabId): Workspace {
  if (!paneAt(ws, at)) return ws;
  return {
    ...ws,
    columns: ws.columns.map((c, ci) => (ci !== at.col ? c : {
      ...c, panes: c.panes.map((p, ri) => (ri === at.row ? { ...p, tab } : p)),
    })),
  };
}

/** A new column right of the pane's column, sharing its width. */
export function splitRight(ws: Workspace, at: At): Workspace {
  const pane = paneAt(ws, at);
  if (!pane || paneCount(ws) >= MAX_PANES) return ws;
  const col: Column = { id: ws.nextId, panes: [{ id: ws.nextId + 1, tab: nextTab(ws, pane.tab) }], heights: [1] };
  return {
    columns: [...ws.columns.slice(0, at.col + 1), col, ...ws.columns.slice(at.col + 1)],
    widths: halve(ws.widths, at.col),
    nextId: ws.nextId + 2,
  };
}

/** A new pane below the pane, sharing its height. */
export function splitDown(ws: Workspace, at: At): Workspace {
  const pane = paneAt(ws, at);
  if (!pane || paneCount(ws) >= MAX_PANES) return ws;
  const newPane = { id: ws.nextId, tab: nextTab(ws, pane.tab) };
  return {
    ...ws,
    columns: ws.columns.map((c, ci) => (ci !== at.col ? c : {
      id: c.id,
      panes: [...c.panes.slice(0, at.row + 1), newPane, ...c.panes.slice(at.row + 1)],
      heights: halve(c.heights, at.row),
    })),
    nextId: ws.nextId + 1,
  };
}

/** Swap two panes' places (each keeps its tab). */
export function swapPanes(ws: Workspace, a: At, b: At): Workspace {
  const pa = paneAt(ws, a);
  const pb = paneAt(ws, b);
  if (!pa || !pb || pa === pb) return ws;
  return {
    ...ws,
    columns: ws.columns.map((c, ci) => ({
      ...c,
      panes: c.panes.map((p, ri) => (ci === a.col && ri === a.row ? pb : ci === b.col && ri === b.row ? pa : p)),
    })),
  };
}

/** Close a pane (never the last one); its space goes to its neighbour. */
export function closePane(ws: Workspace, at: At): Workspace {
  if (!paneAt(ws, at) || paneCount(ws) <= 1) return ws;
  const col = ws.columns[at.col];
  if (col.panes.length === 1) {
    return { ...ws, columns: ws.columns.filter((_, i) => i !== at.col), widths: dropShare(ws.widths, at.col) };
  }
  return {
    ...ws,
    columns: ws.columns.map((c, ci) => (ci !== at.col ? c : {
      id: c.id,
      panes: c.panes.filter((_, ri) => ri !== at.row),
      heights: dropShare(c.heights, at.row),
    })),
  };
}

/** Move the divider right of column `col` by `delta` (share of the whole width). */
export function resizeColumns(ws: Workspace, col: number, delta: number): Workspace {
  const widths = moveBoundary(ws.widths, col, delta);
  return widths ? { ...ws, widths } : ws;
}

/** Move the divider below pane `row` of column `col` by `delta` (share of the column's height). */
export function resizeRows(ws: Workspace, col: number, row: number, delta: number): Workspace {
  const c = ws.columns[col];
  const heights = c && moveBoundary(c.heights, row, delta);
  if (!heights) return ws;
  return { ...ws, columns: ws.columns.map((x, i) => (i === col ? { ...x, heights } : x)) };
}

function normalized(shares: unknown, n: number): number[] {
  let out = Array.isArray(shares) ? shares.map(Number) : [];
  if (out.length !== n || out.some(w => !(w > 0))) out = Array.from({ length: n }, () => 1 / n);
  const sum = out.reduce((s, w) => s + w, 0);
  return out.map(w => w / sum);
}

/** A saved workspace, or the default when it is missing or broken. */
export function parseWorkspace(raw: unknown): Workspace {
  if (!raw || typeof raw !== 'object') return DEFAULT_WORKSPACE;
  const r = raw as Record<string, unknown>;
  // columns of tabs; an older save had one tab per column (`tabs`)
  let cols: { tabs: TabId[]; heights: unknown }[] = [];
  if (Array.isArray(r.columns)) {
    cols = r.columns.map(c => {
      const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      return { tabs: Array.isArray(o.tabs) ? o.tabs.filter(isTabId) : [], heights: o.heights };
    });
  } else if (Array.isArray(r.tabs)) {
    cols = r.tabs.filter(isTabId).map(t => ({ tabs: [t], heights: [1] }));
  }
  // keep at most MAX_PANES panes; drop empty columns
  let left = MAX_PANES;
  const kept = cols.map(c => {
    const tabs = c.tabs.slice(0, Math.max(0, left));
    left -= tabs.length;
    return { tabs, heights: tabs.length === c.tabs.length ? c.heights : null };
  });
  const keepIdx = kept.map((c, i) => (c.tabs.length ? i : -1)).filter(i => i >= 0);
  if (keepIdx.length === 0) return DEFAULT_WORKSPACE;
  const allWidths = Array.isArray(r.widths) && r.widths.length === cols.length ? r.widths : null;
  let id = 0;
  return {
    columns: keepIdx.map(i => ({
      id: id++,
      panes: kept[i].tabs.map(tab => ({ id: id++, tab })),
      heights: normalized(kept[i].heights, kept[i].tabs.length),
    })),
    widths: normalized(allWidths ? keepIdx.map(i => allWidths[i]) : null, keepIdx.length),
    nextId: id,
  };
}

/** What is saved: the tabs and sizes (pane ids are only for this page load). */
export const serializeWorkspace = (ws: Workspace) => ({
  columns: ws.columns.map(c => ({ tabs: c.panes.map(p => p.tab), heights: c.heights })),
  widths: ws.widths,
});
