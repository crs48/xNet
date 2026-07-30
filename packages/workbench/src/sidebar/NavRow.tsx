/**
 * NavRow — the one primary-row primitive (exploration 0353).
 *
 * Every navigable row in the sidebar renders through this: user
 * sections, the Settings section list, and anything a future surface
 * would otherwise hand-roll. Sharing the primitive is the mechanical
 * half of "one nav" — divergent row markup is how nine navs happened.
 */
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function NavRow({
  icon: Icon,
  label,
  active,
  onClick,
  trailing,
  testId
}: {
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
  /** Badge, count, or affordance rendered at the row's end. */
  trailing?: ReactNode
  testId?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      data-nav-row={testId}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none px-2 py-1.5 text-left text-[13px] transition-colors ${
        active
          ? 'bg-accent font-medium text-ink-1'
          : 'bg-transparent text-ink-2 hover:bg-background-muted'
      }`}
    >
      <Icon size={16} strokeWidth={1.75} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  )
}
