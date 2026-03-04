/**
 * @xnetjs/hub - Search indexer for generating searchable text from database rows.
 *
 * Extracts text from searchable column types and concatenates them
 * for FTS5 full-text search indexing.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ColumnType =
  | 'text'
  | 'richText'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'dateRange'
  | 'select'
  | 'multiSelect'
  | 'person'
  | 'url'
  | 'email'
  | 'phone'
  | 'file'
  | 'relation'
  | 'rollup'
  | 'formula'
  | 'created'
  | 'createdBy'
  | 'updated'
  | 'updatedBy'

export type SelectOption = {
  id: string
  name: string
  color?: string
}

export type SelectColumnConfig = {
  options: SelectOption[]
}

export type ColumnDefinition = {
  id: string
  name: string
  type: ColumnType
  config?: SelectColumnConfig | Record<string, unknown>
}

export type DatabaseRow = {
  id: string
  sortKey: string
  cells: Record<string, unknown>
  createdAt: number
  createdBy: string
}

// ─── Searchable Types ──────────────────────────────────────────────────────────

/**
 * Column types that should be included in full-text search.
 */
const SEARCHABLE_TYPES = new Set<ColumnType>([
  'text',
  'richText',
  'url',
  'email',
  'phone',
  'select',
  'multiSelect'
])

// ─── Main Function ─────────────────────────────────────────────────────────────

/**
 * Generate searchable text from a row's cell values.
 *
 * Only extracts text from column types that are meaningful for search:
 * - text, richText: direct text content
 * - url, email, phone: string values
 * - select, multiSelect: option names (not IDs)
 *
 * @param row - The database row
 * @param columns - Column definitions for the database
 * @returns Concatenated searchable text
 */
export function generateSearchableText(row: DatabaseRow, columns: ColumnDefinition[]): string {
  const parts: string[] = []

  for (const column of columns) {
    if (!SEARCHABLE_TYPES.has(column.type)) continue

    const value = row.cells[column.id]
    if (value === null || value === undefined) continue

    const text = extractText(value, column)
    if (text) {
      parts.push(text)
    }
  }

  return parts.join(' ')
}

/**
 * Generate searchable text from raw cell data (without column definitions).
 * Useful when column definitions are not available.
 *
 * @param cells - The cell values
 * @returns Concatenated searchable text
 */
export function generateSearchableTextFromCells(cells: Record<string, unknown>): string {
  const parts: string[] = []

  for (const value of Object.values(cells)) {
    if (value === null || value === undefined) continue

    if (typeof value === 'string') {
      parts.push(value)
    } else if (Array.isArray(value)) {
      // Multi-select or array of strings
      const strings = value.filter((v): v is string => typeof v === 'string')
      if (strings.length > 0) {
        parts.push(strings.join(' '))
      }
    }
  }

  return parts.join(' ')
}

// ─── Text Extraction ───────────────────────────────────────────────────────────

/**
 * Extract searchable text from a cell value based on column type.
 */
function extractText(value: unknown, column: ColumnDefinition): string {
  switch (column.type) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return String(value)

    case 'richText':
      return extractPlainTextFromRichText(value as string)

    case 'select': {
      const selectConfig = column.config as SelectColumnConfig | undefined
      if (!selectConfig?.options) return String(value)
      const option = selectConfig.options.find((o) => o.id === value)
      return option?.name ?? String(value)
    }

    case 'multiSelect': {
      const multiConfig = column.config as SelectColumnConfig | undefined
      const values = value as string[]
      if (!Array.isArray(values)) return ''
      if (!multiConfig?.options) return values.join(' ')
      return values
        .map((v) => {
          const option = multiConfig.options.find((o) => o.id === v)
          return option?.name ?? v
        })
        .filter(Boolean)
        .join(' ')
    }

    default:
      return ''
  }
}

/**
 * Extract plain text from rich text content.
 *
 * Rich text may be stored as:
 * - HTML string
 * - ProseMirror JSON
 * - Yjs XML fragment
 *
 * This function handles basic HTML/XML stripping.
 * For production, use proper parsing based on the actual format.
 */
function extractPlainTextFromRichText(content: string | object): string {
  if (typeof content === 'object') {
    // ProseMirror JSON format
    return extractTextFromProseMirrorJson(content)
  }

  // HTML/XML string - strip tags
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extract text from ProseMirror JSON document.
 */
function extractTextFromProseMirrorJson(doc: object): string {
  const parts: string[] = []

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return

    const n = node as { type?: string; text?: string; content?: unknown[] }

    if (n.text) {
      parts.push(n.text)
    }

    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        walk(child)
      }
    }
  }

  walk(doc)
  return parts.join(' ')
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Check if a column type is searchable.
 */
export function isSearchableColumn(type: ColumnType): boolean {
  return SEARCHABLE_TYPES.has(type)
}

/**
 * Get all searchable column types.
 */
export function getSearchableTypes(): ColumnType[] {
  return Array.from(SEARCHABLE_TYPES)
}
