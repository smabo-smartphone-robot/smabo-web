import { useState, useRef } from 'react';

/** Drag-and-drop reorder hook. Order is persisted to localStorage.
 *  onSave is called with the new order after every successful drag-drop.
 *
 *  Looks like swapping workspace panes: the whole item follows the pointer,
 *  the item being moved fades and the item under the pointer gets an outline
 *  (`data-drag-state="source" | "over"` on the dropProps element). */
export function useDragOrder(storageKey: string, onSave?: (order: string[]) => void) {
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v) return JSON.parse(v) as string[];
    } catch {}
    return [];
  });

  const dragging = useRef<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const end = () => { dragging.current = null; setSource(null); setOver(null); };

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
      title: 'Drag to move',
      onDragStart(e: React.DragEvent) {
        dragging.current = key;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', key);
        // drag the whole item, not just the handle
        const item = (e.currentTarget as HTMLElement).closest('[data-drag-item]');
        if (item) {
          const r = item.getBoundingClientRect();
          e.dataTransfer.setDragImage(item, e.clientX - r.left, e.clientY - r.top);
        }
        // after the browser has taken the drag image
        setTimeout(() => { if (dragging.current === key) setSource(key); }, 0);
      },
      onDragEnd: end,
    };
  }

  /** Put on the droppable container (card / panel div). */
  function dropProps(key: string, all: readonly string[]) {
    return {
      'data-drag-item': key,
      'data-drag-state': source === key ? 'source' : over === key && source !== null ? 'over' : undefined,
      onDragOver(e: React.DragEvent) {
        if (!dragging.current) return;            // not one of ours (e.g. a pane being swapped)
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (over !== key) setOver(key);
      },
      onDragLeave(e: React.DragEvent) {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(o => (o === key ? null : o));
      },
      onDrop(e: React.DragEvent) {
        const src = dragging.current;
        if (!src) return;
        e.preventDefault();
        end();
        if (src === key) return;
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
      },
    };
  }

  return { sort, handleProps, dropProps, order };
}
