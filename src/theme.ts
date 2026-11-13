// Dark / light theme.
//
// The colours themselves live in index.css as CSS variables (tokens); this
// module only decides which set is active by putting `data-theme` on <html>:
//   auto  → no attribute, the CSS follows `prefers-color-scheme`
//   light / dark → forced
// The choice is remembered in localStorage.
//
// Canvas and three.js can't read CSS variables, so `useThemeColors()` resolves
// the tokens to concrete strings and re-renders when the theme changes.
import { useMemo } from 'react';
import { create } from 'zustand';

export type ThemePref = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'smabo-web.theme';
// index.css is dark unless the OS asks for light, so mirror exactly that query
const media = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: light)')
  : null;

function loadPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch { /* storage unavailable */ }
  return 'auto';
}

const systemTheme = (): Theme => (media?.matches ? 'light' : 'dark');
const resolve = (pref: ThemePref): Theme => (pref === 'auto' ? systemTheme() : pref);

function applyAttr(pref: ThemePref) {
  const root = document.documentElement;
  // switch every colour at once instead of letting button/tab transitions fade
  root.classList.add('theme-switching');
  if (pref === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
}

interface ThemeState {
  pref: ThemePref;
  theme: Theme;              // what is actually shown
  setPref: (p: ThemePref) => void;
  cycle: () => void;         // auto → light → dark → auto
}

const initialPref = loadPref();

export const useTheme = create<ThemeState>((set, get) => ({
  pref: initialPref,
  theme: resolve(initialPref),
  setPref: (pref) => {
    applyAttr(pref);
    try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
    set({ pref, theme: resolve(pref) });
  },
  cycle: () => {
    const order: ThemePref[] = ['auto', 'light', 'dark'];
    get().setPref(order[(order.indexOf(get().pref) + 1) % order.length]);
  },
}));

/** Call once before the first render so the page never flashes the wrong theme. */
export function initTheme() {
  applyAttr(useTheme.getState().pref);
  media?.addEventListener('change', () => {
    const { pref } = useTheme.getState();
    if (pref === 'auto') useTheme.setState({ theme: systemTheme() });
  });
}

/** Read one CSS token (e.g. '--accent') as it is currently resolved. */
export function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface ThemeColors {
  bg: string; bg2: string; bg3: string; border: string;
  text: string; dim: string; accent: string; cyan: string; orange: string; green: string;
  canvas: string;            // background of drawing surfaces (trail map)
  padFill: string;           // inside of joystick / gaze pad
  knobEdge: string;          // outline of the joystick knob / gaze dot
  grid: string;              // 3D grid lines
  gridCenter: string;        // 3D grid centre lines
}

/** Token values for canvas / WebGL drawing; changes identity when the theme changes. */
export function useThemeColors(): ThemeColors {
  const theme = useTheme(s => s.theme);
  // data-theme is set synchronously in setPref (and the media query has already
  // flipped for 'auto'), so the tokens read here are the new ones.
  return useMemo(() => ({
    bg: cssToken('--bg'), bg2: cssToken('--bg2'), bg3: cssToken('--bg3'), border: cssToken('--border'),
    text: cssToken('--text'), dim: cssToken('--dim'), accent: cssToken('--accent'), cyan: cssToken('--cyan'),
    orange: cssToken('--orange'), green: cssToken('--green'),
    canvas: cssToken('--canvas'), padFill: cssToken('--pad-fill'), knobEdge: cssToken('--knob-edge'),
    grid: cssToken('--grid'), gridCenter: cssToken('--grid-center'),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [theme]);
}
