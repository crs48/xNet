/**
 * Rich text cell support for database rows.
 *
 * Rich text cells use the row's Y.Doc for collaborative editing.
 * Each rich text column gets its own Y.XmlFragment in the doc,
 * which supports TipTap/ProseMirror content.
 *
 * Not every row needs a Y.Doc - only rows with rich text columns.
 * This is determined by the database's column definitions.
 */

import * as Y from 'yjs'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Column type identifier.
 */
export type ColumnType =
  | 'text'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'dateRange'
  | 'select'
  | 'multiSelect'
  | 'person'
  | 'relation'
  | 'url'
  | 'email'
  | 'phone'
  | 'file'
  | 'richText'
  | 'formula'
  | 'rollup'

/**
 * Column definition stored in the database's Y.Doc.
 */
export interface ColumnDefinition {
  /** Unique column identifier */
  id: string
  /** Column display name */
  name: string
  /** Column type */
  type: ColumnType
  /** Column width in pixels (for table view) */
  width?: number
  /** Type-specific configuration */
  config?: Record<string, unknown>
}

// ─── Rich Text Cell Functions ────────────────────────────────────────────────

/**
 * Prefix for rich text cell fragments in the Y.Doc.
 */
export const RICHTEXT_PREFIX = 'richtext_'

/**
 * Get or create a rich text cell in the row's Y.Doc.
 * The XML fragment supports TipTap/ProseMirror content.
 *
 * @example
 * ```typescript
 * const doc = await store.getOrCreateDoc(rowId)
 * const fragment = getRichTextCell(doc, 'notes')
 *
 * // Use with TipTap editor
 * const editor = new Editor({
 *   extensions: [Collaboration.configure({ fragment })]
 * })
 * ```
 */
export function getRichTextCell(doc: Y.Doc, columnId: string): Y.XmlFragment {
  return doc.getXmlFragment(`${RICHTEXT_PREFIX}${columnId}`)
}

/**
 * Check if a row has any rich text content for a specific column.
 */
export function hasRichTextContent(doc: Y.Doc, columnId: string): boolean {
  const fragment = doc.getXmlFragment(`${RICHTEXT_PREFIX}${columnId}`)
  return fragment.length > 0
}

/**
 * Check if any columns in the list are rich text columns.
 * Used to decide whether to create/sync a Y.Doc for a row.
 *
 * @example
 * ```typescript
 * const columns = await getColumns(databaseId)
 * if (hasRichTextColumns(columns)) {
 *   // Row needs a Y.Doc
 *   const doc = await store.getOrCreateDoc(rowId)
 * }
 * ```
 */
export function hasRichTextColumns(columns: ColumnDefinition[]): boolean {
  return columns.some((col) => col.type === 'richText')
}

/**
 * Get all rich text column IDs from a list of columns.
 */
export function getRichTextColumnIds(columns: ColumnDefinition[]): string[] {
  return columns.filter((col) => col.type === 'richText').map((col) => col.id)
}

/**
 * Delete a rich text cell from the row's Y.Doc.
 * Used when a rich text column is deleted.
 */
export function deleteRichTextCell(doc: Y.Doc, columnId: string): void {
  const fragment = doc.getXmlFragment(`${RICHTEXT_PREFIX}${columnId}`)
  // Clear all content from the fragment
  while (fragment.length > 0) {
    fragment.delete(0, 1)
  }
}

/**
 * Get plain text content from a rich text cell.
 * Useful for search indexing and previews.
 */
export function getRichTextPlainText(doc: Y.Doc, columnId: string): string {
  const fragment = doc.getXmlFragment(`${RICHTEXT_PREFIX}${columnId}`)
  return extractPlainText(fragment)
}

/**
 * Extract plain text from a Y.XmlFragment.
 */
function extractPlainText(fragment: Y.XmlFragment): string {
  const parts: string[] = []

  for (let i = 0; i < fragment.length; i++) {
    const item = fragment.get(i)
    if (item instanceof Y.XmlText) {
      parts.push(item.toString())
    } else if (item instanceof Y.XmlElement) {
      // Recursively extract text from child elements
      parts.push(extractPlainTextFromElement(item))
    }
  }

  return parts.join('')
}

/**
 * Extract plain text from a Y.XmlElement.
 */
function extractPlainTextFromElement(element: Y.XmlElement): string {
  const parts: string[] = []

  for (let i = 0; i < element.length; i++) {
    const item = element.get(i)
    if (item instanceof Y.XmlText) {
      parts.push(item.toString())
    } else if (item instanceof Y.XmlElement) {
      parts.push(extractPlainTextFromElement(item))
    }
  }

  // Add newlines for block elements
  const blockElements = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote']
  if (blockElements.includes(element.nodeName)) {
    parts.push('\n')
  }

  return parts.join('')
}
