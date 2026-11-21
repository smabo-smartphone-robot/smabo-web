import type { ReactNode } from 'react'

/** A small "!" badge that shows its hint while hovered or focused (tap focuses it on touch screens). */
export function HintIcon({ children, label = 'ヒント' }: { children: ReactNode; label?: string }) {
  return (
    <span className="hint-icon" tabIndex={0} role="note" aria-label={label}>
      !
      <span className="hint-icon-tip" role="tooltip">{children}</span>
    </span>
  )
}
