/**
 * Grid clipboard — TSV interchange with Sheets/Excel plus per-field-type
 * value coercion for paste.
 *
 * Copy produces tab-separated values with newline row separators (the
 * format Sheets/Excel put on the clipboard). Cells containing tabs,
 * newlines, or quotes are quoted Excel-style.
 *
 * Paste parses TSV and coerces each string through the target field's
 * type. Select/multiSelect coercion resolves option *names* to IDs via a
 * lookup the caller provides (and can report unresolved names so the
 * caller may offer inline option creation).
 */

import type { CellValue, FieldType } from '@xnetjs/data'

// ─── Serialization (copy) ────────────────────────────────────────────────────

export interface CopyField {
  id: string
  type: FieldType
  /** Resolve option ID -> display name (select/multiSelect) */
  optionName?: (id: string) => string | undefined
}

/** Format a single cell value as clipboard text. */
export function formatCellText(value: CellValue | undefined, field: CopyField): string {
  if (value === null || value === undefined) return ''
  switch (field.type) {
    case 'checkbox':
      return value === true ? 'TRUE' : 'FALSE'
    case 'select': {
      const id = String(value)
      return field.optionName?.(id) ?? id
    }
    case 'multiSelect': {
      const ids = Array.isArray(value) ? value : [String(value)]
      return ids.map((id) => field.optionName?.(id) ?? id).join(', ')
    }
    case 'dateRange': {
      if (typeof value === 'object' && value !== null && 'start' in value && 'end' in value) {
        return `${value.start} → ${value.end}`
      }
      return String(value)
    }
    case 'geo': {
      if (typeof value === 'object' && value !== null && 'lat' in value && 'lng' in value) {
        return `${value.lat}, ${value.lng}`
      }
      return String(value)
    }
    case 'file': {
      if (typeof value === 'object' && value !== null && 'name' in value) {
        return String((value as { name: unknown }).name)
      }
      return String(value)
    }
    case 'relation':
    case 'person':
      return Array.isArray(value) ? value.join(', ') : String(value)
    default:
      return Array.isArray(value) ? value.join(', ') : String(value)
  }
}

/** Quote a cell for TSV when it contains separators or quotes. */
function escapeTsvCell(text: string): string {
  if (/[\t\n\r"]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/**
 * Serialize a rectangular block of values to TSV.
 * `block[r][c]` must align with `fields[c]`.
 */
export function serializeTsv(block: (CellValue | undefined)[][], fields: CopyField[]): string {
  return block
    .map((row) => row.map((value, c) => escapeTsvCell(formatCellText(value, fields[c]))).join('\t'))
    .join('\n')
}

// ─── Parsing (paste) ─────────────────────────────────────────────────────────

/**
 * Parse clipboard text into a 2D string matrix. Handles Excel-style
 * quoted cells (which may contain tabs/newlines) and both \n and \r\n.
 */
export function parseTsv(text: string): string[][] {
  // Trim a single trailing newline (Sheets adds one)
  const input = text.replace(/\r\n/g, '\n').replace(/\n$/, '')
  if (input === '') return [['']]

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0

  while (i < input.length) {
    const ch = input[i]
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"' && cell === '') {
      inQuotes = true
      i++
      continue
    }
    if (ch === '\t') {
      row.push(cell)
      cell = ''
      i++
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i++
      continue
    }
    cell += ch
    i++
  }
  row.push(cell)
  rows.push(row)
  return rows
}

// ─── Coercion (paste into typed cells) ───────────────────────────────────────

export interface PasteField {
  id: string
  type: FieldType
  /** Resolve option display name -> option ID (select/multiSelect) */
  optionIdByName?: (name: string) => string | undefined
}

export interface CoerceResult {
  /** The coerced value (null clears the cell) */
  value: CellValue
  /** Option names that didn't resolve (candidates for inline creation) */
  unresolvedOptions?: string[]
  /** True when the text couldn't be represented in this field type */
  lossy?: boolean
}

const TRUTHY = new Set(['true', 'yes', 'y', '1', 'checked', 'x'])
const FALSY = new Set(['false', 'no', 'n', '0', 'unchecked', ''])

/**
 * Coerce a pasted string into a CellValue for the target field type.
 */
export function coerceCellText(text: string, field: PasteField): CoerceResult {
  const trimmed = text.trim()

  switch (field.type) {
    case 'number': {
      if (trimmed === '') return { value: null }
      // Strip currency symbols, percent signs, thousands separators
      const cleaned = trimmed.replace(/[$€£¥,%\s]/g, '')
      const num = Number(cleaned)
      if (Number.isFinite(num)) {
        return { value: trimmed.endsWith('%') ? num / 100 : num }
      }
      return { value: null, lossy: true }
    }

    case 'checkbox': {
      const lower = trimmed.toLowerCase()
      if (TRUTHY.has(lower)) return { value: true }
      if (FALSY.has(lower)) return { value: false }
      return { value: null, lossy: true }
    }

    case 'date': {
      if (trimmed === '') return { value: null }
      const parsed = new Date(trimmed)
      if (!Number.isNaN(parsed.getTime())) {
        return { value: parsed.toISOString() }
      }
      return { value: null, lossy: true }
    }

    case 'dateRange': {
      if (trimmed === '') return { value: null }
      const parts = trimmed.split(/\s*(?:→|->|–|to)\s*/i)
      if (parts.length === 2) {
        const start = new Date(parts[0])
        const end = new Date(parts[1])
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
          return { value: { start: start.toISOString(), end: end.toISOString() } }
        }
      }
      return { value: null, lossy: true }
    }

    case 'geo': {
      if (trimmed === '') return { value: null }
      const parts = trimmed.split(',').map((s) => Number(s.trim()))
      if (parts.length === 2) {
        const [lat, lng] = parts
        if (
          Number.isFinite(lat) &&
          Math.abs(lat) <= 90 &&
          Number.isFinite(lng) &&
          Math.abs(lng) <= 180
        ) {
          return { value: { lat, lng } }
        }
      }
      return { value: null, lossy: true }
    }

    case 'select': {
      if (trimmed === '') return { value: null }
      const id = field.optionIdByName?.(trimmed)
      if (id) return { value: id }
      return { value: null, unresolvedOptions: [trimmed] }
    }

    case 'multiSelect': {
      if (trimmed === '') return { value: null }
      const names = trimmed
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
      const ids: string[] = []
      const unresolved: string[] = []
      for (const name of names) {
        const id = field.optionIdByName?.(name)
        if (id) {
          ids.push(id)
        } else {
          unresolved.push(name)
        }
      }
      return {
        value: ids.length > 0 ? ids : null,
        ...(unresolved.length > 0 ? { unresolvedOptions: unresolved } : {})
      }
    }

    case 'url':
    case 'email':
    case 'phone':
    case 'text':
      return { value: trimmed === '' ? null : text }

    case 'person':
    case 'relation':
      // IDs/DIDs can't be resolved from plain text reliably — mark lossy
      return trimmed === '' ? { value: null } : { value: null, lossy: true }

    case 'file':
    case 'richText':
    case 'rollup':
    case 'formula':
    case 'created':
    case 'createdBy':
    case 'updated':
    case 'updatedBy':
      // Read-only or non-pastable targets
      return { value: null, lossy: trimmed !== '' }

    default:
      return { value: trimmed === '' ? null : text }
  }
}
