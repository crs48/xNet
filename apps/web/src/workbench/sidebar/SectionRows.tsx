/**
 * Section rows (exploration 0353) — the top island's primary rows,
 * rendered from the user's sections instead of the twelve `SURFACES`.
 *
 * One grammar: a lens switches the tree below, a route navigates, a
 * pinned node opens. No panel/route fork, and no per-feature nav.
 */
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useRequestCount } from '../../hooks/useRequestCount'
import { useWorkbench } from '../state'
import { NavRow } from './NavRow'
import { resolveSections, sectionIcon, type SidebarSection } from './sections'

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

/** Activate a section: lens switches the tree, route navigates. */
export function useActivateSection(): (section: SidebarSection) => void {
  const navigate = useNavigate()
  const setActiveLens = useWorkbench((s) => s.setActiveLens)

  return useMemo(
    () => (section: SidebarSection) => {
      if (section.kind === 'lens') {
        setActiveLens(section.target)
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

export function SectionRow({
  section,
  active
}: {
  section: SidebarSection
  active: boolean
}): React.JSX.Element {
  const activate = useActivateSection()
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
