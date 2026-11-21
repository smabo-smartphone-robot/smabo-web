import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
});

const { loadPersisted, savePersisted, isStrings, isNumberOrNull, isNumberRecordOf } =
  await import('./usePersistentState');

describe('persisted UI state', () => {
  beforeEach(() => store.clear());

  it('gives back what was saved before the reload', () => {
    savePersisted('drive.maxLin', 0.45);
    savePersisted('nav.goal', { x: 2, y: -1, yaw: 1.57 });
    expect(loadPersisted('drive.maxLin', 0.3)).toBe(0.45);
    expect(loadPersisted('nav.goal', { x: 1, y: 0, yaw: 0 })).toEqual({ x: 2, y: -1, yaw: 1.57 });
  });

  it('uses the default when nothing was saved', () => {
    expect(loadPersisted('log.filter', '')).toBe('');
  });

  it('ignores a stored value of the wrong type or broken JSON', () => {
    store.set('smabo-ui:drive.maxLin', '"fast"');
    store.set('smabo-ui:nav.view', '{oops');
    expect(loadPersisted('drive.maxLin', 0.3)).toBe(0.3);
    expect(loadPersisted('nav.view', '2d')).toBe('2d');
  });

  it('checks values with a validator when given one', () => {
    const isPose = isNumberRecordOf<{ x: number; y: number; yaw: number }>(['x', 'y', 'yaw']);
    savePersisted('nav.init', { x: 1 });
    expect(loadPersisted('nav.init', { x: 0, y: 0, yaw: 0 }, isPose)).toEqual({ x: 0, y: 0, yaw: 0 });
    savePersisted('face.history', ['hi', 3]);
    expect(loadPersisted('face.history', [], isStrings)).toEqual([]);
    savePersisted('expr.selected', null);
    expect(loadPersisted<number | null>('expr.selected', 4, isNumberOrNull)).toBeNull();
  });

  it('works like plain state without storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    expect(() => savePersisted('x', 1)).not.toThrow();
    expect(loadPersisted('x', 7)).toBe(7);
  });
});
