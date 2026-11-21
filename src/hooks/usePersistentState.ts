// UI state that survives a page reload: useState backed by localStorage.
//
// Only for what the user set (inputs, choices, open sections), never for live
// data (connection status, measurements, busy flags). Every key is prefixed
// with "smabo-ui:". Without storage (private window, blocked site data) it
// behaves like useState.
import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

const PREFIX = 'smabo-ui:';

export function loadPersisted<T>(key: string, initial: T, valid?: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return initial;
    const v: unknown = JSON.parse(raw);
    if (valid ? valid(v) : sameShape(v, initial)) return v as T;
  } catch { /* no storage, or not JSON */ }
  return initial;
}

export function savePersisted(key: string, value: unknown): void {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* no storage */ }
}

/** A stored value is used only when it looks like the default (same type; for an
 *  object, same kind), so an old or broken entry falls back to the default. */
function sameShape(v: unknown, initial: unknown): boolean {
  if (initial === null || initial === undefined) return true;
  if (Array.isArray(initial)) return Array.isArray(v);
  if (typeof initial === 'object') return !!v && typeof v === 'object' && !Array.isArray(v);
  return typeof v === typeof initial;
}

export function usePersistentState<T>(
  key: string, initial: T, valid?: (v: unknown) => v is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => loadPersisted(key, initial, valid));
  const set = useCallback<Dispatch<SetStateAction<T>>>(next => {
    setValue(prev => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      savePersisted(key, v);
      return v;
    });
  }, [key]);
  return [value, set];
}

// validators for stored values that need more than "same type as the default"
export const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(x => typeof x === 'string');

export const isNumberOrNull = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isFinite(v));

export const isNumberRecord = (v: unknown): v is Record<string, number> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
  && Object.values(v).every(x => typeof x === 'number' && Number.isFinite(x));

/** An object whose `keys` are all finite numbers. */
export function isNumberRecordOf<T>(keys: string[]) {
  return (v: unknown): v is T => isNumberRecord(v) && keys.every(k => k in v);
}
