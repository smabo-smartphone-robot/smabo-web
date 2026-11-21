// <details> that remembers whether it was open, across a page reload.
import type { ReactNode } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';

export function Details({ id, defaultOpen = false, children }: {
  id: string;               // storage key, unique per section
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = usePersistentState(`details.${id}`, defaultOpen);
  return (
    <details open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      {children}
    </details>
  );
}
