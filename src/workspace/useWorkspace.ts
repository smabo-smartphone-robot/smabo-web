// The open panes and their tabs, remembered in localStorage.
import { create } from 'zustand';
import {
  closePane, parseWorkspace, resizeColumns, resizeRows, serializeWorkspace, setTab, splitDown, splitRight, swapPanes,
  type At, type TabId, type Workspace,
} from './model';

const KEY = 'smabo-web.workspace';

function load(): Workspace {
  try {
    const v = localStorage.getItem(KEY);
    return parseWorkspace(v ? JSON.parse(v) : null);
  } catch {
    return parseWorkspace(null);
  }
}

function save(ws: Workspace) {
  try { localStorage.setItem(KEY, JSON.stringify(serializeWorkspace(ws))); } catch { /* ignore */ }
}

interface WorkspaceState extends Workspace {
  setTab(at: At, tab: TabId): void;
  splitRight(at: At): void;
  splitDown(at: At): void;
  close(at: At): void;
  swap(a: At, b: At): void;
  resizeColumns(col: number, delta: number): void;
  resizeRows(col: number, row: number, delta: number): void;
}

export const useWorkspace = create<WorkspaceState>((set, get) => {
  const apply = (f: (ws: Workspace) => Workspace) => {
    const { columns, widths, nextId } = get();
    const next = f({ columns, widths, nextId });
    set(next);
    save(next);
  };
  return {
    ...load(),
    setTab: (at, tab) => apply(ws => setTab(ws, at, tab)),
    splitRight: (at) => apply(ws => splitRight(ws, at)),
    splitDown: (at) => apply(ws => splitDown(ws, at)),
    close: (at) => apply(ws => closePane(ws, at)),
    swap: (a, b) => apply(ws => swapPanes(ws, a, b)),
    resizeColumns: (col, d) => apply(ws => resizeColumns(ws, col, d)),
    resizeRows: (col, row, d) => apply(ws => resizeRows(ws, col, row, d)),
  };
});
