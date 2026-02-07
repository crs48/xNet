/**
 * Layout Worker
 *
 * Web Worker for computing graph layouts using ELK.js.
 * Keeps the main thread responsive during layout computation.
 */

// NOTE: This file is designed to be loaded as a Web Worker.
// It cannot be tested directly in Node.js/Vitest environment.
// The LayoutManager provides a fallback for non-Worker environments.

import type { ElkNode, LayoutOptions } from 'elkjs'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LayoutWorkerRequest {
  id: string
  nodes: Array<{ id: string; width: number; height: number }>
  edges: Array<{ id: string; sourceId: string; targetId: string }>
  algorithm: 'layered' | 'force' | 'radial' | 'tree' | 'stress'
  options?: Record<string, string>
}

export interface LayoutWorkerResponse {
  id: string
  success: boolean
  positions?: Record<string, { x: number; y: number }>
  error?: string
}

// ─── Algorithm Mapping ─────────────────────────────────────────────────────────

const ALGORITHM_NAMES: Record<string, string> = {
  layered: 'org.eclipse.elk.layered',
  force: 'org.eclipse.elk.force',
  radial: 'org.eclipse.elk.radial',
  tree: 'org.eclipse.elk.mrtree',
  stress: 'org.eclipse.elk.stress'
}

function getAlgorithmName(algorithm: string): string {
  return ALGORITHM_NAMES[algorithm] ?? 'org.eclipse.elk.layered'
}

// ─── Worker Message Handler ────────────────────────────────────────────────────

// Only run worker code in actual Worker context
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  // Dynamic import ELK.js
  import('elkjs/lib/elk.bundled.js').then((ELK) => {
    const elk = new ELK.default()

    self.onmessage = async (e: MessageEvent<LayoutWorkerRequest>) => {
      const { id, nodes, edges, algorithm, options } = e.data

      try {
        const layoutOptions: LayoutOptions = {
          'elk.algorithm': getAlgorithmName(algorithm),
          'elk.spacing.nodeNode': '50',
          'elk.layered.spacing.nodeNodeBetweenLayers': '100',
          'elk.direction': 'RIGHT',
          ...options
        }

        const graph: ElkNode = {
          id: 'root',
          layoutOptions,
          children: nodes.map((n) => ({
            id: n.id,
            width: n.width,
            height: n.height
          })),
          edges: edges.map((e) => ({
            id: e.id,
            sources: [e.sourceId],
            targets: [e.targetId]
          }))
        }

        const result = await elk.layout(graph)

        const positions: Record<string, { x: number; y: number }> = {}
        for (const child of result.children ?? []) {
          positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 }
        }

        self.postMessage({
          id,
          success: true,
          positions
        } as LayoutWorkerResponse)
      } catch (err) {
        self.postMessage({
          id,
          success: false,
          error: err instanceof Error ? err.message : 'Layout failed'
        } as LayoutWorkerResponse)
      }
    }
  })
}
