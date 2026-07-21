/**
 * Section rows (exploration 0353) — the top island's primary rows,
 * rendered from the user's sections instead of the twelve `SURFACES`.
 *
 * One grammar: a lens switches the tree below, a route navigates, a
 * pinned node opens. No panel/route fork, and no per-feature nav.
 */
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useRequestCount } from '../../hooks/useRequestCount'
import { useWorkbench } from '../state'
import { NavRow } from './NavRow'
import { sidebarRegistry } from './registry'
import { isSectionActive, resolveSections, sectionIcon, type SidebarSection } from './sections'

/** Sections in user order, split into primary rows and the rest. */
export function useSections(): { pinned: SidebarSection[]; hidden: SidebarSection[] } {
  const sectionOrder = useWorkbench((s) => s.sectionOrder)
  const pinnedSectionIds = useWorkbench((s) => s.pinnedSectionIds)

  return useMemo(() => {
    const sections = resolveSections(sectionOrder)
    return {
      pinned: sections.filter((section) => pinnedSectionIds.includes(section.id)),
      hidden: sections.filter((section) => !pinnedSectionIds.includes(section.id))
    }
  }, [sectionOrder, pinnedSectionIds])
}

/**
 * Activate a section. Every kind moves the main area (exploration 0388) — a
 * lens re-projects the tree *and* navigates to the lens's own destination,
 * because a row that only re-filters the sidebar reads as a broken click.
 */
export function useActivateSection(): (section: SidebarSection) => void {
  const navigate = useNavigate()
  const setActiveLens = useWorkbench((s) => s.setActiveLens)

  return useMemo(
    () => (section: SidebarSection) => {
      if (section.kind === 'lens') {
        setActiveLens(section.target)
        void navigate({ to: sidebarRegistry.getLens(section.target)?.route ?? '/' })
        return
      }
      if (section.kind === 'route') {
        void navigate({ to: section.target })
        return
      }
      void navigate({ to: '/doc/$docId', params: { docId: section.target } })
    },
    [navigate, setActiveLens]
  )
}

/** Is this section the one currently open? Route-derived, so exactly one is. */
export function useSectionActive(): (section: SidebarSection) => boolean {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const activeLensId = useWorkbench((s) => s.activeLensId)

  return useMemo(
    () => (section: SidebarSection) =>
      isSectionActive({
        section,
        pathname,
        activeLensId,
        lensRoute: (lensId) => sidebarRegistry.getLens(lensId)?.route
      }),
    [pathname, activeLensId]
  )
}

export function SectionRow({ section }: { section: SidebarSection }): React.JSX.Element {
  const activate = useActivateSection()
  // Active state is derived here from the route rather than passed in, so
  // there is exactly one answer to "where am I" (0388).
  const active = useSectionActive()(section)
  const requestCount = useRequestCount()
  const Icon = sectionIcon(section)
  const count = section.badge === 'requests' ? requestCount : undefined

  return (
    <NavRow
      icon={Icon}
      label={section.label}
      active={active}
      testId={`section-${section.id}`}
      onClick={() => activate(section)}
      trailing={
        count !== undefined && count > 0 ? (
          section.emphasis ? (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink-1 px-1.5 text-[11px] font-semibold text-island-b">
              {count}
            </span>
          ) : (
            <span className="font-mono text-[11px] text-ink-3">{count}</span>
          )
        ) : undefined
      }
    />
  )
}
