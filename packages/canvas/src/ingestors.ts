/**
 * First-class canvas ingestion extension contracts.
 */

import type { CanvasIngressPayload } from './ingestion'
import type { Point } from './types'

export type CanvasIngestOptions = {
  canvasPoint?: Point | null
  spreadIndex?: number
}

export type CanvasResolvedIngestOptions = {
  canvasPoint?: Point | null
  spreadIndex: number
}

export type CanvasIngestResult = {
  canvasNodeId: string
  sourceNodeId?: string
}

export type CanvasIngestor = {
  id: string
  priority: number
  matches: (payload: CanvasIngressPayload) => boolean
  ingest: (
    payload: CanvasIngressPayload,
    options: CanvasResolvedIngestOptions
  ) => Promise<CanvasIngestResult | null>
}

export function resolveCanvasIngestOptions(
  options: CanvasIngestOptions = {}
): CanvasResolvedIngestOptions {
  return {
    canvasPoint: options.canvasPoint,
    spreadIndex: options.spreadIndex ?? 0
  }
}

export function selectCanvasIngestor(
  payload: CanvasIngressPayload,
  ingestors: readonly CanvasIngestor[]
): CanvasIngestor | null {
  const matches = ingestors.filter((ingestor) => ingestor.matches(payload))
  if (matches.length === 0) {
    return null
  }

  return [...matches].sort((a, b) => {
    const priorityDelta = b.priority - a.priority
    if (priorityDelta !== 0) {
      return priorityDelta
    }

    return a.id.localeCompare(b.id)
  })[0]
}
