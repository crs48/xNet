/**
 * Page Markdown validation for AI-edited xNet page projections.
 */

import type { AiValidationResult } from './types'

// ─── Types ─────────────────────────────────────────────────────────────────

export type XNetPageMarkdownFrontmatter = {
  id?: string
  schemaId?: string
  revision?: string
  exportedAt?: string
}

export type XNetMarkdownDirective = {
  kind: 'block' | 'inline' | 'wikilink'
  name: string
  index: number
  payload?: Record<string, unknown>
  target?: string
}

export type XNetPageMarkdownValidationOptions = {
  pageId?: string
  schemaId?: string
  baseRevision?: string
}

export type XNetPageMarkdownValidation = {
  frontmatter: XNetPageMarkdownFrontmatter | null
  directives: XNetMarkdownDirective[]
  validation: AiValidationResult
}

const SUPPORTED_BLOCK_DIRECTIVES = new Set(['xnet-database', 'xnet-page', 'xnet-embed'])
const SUPPORTED_INLINE_DIRECTIVES = new Set(['xnet-ref', 'xnet-db-ref'])

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateXNetPageMarkdown(
  markdown: string,
  options: XNetPageMarkdownValidationOptions = {}
): XNetPageMarkdownValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const frontmatter = parseXNetPageFrontmatter(markdown)
  const body = stripXNetPageFrontmatter(markdown)
  const directives = [
    ...validateBlockDirectives(body, errors, warnings),
    ...validateInlineDirectives(body, errors, warnings),
    ...readWikilinks(body)
  ].sort((left, right) => left.index - right.index)

  if (frontmatter) {
    validateFrontmatter(frontmatter, options, errors, warnings)
  } else {
    warnings.push('Markdown is missing xNet frontmatter identity')
  }

  if (/<!--[\s\S]*?-->/.test(body)) {
    warnings.push('HTML comments may not round-trip through the page editor')
  }

  return {
    frontmatter,
    directives,
    validation: {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }
}

export function parseXNetPageFrontmatter(markdown: string): XNetPageMarkdownFrontmatter | null {
  if (!markdown.startsWith('---\n')) return null
  const endIndex = markdown.indexOf('\n---', 4)
  if (endIndex === -1) return null

  const raw = markdown.slice(4, endIndex)
  const xnetStart = raw.match(/^xnet:\s*$/m)
  if (!xnetStart || xnetStart.index === undefined) return null

  const values: XNetPageMarkdownFrontmatter = {}
  for (const line of raw.slice(xnetStart.index + xnetStart[0].length).split('\n')) {
    const match = /^\s{2}(id|schemaId|revision|exportedAt):\s*(.+?)\s*$/.exec(line)
    if (!match) continue
    values[match[1] as keyof XNetPageMarkdownFrontmatter] = unquoteYamlScalar(match[2])
  }

  return values
}

export function stripXNetPageFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---\n')) return markdown
  const endIndex = markdown.indexOf('\n---', 4)
  return endIndex === -1 ? markdown : markdown.slice(endIndex + '\n---'.length).replace(/^\n+/, '')
}

export function renderMarkdownLineDiff(before: string, after: string): string {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const maxLength = Math.max(beforeLines.length, afterLines.length)
  const diff: string[] = []

  for (let index = 0; index < maxLength; index++) {
    const left = beforeLines[index]
    const right = afterLines[index]
    if (left === right) {
      if (left !== undefined) diff.push(` ${left}`)
      continue
    }
    if (left !== undefined) diff.push(`-${left}`)
    if (right !== undefined) diff.push(`+${right}`)
  }

  return diff.join('\n')
}

// ─── Directive Parsing ─────────────────────────────────────────────────────

