/**
 * Preview cache invalidation helpers.
 */

import type { CanvasPreviewSourceRef } from './model'

export type CanvasPreviewSourceFingerprintInput = {
  sourceRef?: CanvasPreviewSourceRef
  fields?: Record<string, unknown>
  blobHashes?: readonly string[]
}

const EMPTY_FINGERPRINT_VALUE = 'none'

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableValue(entry)])
    )
  }

  return value ?? null
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

export function createCanvasPreviewSourceFingerprint(
  input: CanvasPreviewSourceFingerprintInput
): string {
  const source = input.sourceRef
  const blobHashes = [...(input.blobHashes ?? [])].sort()

  return [
    source?.nodeId ?? EMPTY_FINGERPRINT_VALUE,
    source?.schemaId ?? EMPTY_FINGERPRINT_VALUE,
    source?.version ?? '0',
    source?.contentHash ?? EMPTY_FINGERPRINT_VALUE,
    stableJson(input.fields ?? {}),
    stableJson(blobHashes)
  ].join(':')
}

export function shouldInvalidateCanvasPreviewCache(
  previous: CanvasPreviewSourceFingerprintInput,
  next: CanvasPreviewSourceFingerprintInput
): boolean {
  return (
    createCanvasPreviewSourceFingerprint(previous) !== createCanvasPreviewSourceFingerprint(next)
  )
}
