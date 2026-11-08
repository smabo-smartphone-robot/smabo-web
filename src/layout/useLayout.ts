// Which template is open, and the user's changes to it.
//
// Standard templates are never modified. Any change to the open template —
// resizing, splitting, closing, replacing or moving panels — is stored as an
// edited copy of its tree (localStorage, per template); "Reset layout" drops
// it. An edited tree can be saved as a "My layout", which then appears in the
// template list like the standard ones.
//
// The open template is also reflected in the URL (?template=<id>) so a guide
// can link straight to it.
import { create } from 'zustand';
import { TEMPLATES, DEFAULT_TEMPLATE } from './templates';
import { isSplit, type LayoutNode, type NodePath, type Template } from './types';
import { setRatioAt, type DropZone } from './tree';

const KEY_CURRENT = 'smabo-web.template';
const KEY_CUSTOM = 'smabo-web.custom';
const keyTree = (id: string) => `smabo-web.tree.${id}`;
const keyRatios = (id: string) => `smabo-web.layout.${id}`;   // older format: ratio overrides only

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}
function writeJson(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}
function remove(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function findTemplate(id: string, custom: Template[]): Template | undefined {
  return custom.find(t => t.id === id) ?? TEMPLATES.find(t => t.id === id);
}

function applyRatios(node: LayoutNode, ratios: Record<NodePath, number>, path: NodePath = ''): LayoutNode {
  if (!isSplit(node)) return node;
  return {
    ...node,
    ratio: ratios[path] ?? node.ratio,
    a: applyRatios(node.a, ratios, path + 'a'),
    b: applyRatios(node.b, ratios, path + 'b'),
  };
}

function loadEdited(id: string, custom: Template[]): LayoutNode | null {
  const tree = readJson<LayoutNode | null>(keyTree(id), null);
  if (tree) return tree;
  const ratios = readJson<Record<NodePath, number>>(keyRatios(id), {});
  const tpl = findTemplate(id, custom);
  return tpl && Object.keys(ratios).length ? applyRatios(tpl.layout, ratios) : null;
}

function initialTemplate(custom: Template[]): string {
  const fromUrl = new URLSearchParams(window.location.search).get('template');
  if (fromUrl && findTemplate(fromUrl, custom)) return fromUrl;
  try {
    const saved = localStorage.getItem(KEY_CURRENT);
    if (saved && findTemplate(saved, custom)) return saved;
  } catch { /* ignore */ }
  return DEFAULT_TEMPLATE;
}

function syncUrl(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('template', id);
  window.history.replaceState(null, '', url);
}

export const RATIO_MIN = 0.1;
export const RATIO_MAX = 0.9;
const clampRatio = (r: number) => Math.min(RATIO_MAX, Math.max(RATIO_MIN, r));

interface LayoutState {
  templateId: string;
  custom: Template[];                      // "My layouts"
  edited: LayoutNode | null;               // the user's copy of the open template's tree
  maximized: NodePath | null;              // a panel shown alone (double-click its title)
  dragFrom: NodePath | null;               // panel being dragged to a new place
  dropPreview: { to: NodePath; zone: DropZone } | null;   // where it would land right now
  pickerOpen: boolean;
  open: (id: string) => void;
  setRatio: (path: NodePath, ratio: number) => void;
  /** Apply a tree edit to the open template (null result = refuse). */
  edit: (fn: (tree: LayoutNode) => LayoutNode | null) => void;
  reset: () => void;
  saveAs: (title: string) => void;
  saveChanges: () => void;                 // write the edits back into the open "My layout"
  deleteCustom: (id: string) => void;
  setMaximized: (path: NodePath | null) => void;
  setDragFrom: (path: NodePath | null) => void;
  setDropPreview: (p: { to: NodePath; zone: DropZone } | null) => void;
  setPickerOpen: (open: boolean) => void;
}

const startCustom = readJson<Template[]>(KEY_CUSTOM, []);
const startId = initialTemplate(startCustom);
syncUrl(startId);

export const useLayout = create<LayoutState>((set, get) => {
  const tree = () => {
    const s = get();
    return s.edited ?? (findTemplate(s.templateId, s.custom) ?? TEMPLATES[0]).layout;
  };
  const storeEdited = (edited: LayoutNode) => {
    writeJson(keyTree(get().templateId), edited);
    remove(keyRatios(get().templateId));
    set({ edited });
  };

  return {
    templateId: startId,
    custom: startCustom,
    edited: loadEdited(startId, startCustom),
    maximized: null,
    dragFrom: null,
    dropPreview: null,
    pickerOpen: false,

    open: (id) => {
      const { custom } = get();
      if (!findTemplate(id, custom)) return;
      try { localStorage.setItem(KEY_CURRENT, id); } catch { /* ignore */ }
      syncUrl(id);
      set({ templateId: id, edited: loadEdited(id, custom), maximized: null, dragFrom: null, dropPreview: null, pickerOpen: false });
    },

    setRatio: (path, ratio) => storeEdited(setRatioAt(tree(), path, clampRatio(ratio))),

    edit: (fn) => {
      const next = fn(tree());
      if (!next) return;
      storeEdited(next);
      set({ maximized: null });
    },

    reset: () => {
      remove(keyTree(get().templateId));
      remove(keyRatios(get().templateId));
      set({ edited: null, maximized: null });
    },

    saveAs: (title) => {
      const t: Template = {
        id: `my-${Date.now().toString(36)}`,
        title: title.trim() || 'My layout',
        phase: 'mine',
        requires: [],
        layout: tree(),
      };
      const custom = [...get().custom, t];
      writeJson(KEY_CUSTOM, custom);
      // the edits now live in the new layout; the template they came from goes back to its own
      remove(keyTree(get().templateId));
      remove(keyRatios(get().templateId));
      set({ custom });
      get().open(t.id);
      set({ pickerOpen: true });
    },

    saveChanges: () => {
      const { templateId, custom, edited } = get();
      if (!edited || !custom.some(t => t.id === templateId)) return;
      const next = custom.map(t => (t.id === templateId ? { ...t, layout: edited } : t));
      writeJson(KEY_CUSTOM, next);
      remove(keyTree(templateId));
      set({ custom: next, edited: null });
    },

    deleteCustom: (id) => {
      const custom = get().custom.filter(t => t.id !== id);
      writeJson(KEY_CUSTOM, custom);
      remove(keyTree(id));
      set({ custom });
      if (get().templateId === id) { get().open(DEFAULT_TEMPLATE); set({ pickerOpen: true }); }
    },

    setMaximized: (maximized) => set({ maximized }),
    setDragFrom: (dragFrom) => set({ dragFrom, dropPreview: null }),
    setDropPreview: (p) => {
      const cur = get().dropPreview;
      if (cur === p || (cur && p && cur.to === p.to && cur.zone === p.zone)) return;
      set({ dropPreview: p });
    },
    setPickerOpen: (pickerOpen) => set({ pickerOpen }),
  };
});

/** The open template (standard or "My layout"). */
export function useTemplate(): Template {
  const id = useLayout(s => s.templateId);
  const custom = useLayout(s => s.custom);
  return findTemplate(id, custom) ?? findTemplate(DEFAULT_TEMPLATE, [])!;
}

/** The tree to render: the user's edited copy, else the template's own. */
export function useTree(): LayoutNode {
  const template = useTemplate();
  const edited = useLayout(s => s.edited);
  return edited ?? template.layout;
}
