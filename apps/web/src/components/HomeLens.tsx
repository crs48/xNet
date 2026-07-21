/**
 * The home surface's lens projections (exploration 0388).
 *
 * `/` is home for three lenses — All, Docs, Chats — so picking one has to
 * visibly change the main area, not just the sidebar. The chat projection is
 * built from the *same* registered sidebar sources the tree draws from, so the
 * two can't drift: one source of rows, two presentations.
 *
 * Docs keep their own instrumented query path in `index.tsx` (the instant-rows
 * overlay and boot marks of 0212/0249 hang off it), so this module only adds
 * what the doc list can't express.
 */
import { useNavigate } from '@tanstack/react-router'
import { navigateToNode } from '../workbench/navigation'
import { effectiveBadge, sortSidebarRows } from '../workbench/sidebar/contracts'
import { channelsSource } from '../workbench/sidebar/sources'
import { TAB_VIEWS } from '../workbench/tabs'

/** Heading for the home surface under each lens. */
export function homeHeading(lensId: string): string {
  if (lensId === 'chats') return 'Chats'
  if (lensId === 'all') return 'Everything'
  return 'All Documents'
}

/** Whether the doc list participates in this lens's projection. */
export function lensShowsDocs(lensId: string): boolean {
  return lensId !== 'chats'
}

/** Whether the chat list participates in this lens's projection. */
export function lensShowsChats(lensId: string): boolean {
  return lensId === 'chats' || lensId === 'all'
}

/**
 * Channels as a full-width list. Mounted only under the lenses that show
 * chats, so a docs-only view pays none of its queries (the per-schema fan-out
 * is real — 0317).
 */
export function HomeChats({
  heading,
  standalone
}: {
  heading?: string
  /** The only projection on screen — so it owns the empty state. */
  standalone?: boolean
}): React.JSX.Element | null {
  const navigate = useNavigate()
  const rows = sortSidebarRows(channelsSource.useRows(), { sortPolicy: 'recency' })

  if (rows.length === 0) {
    if (!standalone) return null
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="text-base font-medium text-foreground">No conversations yet</p>
        <p className="text-sm text-muted-foreground">
          Start a channel or a direct message and it shows up here.
        </p>
      </div>
    )
  }

  return (
    <section className="mb-6">
      {heading && (
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {heading}
        </h2>
      )}
      <ul className="list-none">
        {rows.map((row) => {
          const Icon = row.icon ?? TAB_VIEWS[row.nodeType]?.icon
          const badge = effectiveBadge(row)
          return (
            <li key={row.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => navigateToNode(navigate, row.nodeType, row.id)}
                className="-mx-2 flex w-full items-center gap-3 rounded-md border-none bg-transparent px-2 py-4 text-left text-foreground transition-colors hover:bg-accent/30"
              >
                {Icon && <Icon size={18} className="flex-shrink-0 text-muted-foreground" />}
                <span className={`flex-1 ${badge ? 'font-medium' : ''}`}>{row.title}</span>
                {badge !== null && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
                    {badge}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
