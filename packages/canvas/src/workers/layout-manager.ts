/**
 * Layout Manager
 *
 * Manages layout computation using a Web Worker for non-blocking execution.
 * Falls back to synchronous execution when Workers are not available.
 */

import type { Point } from '../types'
import type { LayoutWorkerRequest, LayoutWorkerResponse } from './layout-worker'

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Available layout algorithms
 */
export type LayoutAlgorithm = 'layered' | 'force' | 'radial' | 'tree' | 'stress'

/**
 * Node input for layout
 */
export interface LayoutNode {
  id: string
  position: {
    x: number
    y: number
    width: number
    height: number
  }
}

/**
 * Edge input for layout
 */
export interface LayoutEdge {
  id: string
  sourceId: string
  targetId: string
}

/**
 * Layout request
 */
export interface LayoutRequest {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  algorithm: LayoutAlgorithm
  options?: Record<string, string>
}

/**
 * Pending layout promise handlers
 */
interface PendingLayout {
  resolve: (positions: Map<string, Point>) => void
  reject: (error: Error) => void
}

/**
 * Layout manager configuration
 */
export interface LayoutManagerConfig {
  /** Whether to use Web Worker (defaults to true if available) */
  useWorker?: boolean
}

// ─── Algorithm Mapping ─────────────────────────────────────────────────────────

const ALGORITHM_NAMES: Record<LayoutAlgorithm, string> = {
  layered: 'org.eclipse.elk.layered',
  force: 'org.eclipse.elk.force',
  radial: 'org.eclipse.elk.radial',
  tree: 'org.eclipse.elk.mrtree',
  stress: 'org.eclipse.elk.stress'
}

// ─── Layout Manager ────────────────────────────────────────────────────────────

export class LayoutManager {
  private worker: Worker | null = null
  private pending = new Map<string, PendingLayout>()
  private currentRequestId: string | null = null
  private useWorker: boolean
  private idCounter = 0

  constructor(config: LayoutManagerConfig = {}) {
    this.useWorker = config.useWorker ?? true
    if (this.useWorker) {
      this.initWorker()
    }
  }

  /**
   * Check if worker is available.
   */
  hasWorker(): boolean {
    return this.worker !== null
  }

  /**
   * Initialize the Web Worker.
   */
  private initWorker(): void {
    // Check if Workers are available
    if (typeof Worker === 'undefined') {
      console.warn('Web Workers not supported, layout will run on main thread')
      return
    }

    try {
      // Create worker from the worker file
      this.worker = new Worker(new URL('./layout-worker.ts', import.meta.url), { type: 'module' })

      this.worker.onmessage = (e: MessageEvent<LayoutWorkerResponse>) => {
        const { id, success, positions, error } = e.data

        const pending = this.pending.get(id)
        if (!pending) return

        this.pending.delete(id)
        if (this.currentRequestId === id) {
          this.currentRequestId = null
        }

        if (success && positions) {
          const positionMap = new Map<string, Point>()
          for (const [nodeId, pos] of Object.entries(positions)) {
            positionMap.set(nodeId, pos)
          }
          pending.resolve(positionMap)
        } else {
          pending.reject(new Error(error ?? 'Layout failed'))
        }
      }

      this.worker.onerror = (error) => {
        console.error('Layout worker error:', error)
        // Reject all pending requests
        for (const pending of this.pending.values()) {
          pending.reject(new Error('Layout worker crashed'))
        }
        this.pending.clear()
        this.currentRequestId = null
      }
    } catch {
      console.warn('Failed to create layout worker, using sync fallback')
      this.worker = null
    }
  }

  /**
   * Generate a unique request ID.
   */
  private generateId(): string {
    return `layout-${++this.idCounter}`
  }

  /**
   * Compute layout asynchronously.
   */
  async layout(request: LayoutRequest): Promise<Map<string, Point>> {
    // Handle empty graph
    if (request.nodes.length === 0) {
      return new Map()
    }

    // Cancel any existing layout
    if (this.currentRequestId) {
      this.cancel()
    }

    // Use worker if available
    if (this.worker) {
      return this.layoutWithWorker(request)
    }

    // Fallback to sync
    return this.layoutSync(request)
  }

  /**
   * Compute layout using Web Worker.
   */
  private layoutWithWorker(request: LayoutRequest): Promise<Map<string, Point>> {
    const id = this.generateId()
    this.currentRequestId = id

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })

      const message: LayoutWorkerRequest = {
        id,
        nodes: request.nodes.map((n) => ({
          id: n.id,
          width: n.position.width,
          height: n.position.height
        })),
        edges: request.edges.map((e) => ({
          id: e.id,
          sourceId: e.sourceId,
          targetId: e.targetId
        })),
        algorithm: request.algorithm,
        options: request.options
      }

      this.worker!.postMessage(message)
    })
  }

  /**
   * Cancel the current layout operation.
   */
  cancel(): void {
    if (this.currentRequestId) {
      const pending = this.pending.get(this.currentRequestId)
      if (pending) {
        pending.reject(new Error('Layout cancelled'))
        this.pending.delete(this.currentRequestId)
      }
      this.currentRequestId = null
    }
  }

  /**
   * Terminate the worker and clean up.
   */
  terminate(): void {
    this.cancel()
    this.worker?.terminate()
    this.worker = null
  }

  /**
   * Synchronous fallback (blocks main thread, use only when Workers unavailable).
   */
  private async layoutSync(request: LayoutRequest): Promise<Map<string, Point>> {
    // Dynamic import ELK.js
    const ELK = await import('elkjs/lib/elk.bundled.js')
    const elk = new ELK.default()

    const graph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': ALGORITHM_NAMES[request.algorithm],
        'elk.spacing.nodeNode': '50',
        'elk.layered.spacing.nodeNodeBetweenLayers': '100',
        'elk.direction': 'RIGHT',
        ...request.options
      },
      children: request.nodes.map((n) => ({
        id: n.id,
        width: n.position.width,
        height: n.position.height
      })),
      edges: request.edges.map((e) => ({
        id: e.id,
        sources: [e.sourceId],
        targets: [e.targetId]
      }))
    }

    const result = await elk.layout(graph)

    const positions = new Map<string, Point>()
    for (const child of result.children ?? []) {
      positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
    }

    return positions
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a layout manager with optional config.
 */
export function createLayoutManager(config?: LayoutManagerConfig): LayoutManager {
  return new LayoutManager(config)
}
