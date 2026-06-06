/**
 * Deterministic identifiers for imported social records.
 */

import { createHash } from 'node:crypto'

export function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function normalizeHandle(value: string): string {
  return normalizeToken(value).replace(/^@+/, '')
}

export function normalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString()
  } catch {
    return value.trim()
  }
}

export function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(',')}}`
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export function createSocialNodeId(kind: string, parts: readonly unknown[]): string {
  const hash = sha256Hex(stableJsonStringify(parts)).slice(0, 32)
  return `social:${kind}:${hash}`
}

export function createSourceRecordHash(input: {
  platform: string
  sourcePath: string
  sourceRecordId: string
  payload: unknown
}): string {
  return sha256Hex(stableJsonStringify(input))
}

export function createSourceRecordId(input: {
  platform: string
  archiveId: string
  sourcePath: string
  sourceRecordId: string
}): string {
  return createSocialNodeId('source-record', [
    input.platform,
    input.archiveId,
    input.sourcePath,
    input.sourceRecordId
  ])
}
