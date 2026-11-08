// Layout data model.
//
// A layout is a binary split tree: every split divides its area into `a` and
// `b` along `split` ('row' = side by side, 'column' = stacked) at `ratio`
// (share of `a`, 0..1). Leaves name a panel from the registry (panels.tsx),
// with optional props (e.g. which sections of a tab to show).
//
// Sizes are ratios, never pixels, so a template looks the same on any screen.

import type { Capability } from './capabilities';

export type PanelId =
  | 'face' | 'sensors' | 'drive' | 'servo' | 'vision' | 'nav' | 'plan'
  | 'config' | 'log' | 'connection' | 'devices' | 'tabs'
  | 'empty';                    // a new pane waiting for the user to pick a panel

export interface PanelLeaf {
  panel: PanelId;
  props?: Record<string, unknown>;
  title?: string;               // overrides the registry title
}

export interface SplitNode {
  split: 'row' | 'column';
  ratio: number;
  a: LayoutNode;
  b: LayoutNode;
}

export type LayoutNode = PanelLeaf | SplitNode;

export const isSplit = (n: LayoutNode): n is SplitNode => 'split' in n;

export type Phase = 'mine' | 'general' | 'brain' | 'esp32' | 'ros';

export interface Template {
  id: string;
  title: string;                // shown in the picker (guide name for guide templates)
  phase: Phase;
  guide?: string;               // guide page file name (docs/guides/<guide>.html)
  requires: Capability[];       // what the guide needs connected
  note?: string;
  layout: LayoutNode;
}

/** Address of a node in the tree: '' = root, then 'a' / 'b' per level. */
export type NodePath = string;
