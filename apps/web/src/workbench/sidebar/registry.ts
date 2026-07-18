/**
 * Sidebar row-source + lens registry (exploration 0353).
 *
 * The one tree is assembled from registered sources rather than
 * hardcoded panels, so adding a content type to the sidebar is a
 * registration — not a tenth bespoke nav. Mirrors the slot/view
 * registry idiom: register returns a Disposable, `onChange` lets the
 * tree re-enumerate.
 */
import type { SidebarLens, SidebarRowSource } from './contracts'

export interface Disposable {
  dispose(): void
}

class SidebarRegistry {
  private sources = new Map<string, SidebarRowSource>()
  private lenses = new Map<string, SidebarLens>()
  private listeners = new Set<() => void>()
  /**
   * Cached array snapshots. `useSyncExternalStore` compares snapshots by
   * identity — returning a fresh array per call is an infinite render
   * loop, so the arrays are rebuilt only when the registry changes.
   */
  private sourcesSnapshot: SidebarRowSource[] = []
  private lensesSnapshot: SidebarLens[] = []

  registerSource(source: SidebarRowSource): Disposable {
    this.sources.set(source.id, source)
    this.notify()
    return {
      dispose: () => {
        if (this.sources.get(source.id) === source) {
          this.sources.delete(source.id)
          this.notify()
        }
      }
    }
  }

  registerLens(lens: SidebarLens): Disposable {
    this.lenses.set(lens.id, lens)
    this.notify()
    return {
      dispose: () => {
        if (this.lenses.get(lens.id) === lens) {
          this.lenses.delete(lens.id)
          this.notify()
        }
      }
    }
  }

  hasSource(id: string): boolean {
    return this.sources.has(id)
  }

  hasLens(id: string): boolean {
    return this.lenses.has(id)
  }

  getSource(id: string): SidebarRowSource | undefined {
    return this.sources.get(id)
  }

  /** Stable snapshot — safe as a `useSyncExternalStore` getSnapshot. */
  getSources(): SidebarRowSource[] {
    return this.sourcesSnapshot
  }

  /** Stable snapshot — safe as a `useSyncExternalStore` getSnapshot. */
  getLenses(): SidebarLens[] {
    return this.lensesSnapshot
  }

  getLens(id: string): SidebarLens | undefined {
    return this.lenses.get(id)
  }

  /**
   * The sources a lens draws from — the ONLY sources that should be
   * mounted, so an inactive lens costs no queries.
   */
  sourcesForLens(lensId: string): SidebarRowSource[] {
    const lens = this.lenses.get(lensId)
    if (!lens) return []
    if (lens.sources.length === 0) return this.getSources()
    return lens.sources
      .map((id) => this.sources.get(id))
      .filter((source): source is SidebarRowSource => Boolean(source))
  }

  onChange(listener: () => void): Disposable {
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }

  private notify(): void {
    // Rebuild snapshots exactly once per change, then fan out.
    this.sourcesSnapshot = [...this.sources.values()]
    this.lensesSnapshot = [...this.lenses.values()]
    for (const listener of this.listeners) listener()
  }
}

/** Module-global registry (one per runtime, like the slot registry). */
export const sidebarRegistry = new SidebarRegistry()
