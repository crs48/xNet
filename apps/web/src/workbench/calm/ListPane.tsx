/**
 * ListPane — the calm shell's mode-dependent list column (exploration 0250).
 *
 * Companion → conversations; Workspace → the Explorer doc/space tree (reused
 * verbatim from the workbench); Network → the people/social nav. Collapsible
 * via the shared `left` panel state, so ⌘B toggles it just like the workbench.
 */
import { useWorkbench, type CalmMode } from '../state'
import { Explorer } from '../views/Explorer'
import { CompanionList } from './CompanionList'
import { NetworkList } from './NetworkList'

function ListBody({ mode }: { mode: CalmMode }) {
  switch (mode) {
    case 'companion':
      return <CompanionList />
    case 'network':
      return <NetworkList />
    case 'workspace':
    default:
      return <Explorer />
  }
}

export function ListPane({ mode }: { mode: CalmMode }) {
  // The route is authoritative for the *highlight*, but the list column follows
  // the explicitly-chosen mode so a modeless surface (settings) keeps its list.
  const calmMode = useWorkbench((state) => state.calmMode)
  const effective = mode ?? calmMode
  return (
    <aside
      data-wb-region="left"
      className="flex h-full min-h-0 w-[var(--list-width,17rem)] shrink-0 flex-col border-r border-hairline bg-surface-1"
    >
      <ListBody mode={effective} />
    </aside>
  )
}
