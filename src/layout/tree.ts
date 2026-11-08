// Pure edits of a layout tree (split / close / replace / move / resize).
// Every function returns a new tree and leaves the input untouched; nodes that
// are not on the edited path keep their identity.
import { isSplit, type LayoutNode, type NodePath, type PanelLeaf, type SplitNode } from './types';

/** Where a dragged panel lands on another one: beside it, or swapped with it. */
export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center';
export type SideZone = Exclude<DropZone, 'center'>;

export function nodeAt(node: LayoutNode, path: NodePath): LayoutNode | null {
  let n: LayoutNode = node;
  for (const step of path) {
    if (!isSplit(n)) return null;
    n = step === 'a' ? n.a : n.b;
  }
  return n;
}

export function replaceAt(root: LayoutNode, path: NodePath, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  if (path === '') return fn(root);
  if (!isSplit(root)) return root;
  const rest = path.slice(1);
  return path[0] === 'a'
    ? { ...root, a: replaceAt(root.a, rest, fn) }
    : { ...root, b: replaceAt(root.b, rest, fn) };
}

/** Remove the node at `path`; its sibling takes the parent's place. The root can't be removed. */
export function removeAt(root: LayoutNode, path: NodePath): LayoutNode | null {
  if (path === '') return null;
  const side = path[path.length - 1];
  return replaceAt(root, path.slice(0, -1), p => (isSplit(p) ? (side === 'a' ? p.b : p.a) : p));
}

/** Put `leaf` next to the node at `path`, halving its space. */
export function splitAt(root: LayoutNode, path: NodePath, zone: SideZone, leaf: LayoutNode): LayoutNode {
  const split = zone === 'left' || zone === 'right' ? 'row' : 'column';
  const first = zone === 'left' || zone === 'top';
  return replaceAt(root, path, n => ({ split, ratio: 0.5, a: first ? leaf : n, b: first ? n : leaf }));
}

export function setRatioAt(root: LayoutNode, path: NodePath, ratio: number): LayoutNode {
  return replaceAt(root, path, n => (isSplit(n) ? { ...n, ratio } : n));
}

function pathOf(root: LayoutNode, target: LayoutNode, path: NodePath = ''): NodePath | null {
  if (root === target) return path;
  if (!isSplit(root)) return null;
  return pathOf(root.a, target, path + 'a') ?? pathOf(root.b, target, path + 'b');
}

/** Move the panel at `from` onto the panel at `to` (both leaves). */
export function moveNode(root: LayoutNode, from: NodePath, to: NodePath, zone: DropZone): LayoutNode {
  if (from === to) return root;
  const src = nodeAt(root, from);
  const dst = nodeAt(root, to);
  if (!src || !dst) return root;
  if (zone === 'center') {
    return replaceAt(replaceAt(root, from, () => dst), to, () => src);
  }
  const removed = removeAt(root, from);
  if (!removed) return root;
  const at = pathOf(removed, dst);          // dst's path shifts when its sibling was the one removed
  return at == null ? root : splitAt(removed, at, zone, src);
}

/** Where each panel sits, as fractions of the whole layout (dividers ignored). */
export interface Rect { x: number; y: number; w: number; h: number }
export interface LeafRect extends Rect { leaf: PanelLeaf; path: NodePath }
export interface SplitRect extends Rect { node: SplitNode; path: NodePath }

export function leafRects(node: LayoutNode, path: NodePath = '', x = 0, y = 0, w = 1, h = 1): LeafRect[] {
  if (!isSplit(node)) return [{ leaf: node, path, x, y, w, h }];
  const r = node.ratio;
  return node.split === 'row'
    ? [...leafRects(node.a, path + 'a', x, y, w * r, h), ...leafRects(node.b, path + 'b', x + w * r, y, w * (1 - r), h)]
    : [...leafRects(node.a, path + 'a', x, y, w, h * r), ...leafRects(node.b, path + 'b', x, y + h * r, w, h * (1 - r))];
}

export function splitRects(node: LayoutNode, path: NodePath = '', x = 0, y = 0, w = 1, h = 1): SplitRect[] {
  if (!isSplit(node)) return [];
  const r = node.ratio;
  const [ra, rb]: [Rect, Rect] = node.split === 'row'
    ? [{ x, y, w: w * r, h }, { x: x + w * r, y, w: w * (1 - r), h }]
    : [{ x, y, w, h: h * r }, { x, y: y + h * r, w, h: h * (1 - r) }];
  return [{ node, path, x, y, w, h },
    ...splitRects(node.a, path + 'a', ra.x, ra.y, ra.w, ra.h),
    ...splitRects(node.b, path + 'b', rb.x, rb.y, rb.w, rb.h)];
}
