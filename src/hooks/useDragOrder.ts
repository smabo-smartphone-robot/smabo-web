import { useState, useRef } from 'react';

/** Drag-and-drop reorder hook. Order is persisted to localStorage.
 *  onSave is called with the new order after every successful drag-drop. */
export function useDragOrder(storageKey: string, onSave?: (order: string[]) => void) {
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v) return JSON.parse(v) as string[];
    } catch {}
    return [];
  });

  const dragging = useRef<string | null>(null);

  /** Returns keys sorted by saved order, appending unknown keys at end. */
  function sort(keys: readonly string[]): string[] {
    return [
      ...order.filter(k => (keys as string[]).includes(k)),
      ...(keys as string[]).filter(k => !order.includes(k)),
    ];
  }

  /** Put on the drag handle element (⠿ span). */
  function handleProps(key: string) {
    return {
      draggable: true as const,
      onDragStart(e: React.DragEvent) {
        dragging.current = key;
        e.dataTransfer.effectAllowed = 'move';
      },
      onDragEnd() { dragging.current = null; },
    };
  }

  /** Put on the droppable container (card / panel div). */
  function dropProps(key: string, all: readonly string[]) {
    return {
      onDragOver(e: React.DragEvent) { e.preventDefault(); },
      onDrop(e: React.DragEvent) {
        e.preventDefault();
        const src = dragging.current;
        if (!src || src === key) return;
        setOrder(prev => {
          const merged = [
            ...prev.filter(k => (all as string[]).includes(k)),
            ...(all as string[]).filter(k => !prev.includes(k)),
          ];
          const fi = merged.indexOf(src), ti = merged.indexOf(key);
          if (fi < 0 || ti < 0) return prev;
          const next = [...merged];
          next.splice(fi, 1);
          next.splice(ti, 0, src);
          localStorage.setItem(storageKey, JSON.stringify(next));
          onSave?.(next);
          return next;
        });
        dragging.current = null;
      },
    };
  }

  return { sort, handleProps, dropProps, order };
}
