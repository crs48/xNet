/**
 * First-class canvas ingestion extension contracts.
 */

import type { CanvasIngressPayload } from './ingestion'
import type { Point } from './types'
import { normalizeExternalReferenceUrl } from './ingestion'

export type CanvasIngestOptions = {
  canvasPoint?: Point | null
  spreadIndex?: number
  signal?: AbortSignal
}

export type CanvasResolvedIngestOptions = {
  canvasPoint?: Point | null
  spreadIndex: number
  signal?: AbortSignal
}

export type CanvasIngestResult = {
  canvasNodeId: string
  sourceNodeId?: string
}

export type CanvasIngestBatchSkippedReason = 'cancelled' | 'duplicate' | 'unsupported'

export type CanvasIngestBatchSkippedPayload = {
  index: number
  payload: CanvasIngressPayload
  reason: CanvasIngestBatchSkippedReason
  dedupeKey?: string
}

export type CanvasIngestBatchError = {
  index: number
  payload: CanvasIngressPayload
  ingestorId: string
  error: Error
}

export type CanvasIngestBatchResult = {
  results: CanvasIngestResult[]
  skipped: CanvasIngestBatchSkippedPayload[]
  errors: CanvasIngestBatchError[]
  cancelled: boolean
}

export type CanvasIngestBatchOptions = CanvasIngestOptions & {
  dedupe?: boolean
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
  const resolved: CanvasResolvedIngestOptions = {
    canvasPoint: options.canvasPoint,
    spreadIndex: options.spreadIndex ?? 0
  }

  if (options.signal) {
    resolved.signal = options.signal
  }

  return resolved
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

export function getCanvasIngressPayloadDedupeKey(payload: CanvasIngressPayload): string | null {
  if (payload.kind === 'internal-node') {
    return `internal-node:${payload.data.schemaId}:${payload.data.nodeId}`
  }

  if (payload.kind === 'file') {
    const type = payload.file.type || 'application/octet-stream'
    return `file:${payload.file.name}:${type}:${payload.file.size}:${payload.file.lastModified}`
  }

  if (payload.kind === 'url') {
    const normalizedUrl = normalizeExternalReferenceUrl(payload.url.trim())
    return `url:${normalizedUrl ?? payload.url.trim()}`
  }

  const trimmedText = payload.text.trim()
  if (trimmedText.length === 0) {
    return null
  }

  const normalizedUrl = normalizeExternalReferenceUrl(trimmedText)
  return normalizedUrl ? `url:${normalizedUrl}` : `text:${trimmedText}`
}

export function dedupeCanvasIngressPayloads(
  payloads: readonly CanvasIngressPayload[],
  getDedupeKey: (payload: CanvasIngressPayload) => string | null = getCanvasIngressPayloadDedupeKey
): CanvasIngressPayload[] {
  const seen = new Set<string>()

  return payloads.filter((payload) => {
    const dedupeKey = getDedupeKey(payload)
    if (!dedupeKey) {
      return true
    }

    if (seen.has(dedupeKey)) {
      return false
    }

    seen.add(dedupeKey)
    return true
  })
}

function normalizeIngestError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function isAbortError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError'
  }

  return error instanceof Error && error.name === 'AbortError'
}

function createBatchItems(
  payloads: readonly CanvasIngressPayload[],
  dedupe: boolean,
  skipped: CanvasIngestBatchSkippedPayload[]
): Array<{ index: number; payload: CanvasIngressPayload }> {
  if (!dedupe) {
    return payloads.map((payload, index) => ({ index, payload }))
  }

  const seen = new Set<string>()
  const items: Array<{ index: number; payload: CanvasIngressPayload }> = []

  payloads.forEach((payload, index) => {
    const dedupeKey = getCanvasIngressPayloadDedupeKey(payload)
    if (dedupeKey && seen.has(dedupeKey)) {
      skipped.push({
        index,
        payload,
        reason: 'duplicate',
        dedupeKey
      })
      return
    }

    if (dedupeKey) {
      seen.add(dedupeKey)
    }

    items.push({ index, payload })
  })

  return items
}

function appendCancelledItems(
  items: ReadonlyArray<{ index: number; payload: CanvasIngressPayload }>,
  startIndex: number,
  skipped: CanvasIngestBatchSkippedPayload[]
): void {
  for (const item of items.slice(startIndex)) {
    skipped.push({
      index: item.index,
      payload: item.payload,
      reason: 'cancelled'
    })
  }
}

export async function ingestCanvasPayloadBatch(
  payloads: readonly CanvasIngressPayload[],
  ingestors: readonly CanvasIngestor[],
  options: CanvasIngestBatchOptions = {}
): Promise<CanvasIngestBatchResult> {
  const results: CanvasIngestResult[] = []
  const skipped: CanvasIngestBatchSkippedPayload[] = []
  const errors: CanvasIngestBatchError[] = []
  const items = createBatchItems(payloads, options.dedupe ?? true, skipped)
  const baseSpreadIndex = options.spreadIndex ?? 0

  for (const [itemOffset, item] of items.entries()) {
    if (options.signal?.aborted) {
      appendCancelledItems(items, itemOffset, skipped)
      return {
        results,
        skipped,
        errors,
        cancelled: true
      }
    }

    const ingestor = selectCanvasIngestor(item.payload, ingestors)
    if (!ingestor) {
      skipped.push({
        index: item.index,
        payload: item.payload,
        reason: 'unsupported'
      })
      continue
    }

    try {
      const result = await ingestor.ingest(
        item.payload,
        resolveCanvasIngestOptions({
          canvasPoint: options.canvasPoint,
          spreadIndex: baseSpreadIndex + itemOffset,
          signal: options.signal
        })
      )

      if (options.signal?.aborted) {
        appendCancelledItems(items, itemOffset + 1, skipped)
        return {
          results,
          skipped,
          errors,
          cancelled: true
        }
      }

      if (result) {
        results.push(result)
      } else {
        skipped.push({
          index: item.index,
          payload: item.payload,
          reason: 'unsupported'
        })
      }
    } catch (error) {
      if (options.signal?.aborted || isAbortError(error)) {
        appendCancelledItems(items, itemOffset + 1, skipped)
        return {
          results,
          skipped,
          errors,
          cancelled: true
        }
      }

      errors.push({
        index: item.index,
        payload: item.payload,
        ingestorId: ingestor.id,
        error: normalizeIngestError(error)
      })
    }
  }

  return {
    results,
    skipped,
    errors,
    cancelled: false
  }
}
