import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKSPACE, MAX_PANES, MIN_SHARE, closePane, paneCount, parseWorkspace, resizeColumns, resizeRows,
  serializeWorkspace, setTab, splitDown, splitRight, swapPanes, type Workspace,
} from './model';

const tabs = (ws: Workspace) => ws.columns.map(c => c.panes.map(p => p.tab));
const ids = (ws: Workspace) => [...ws.columns.map(c => c.id), ...ws.columns.flatMap(c => c.panes.map(p => p.id))];

describe('workspace', () => {
  it('starts with one pane on Face', () => {
    expect(tabs(DEFAULT_WORKSPACE)).toEqual([['face']]);
    expect(DEFAULT_WORKSPACE.widths).toEqual([1]);
  });

  it('splits right into a new column, sharing the width, with a tab not shown yet', () => {
    const ws = splitRight(DEFAULT_WORKSPACE, { col: 0, row: 0 });
    expect(tabs(ws)).toEqual([['face'], ['sensors']]);
    expect(ws.widths).toEqual([0.5, 0.5]);
    const ws2 = splitRight(ws, { col: 0, row: 0 });
    expect(tabs(ws2)).toEqual([['face'], ['drive'], ['sensors']]);
    expect(ws2.widths).toEqual([0.25, 0.25, 0.5]);
    expect(new Set(ids(ws2)).size).toBe(ids(ws2).length);
  });

  it('splits down inside the column, sharing the height', () => {
    const ws = splitDown(splitRight(DEFAULT_WORKSPACE, { col: 0, row: 0 }), { col: 1, row: 0 });
    expect(tabs(ws)).toEqual([['face'], ['sensors', 'drive']]);
    expect(ws.columns[1].heights).toEqual([0.5, 0.5]);
    expect(ws.widths).toEqual([0.5, 0.5]);
    expect(new Set(ids(ws)).size).toBe(ids(ws).length);
  });

  it('stops at four panes in all', () => {
    let ws = DEFAULT_WORKSPACE;
    for (let i = 0; i < 3; i++) ws = splitDown(ws, { col: 0, row: 0 });
    expect(paneCount(ws)).toBe(MAX_PANES);
    expect(splitDown(ws, { col: 0, row: 0 })).toBe(ws);
    expect(splitRight(ws, { col: 0, row: 0 })).toBe(ws);
    expect(ws.columns[0].heights.reduce((s, h) => s + h, 0)).toBeCloseTo(1);
  });

  it('closes a pane: its height goes to the neighbour; a column\'s last pane closes the column', () => {
    const ws = splitDown(splitRight(DEFAULT_WORKSPACE, { col: 0, row: 0 }), { col: 1, row: 0 });
    const a = closePane(ws, { col: 1, row: 0 });
    expect(tabs(a)).toEqual([['face'], ['drive']]);
    expect(a.columns[1].heights).toEqual([1]);
    expect(a.columns[1].id).toBe(ws.columns[1].id);           // the column stays (no remount)
    const b = closePane(ws, { col: 0, row: 0 });
    expect(tabs(b)).toEqual([['sensors', 'drive']]);
    expect(b.widths).toEqual([1]);
    expect(closePane(DEFAULT_WORKSPACE, { col: 0, row: 0 })).toBe(DEFAULT_WORKSPACE);
  });

  it('changes a pane\'s tab', () => {
    expect(tabs(setTab(DEFAULT_WORKSPACE, { col: 0, row: 0 }, 'log'))).toEqual([['log']]);
  });

  it('resizes columns and rows, keeping a minimum share', () => {
    const ws = splitDown(splitRight(DEFAULT_WORKSPACE, { col: 0, row: 0 }), { col: 1, row: 0 });
    expect(resizeColumns(ws, 0, 0.1).widths).toEqual([0.6, 0.4]);
    expect(resizeColumns(ws, 0, 5).widths[1]).toBeCloseTo(MIN_SHARE);
    expect(resizeColumns(ws, 1, 0.1)).toBe(ws);                 // nothing right of the last column
    expect(resizeRows(ws, 1, 0, -0.2).columns[1].heights).toEqual([0.3, 0.7]);
    expect(resizeRows(ws, 0, 0, 0.1)).toBe(ws);                 // a single pane has no row divider
  });

  it('saves tabs and sizes and reads them back; broken data gives the default', () => {
    const ws = splitDown(splitRight(DEFAULT_WORKSPACE, { col: 0, row: 0 }), { col: 1, row: 0 });
    const back = parseWorkspace(JSON.parse(JSON.stringify(serializeWorkspace(ws))));
    expect(tabs(back)).toEqual(tabs(ws));
    expect(back.widths).toEqual([0.5, 0.5]);
    expect(back.columns[1].heights).toEqual([0.5, 0.5]);
    expect(new Set(ids(back)).size).toBe(ids(back).length);
    expect(parseWorkspace(null)).toBe(DEFAULT_WORKSPACE);
    expect(parseWorkspace({ columns: [{ tabs: ['nope'] }] })).toBe(DEFAULT_WORKSPACE);
    const many = parseWorkspace({ columns: [{ tabs: ['face', 'log', 'nav'] }, { tabs: ['plan', 'config'] }], widths: [1] });
    expect(paneCount(many)).toBe(MAX_PANES);
    expect(tabs(many)).toEqual([['face', 'log', 'nav'], ['plan']]);
    expect(many.widths).toEqual([0.5, 0.5]);
  });

  it('reads the older one-row save (one tab per column)', () => {
    const old = parseWorkspace({ tabs: ['face', 'log'], widths: [0.7, 0.3] });
    expect(tabs(old)).toEqual([['face'], ['log']]);
    expect(old.widths).toEqual([0.7, 0.3]);
  });

  it('swaps two panes\' places, keeping their tabs and ids', () => {
    const ws = splitDown(splitRight(DEFAULT_WORKSPACE, { col: 0, row: 0 }), { col: 1, row: 0 });
    const sw = swapPanes(ws, { col: 0, row: 0 }, { col: 1, row: 1 });
    expect(tabs(sw)).toEqual([['drive'], ['sensors', 'face']]);
    expect(sw.columns[0].panes[0].id).toBe(ws.columns[1].panes[1].id);
    expect(sw.widths).toEqual(ws.widths);
    expect(swapPanes(ws, { col: 0, row: 0 }, { col: 0, row: 0 })).toBe(ws);
  });
});
