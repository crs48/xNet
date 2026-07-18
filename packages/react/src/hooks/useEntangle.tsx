/**
 * The entangle bus (exploration 0346, Phase 3) — page-scoped hover/select
 * co-presence between frames.
 *
 * Frames on one page share a bus: hovering a row in a database frame
 * lights the same node's pin in a map frame and its wikilink in the
 * prose (Embark's "Entangler"). Cheap by construction: per-node
 * subscriptions through useSyncExternalStore, so only the components
 * whose highlight state actually changes re-render.
 *
 * Absent a provider every hook degrades to a no-op, so views adopt the
 * bus unconditionally and stay correct on bus-less surfaces.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type JSX,
  type ReactNode
} from 'react'

export class EntangleBus {
  private hovered = new Set<string>()
  private selected = new Set<string>()
  private listeners = new Set<() => void>()

  setHovered(nodeId: string, on: boolean): void {
    if (on === this.hovered.has(nodeId)) return
    if (on) this.hovered.add(nodeId)
    else this.hovered.delete(nodeId)
    this.notify()
  }

  setSelected(nodeIds: readonly string[]): void {
    this.selected = new Set(nodeIds)
    this.notify()
  }

  isHovered(nodeId: string): boolean {
    return this.hovered.has(nodeId)
  }

  isSelected(nodeId: string): boolean {
    return this.selected.has(nodeId)
  }

  /** All currently highlighted ids (hovered ∪ selected) — for canvas
   * renderers (map layers) that filter rather than subscribe per id. */
  snapshotHighlighted(): string[] {
    return [...new Set([...this.hovered, ...this.selected])]
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

const EntangleContext = createContext<EntangleBus | null>(null)

/** One bus per page surface — mount around the page's frames. */
export function EntangleProvider({ children }: { children: ReactNode }): JSX.Element {
  const bus = useMemo(() => new EntangleBus(), [])
  return <EntangleContext.Provider value={bus}>{children}</EntangleContext.Provider>
}

/** The surrounding bus, or null on bus-less surfaces. */
export function useEntangleBus(): EntangleBus | null {
  return useContext(EntangleContext)
}

const noopSubscribe = () => () => {}

/**
 * Whether this node is entangle-highlighted (hovered or selected in a
 * sibling frame). Subscribes per node id — only affected rows/pins
 * re-render on hover changes.
 */
export function useEntangledHighlight(nodeId: string | null | undefined): boolean {
  const bus = useContext(EntangleContext)
  return useSyncExternalStore(bus ? bus.subscribe : noopSubscribe, () =>
    bus && nodeId ? bus.isHovered(nodeId) || bus.isSelected(nodeId) : false
  )
}

/** Publish hover on/off for a node id (no-op without a bus). */
export function usePublishEntangleHover(): (nodeId: string, on: boolean) => void {
  const bus = useContext(EntangleContext)
  return useCallback(
    (nodeId: string, on: boolean) => {
      bus?.setHovered(nodeId, on)
    },
    [bus]
  )
}

/**
 * Convenience bind: spread onto a row/card/chip element to publish its
 * node's hover state.
 */
export function useEntangleBind(nodeId: string | null | undefined): {
  onMouseEnter?: () => void
  onMouseLeave?: () => void
} {
  const bus = useContext(EntangleContext)
  return useMemo(() => {
    if (!bus || !nodeId) return {}
    return {
      onMouseEnter: () => bus.setHovered(nodeId, true),
      onMouseLeave: () => bus.setHovered(nodeId, false)
    }
  }, [bus, nodeId])
}
