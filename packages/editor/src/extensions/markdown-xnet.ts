import type { MarkdownToken, MarkdownTokenizer } from '@tiptap/core'

export type XNetJsonPayload = Record<string, unknown>
export type XNetAuthoredMarkdownAttrs = {
  sourceMarkdown?: unknown
  sourceCanonicalPayload?: unknown
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isRecord(value: unknown): value is XNetJsonPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue)
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, nestedValue]) => [key, normalizeJsonValue(nestedValue)])
    )
  }

  return value
}

function isEquivalentJsonPayload(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeJsonValue(left)) === JSON.stringify(normalizeJsonValue(right))
}

function findJsonPayloadEnd(src: string, startIndex: number): number | null {
  let depth = 0
  let inString = false
  let escaping = false
  let started = false

  for (let index = startIndex; index < src.length; index += 1) {
    const char = src[index]

    if (inString) {
      if (escaping) {
        escaping = false
      } else if (char === '\\') {
        escaping = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      depth += 1
      started = true
      continue
    }

    if (char === '}') {
      depth -= 1
      if (started && depth === 0) {
        return index + 1
      }
      if (depth < 0) return null
    }
  }

  return null
}

export function createXNetJsonBlockTokenizer(
  tokenName: string,
  directiveName: string
): MarkdownTokenizer {
  const escapedDirectiveName = escapeRegExp(directiveName)
  const openingPattern = new RegExp(`^:::${escapedDirectiveName}\\s*\\n`)
  const startPattern = new RegExp(`^:::${escapedDirectiveName}\\s*$`, 'm')
  const closingPattern = /\n:::\s*(?:\n|$)/

  return {
    name: tokenName,
    level: 'block',
    start: (src) => src.match(startPattern)?.index ?? -1,
    tokenize: (src) => {
      const openingMatch = src.match(openingPattern)
      if (!openingMatch) return undefined

      const contentStart = openingMatch[0].length
      const remaining = src.slice(contentStart)
      const closingMatch = remaining.match(closingPattern)
      if (!closingMatch || closingMatch.index === undefined) return undefined

      const content = remaining.slice(0, closingMatch.index).trim()
      const raw = src.slice(0, contentStart + closingMatch.index + closingMatch[0].length)

      return {
        type: tokenName,
        raw,
        text: content,
        content
      }
    }
  }
}

export function createXNetJsonInlineTokenizer(
  tokenName: string,
  directiveName: string
): MarkdownTokenizer {
  const opening = `{{${directiveName} `

  return {
    name: tokenName,
    level: 'inline',
    start: (src) => src.indexOf(opening),
    tokenize: (src) => {
      if (!src.startsWith(opening)) return undefined

      const payloadEnd = findJsonPayloadEnd(src, opening.length)
      if (payloadEnd === null) return undefined
      if (src.slice(payloadEnd, payloadEnd + 2) !== '}}') return undefined

      const raw = src.slice(0, payloadEnd + 2)
      const content = src.slice(opening.length, payloadEnd).trim()

      return {
        type: tokenName,
        raw,
        text: content,
        content
      }
    }
  }
}

export function parseXNetJsonPayload(token: MarkdownToken): XNetJsonPayload | null {
  const rawPayload = typeof token.content === 'string' ? token.content : token.text
  if (!rawPayload) return null

  try {
    const parsed = JSON.parse(rawPayload)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function renderXNetJsonBlock(directiveName: string, payload: XNetJsonPayload): string {
  return `:::${directiveName}\n${JSON.stringify(payload, null, 2)}\n:::`
}

export function renderXNetJsonInline(directiveName: string, payload: XNetJsonPayload): string {
  return `{{${directiveName} ${JSON.stringify(payload)}}}`
}

export function createXNetAuthoredMarkdownAttrs(
  token: MarkdownToken,
  canonicalPayload: XNetJsonPayload
): XNetAuthoredMarkdownAttrs {
  return typeof token.raw === 'string'
    ? {
        sourceMarkdown: token.raw.trimEnd(),
        sourceCanonicalPayload: canonicalPayload
      }
    : {}
}

export function renderXNetJsonBlockPreservingSource(
  directiveName: string,
  payload: XNetJsonPayload,
  attrs: XNetAuthoredMarkdownAttrs
): string {
  return typeof attrs.sourceMarkdown === 'string' &&
    isEquivalentJsonPayload(attrs.sourceCanonicalPayload, payload)
    ? attrs.sourceMarkdown.trimEnd()
    : renderXNetJsonBlock(directiveName, payload)
}

export function renderXNetJsonInlinePreservingSource(
  directiveName: string,
  payload: XNetJsonPayload,
  attrs: XNetAuthoredMarkdownAttrs
): string {
  return typeof attrs.sourceMarkdown === 'string' &&
    isEquivalentJsonPayload(attrs.sourceCanonicalPayload, payload)
    ? attrs.sourceMarkdown.trimEnd()
    : renderXNetJsonInline(directiveName, payload)
}

export function stringAttr(value: unknown, fallback: string | null = null): string | null {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

export function numberAttr(value: unknown, fallback: number): number {
  const numericValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

export function booleanAttr(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export function recordAttr(value: unknown): XNetJsonPayload {
  return isRecord(value) ? value : {}
}