function validateBlockDirectives(
  markdown: string,
  errors: string[],
  warnings: string[]
): XNetMarkdownDirective[] {
  const directives: XNetMarkdownDirective[] = []
  const blockPattern = /(^|\n):::(xnet-[a-z0-9-]+)\s*\n([\s\S]*?)\n:::(?=\n|$)/g
  let match: RegExpExecArray | null

  while ((match = blockPattern.exec(markdown)) !== null) {
    const index = match.index + match[1].length
    const name = match[2]
    const rawPayload = match[3].trim()

    if (!SUPPORTED_BLOCK_DIRECTIVES.has(name)) {
      warnings.push(`Unsupported xNet block directive: ${name}`)
    }

    const payload = parseJsonObject(rawPayload, `${name} block directive`, errors)
    directives.push({ kind: 'block', name, index, ...(payload ? { payload } : {}) })
  }

  const openingCount = markdown.match(/(^|\n):::(xnet-[a-z0-9-]+)\s*\n/g)?.length ?? 0
  if (openingCount > directives.length) {
    errors.push('One or more xNet block directives are missing a closing ::: marker')
  }

  return directives
}

function validateInlineDirectives(
  markdown: string,
  errors: string[],
  warnings: string[]
): XNetMarkdownDirective[] {
  const directives: XNetMarkdownDirective[] = []
  let searchIndex = 0

  while (searchIndex < markdown.length) {
    const openingIndex = markdown.indexOf('{{xnet-', searchIndex)
    if (openingIndex === -1) break

    const nameEnd = markdown.indexOf(' ', openingIndex + '{{'.length)
    if (nameEnd === -1) {
      errors.push('xNet inline directive is missing a JSON payload')
      break
    }

    const name = markdown.slice(openingIndex + '{{'.length, nameEnd)
    const payloadEnd = findJsonPayloadEnd(markdown, nameEnd + 1)
    if (payloadEnd === null || markdown.slice(payloadEnd, payloadEnd + 2) !== '}}') {
      errors.push(`${name} inline directive has invalid JSON or is missing closing braces`)
      searchIndex = nameEnd + 1
      continue
    }

    if (!SUPPORTED_INLINE_DIRECTIVES.has(name)) {
      warnings.push(`Unsupported xNet inline directive: ${name}`)
    }

    const rawPayload = markdown.slice(nameEnd + 1, payloadEnd).trim()
    const payload = parseJsonObject(rawPayload, `${name} inline directive`, errors)
    directives.push({ kind: 'inline', name, index: openingIndex, ...(payload ? { payload } : {}) })
    searchIndex = payloadEnd + 2
  }

  return directives
}

function readWikilinks(markdown: string): XNetMarkdownDirective[] {
  const directives: XNetMarkdownDirective[] = []
  const pattern = /\[\[([^\]\n]+)\]\]/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(markdown)) !== null) {
    directives.push({
      kind: 'wikilink',
      name: 'wikilink',
      index: match.index,
      target: match[1].trim()
    })
  }

  return directives
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
      if (started && depth === 0) return index + 1
      if (depth < 0) return null
    }
  }

  return null
}

function parseJsonObject(
  rawPayload: string,
  label: string,
  errors: string[]
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawPayload) as unknown
    if (isRecord(parsed)) return parsed
    errors.push(`${label} payload must be a JSON object`)
    return null
  } catch {
    errors.push(`${label} payload must be valid JSON`)
    return null
  }
}

function validateFrontmatter(
  frontmatter: XNetPageMarkdownFrontmatter,
  options: XNetPageMarkdownValidationOptions,
  errors: string[],
  warnings: string[]
): void {
  if (options.pageId && frontmatter.id && frontmatter.id !== options.pageId) {
    errors.push(
      `Frontmatter page id ${frontmatter.id} does not match target page ${options.pageId}`
    )
  }

  if (options.schemaId && frontmatter.schemaId && frontmatter.schemaId !== options.schemaId) {
    errors.push(
      `Frontmatter schemaId ${frontmatter.schemaId} does not match target schema ${options.schemaId}`
    )
  }

  if (
    options.baseRevision &&
    frontmatter.revision &&
    frontmatter.revision !== options.baseRevision
  ) {
    warnings.push(
      `Frontmatter revision ${frontmatter.revision} does not match base revision ${options.baseRevision}`
    )
  }
}

function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim()
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return trimmed

  try {
    return JSON.parse(trimmed) as string
  } catch {
    return trimmed.slice(1, -1)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
