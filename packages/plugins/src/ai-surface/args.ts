/**
 * Shared argument and record readers for the AI surface.
 *
 * Used by the service, the built-in tool registry (`tools/`), and the
 * resource URI routes (`resources/`) so every entry point coerces untrusted
 * agent-supplied arguments the same way — including the exact error messages.
 */

import type { AiContextSeed, AiTargetKind } from './types'

// ─── Required Readers ───────────────────────────────────────────────────────

export function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`)
  }
  return value
}

export function readRequiredRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const value = record[key]
  if (!isRecord(value)) {
    throw new Error(`${key} must be an object`)
  }
  return value
}

export function readRequiredStringArray(value: unknown, key: string): string[] {
  const result = readStringArray(value)
  if (result.length === 0) {
    throw new Error(`${key} must contain at least one string`)
  }
  return result
}

// ─── Optional Readers ───────────────────────────────────────────────────────

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
}

export function readCsvStringArray(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function readOptionalString(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function readOptionalRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  return readRecord(record, key)
}

export function readOptionalNumber(
  record: Record<string, unknown>,
  key: string
): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readOptionalBoolean(
  record: Record<string, unknown>,
  key: string
): boolean | undefined {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

export function readUrlNumber(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key)
  if (value === null) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

// ─── Record Readers ─────────────────────────────────────────────────────────

export function readRecordString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function readRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = record[key]
  return isRecord(value) ? value : undefined
}

export function readRecordNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readRecordBoolean(
  record: Record<string, unknown>,
  key: string
): boolean | undefined {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ─── Domain Readers ─────────────────────────────────────────────────────────

export function readContextSeeds(value: unknown): AiContextSeed[] {
  if (!Array.isArray(value)) return []
  return value
    .map((seed) => {
      if (!isRecord(seed)) return null
      const kind = typeof seed.kind === 'string' ? (seed.kind as AiTargetKind) : null
      const id = typeof seed.id === 'string' ? seed.id : null
      return kind && id ? { kind, id } : null
    })
    .filter((seed): seed is AiContextSeed => seed !== null)
}
