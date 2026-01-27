/**
 * NodeStore middleware chain for pre/post change hooks
 */

import type { Disposable } from './types'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PendingChange {
  type: 'create' | 'update' | 'delete' | 'restore'
  nodeId: string
  schemaIRI?: string
  payload?: Record<string, unknown>
  meta?: Record<string, unknown>
}

export interface NodeChangeEvent {
  change: PendingChange
  node: unknown
  isRemote: boolean
}

export interface NodeStoreMiddleware {
  /** Unique middleware ID */
  id: string
  /** Priority (lower = runs first, default 100) */
  priority?: number

  /**
   * Called before a change is applied.
   * Can modify the change, reject by throwing, or pass through.
   */
  beforeChange?(change: PendingChange, next: () => Promise<unknown>): Promise<unknown>

  /**
   * Called after a change is applied (observe only, cannot modify).
   */
  afterChange?(event: NodeChangeEvent): void
}

// ─── Middleware Chain ──────────────────────────────────────────────────────

/**
 * Manages a chain of middleware for NodeStore operations
 */
export class MiddlewareChain {
  private middlewares: NodeStoreMiddleware[] = []

  /**
   * Add a middleware to the chain
   */
  add(middleware: NodeStoreMiddleware): Disposable {
    this.middlewares.push(middleware)
    this.middlewares.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
    return {
      dispose: () => {
        this.middlewares = this.middlewares.filter((m) => m.id !== middleware.id)
      }
    }
  }

  /**
   * Remove a middleware by ID
   */
  remove(id: string): boolean {
    const before = this.middlewares.length
    this.middlewares = this.middlewares.filter((m) => m.id !== id)
    return this.middlewares.length < before
  }

  /**
   * Get all registered middlewares
   */
  getAll(): NodeStoreMiddleware[] {
    return [...this.middlewares]
  }

  /**
   * Execute beforeChange hooks in priority order
   */
  async executeBefore(change: PendingChange, apply: () => Promise<unknown>): Promise<unknown> {
    const chain = this.middlewares.filter((m) => m.beforeChange)

    const execute = async (index: number): Promise<unknown> => {
      if (index >= chain.length) {
        return apply()
      }
      return chain[index].beforeChange!(change, () => execute(index + 1))
    }

    return execute(0)
  }

  /**
   * Execute afterChange hooks (errors are caught and logged)
   */
  executeAfter(event: NodeChangeEvent): void {
    for (const middleware of this.middlewares) {
      if (middleware.afterChange) {
        try {
          middleware.afterChange(event)
        } catch (err) {
          console.error(`[Middleware ${middleware.id}] afterChange error:`, err)
        }
      }
    }
  }

  /**
   * Clear all middlewares
   */
  clear(): void {
    this.middlewares = []
  }

  /**
   * Get the number of registered middlewares
   */
  get size(): number {
    return this.middlewares.length
  }
}
