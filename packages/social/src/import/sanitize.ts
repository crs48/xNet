/**
 * Sanitizers for turning private exports into structural test fixtures.
 */

import type { StagedSocialRecord } from './types'

export type SanitizedFixtureOptions = {
  textPlaceholder?: string
  urlPlaceholder?: string
}

export function sanitizeForFixture(value: unknown, options: SanitizedFixtureOptions = {}): unknown {
  const textPlaceholder = options.textPlaceholder ?? '<text>'
  const urlPlaceholder = options.urlPlaceholder ?? 'https://example.invalid/resource'

  if (Array.isArray(value)) return value.map((item) => sanitizeForFixture(item, options))
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') return value
    if (/^https?:\/\//i.test(value)) return urlPlaceholder
    if (value.includes('@')) return '<email-or-handle>'
    return textPlaceholder
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      sanitizeForFixture(child, options)
    ])
  )
}

export function sanitizeStagedRecordsForFixture(
  records: readonly StagedSocialRecord[],
  options: SanitizedFixtureOptions = {}
): StagedSocialRecord[] {
  return records.map((record) => ({
    ...record,
    source: {
      ...record.source,
      path: record.source.path.replace(/[^/]+(?=\/message_)/g, '<thread>')
    },
    properties: sanitizeForFixture(record.properties, options) as Record<string, unknown>
  }))
}
