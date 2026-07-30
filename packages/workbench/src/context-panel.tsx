/**
 * useContextPanel — the Right Panel contribution API (exploration 0166).
 *
 * The active tab's view publishes sections (properties, comments,
 * backlinks, selection details…); the ContextPanel renders them as
 * panel-local tabs (max ~4 visible, contributed not hardcoded). When
 * the publishing view unmounts, its sections vanish.
 */
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { create } from 'zustand'
import { useWorkbench } from './state'

export interface ContextPanelSection {
  id: string
  title: string
  /** Small count badge next to the title (e.g. unresolved comments) */
  badge?: number
  content: ReactNode
}

interface ContextPanelStore {
  /** Sections keyed by owner (one owner = the currently routed view) */
  owners: Record<string, ContextPanelSection[]>
  activeSectionId: string | null
  publish: (ownerId: string, sections: ContextPanelSection[]) => void
  clear: (ownerId: string) => void
  setActiveSection: (id: string) => void
}

export const useContextPanelStore = create<ContextPanelStore>()((set) => ({
  owners: {},
  activeSectionId: null,
  publish: (ownerId, sections) =>
    set((state) => ({ owners: { ...state.owners, [ownerId]: sections } })),
  clear: (ownerId) =>
    set((state) => {
      const owners = { ...state.owners }
      delete owners[ownerId]
      return { owners }
    }),
  setActiveSection: (id) => set({ activeSectionId: id })
}))

/**
 * Publish context sections for the lifetime of the calling view.
 * Pass a stable `ownerId` (e.g. `page:<docId>`); memoize `sections`.
 */
export function useContextPanel(ownerId: string, sections: ContextPanelSection[]): void {
  const publish = useContextPanelStore((state) => state.publish)
  const clear = useContextPanelStore((state) => state.clear)

  useEffect(() => {
    publish(ownerId, sections)
    return () => clear(ownerId)
  }, [ownerId, sections, publish, clear])
}

/** Open the right panel and focus a specific section. */
export function revealContextSection(sectionId: string): void {
  useContextPanelStore.getState().setActiveSection(sectionId)
  useWorkbench.getState().setPanelOpen('right', true)
}
