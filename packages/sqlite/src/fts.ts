/**
 * @xnetjs/sqlite - Full-Text Search (FTS5) helpers
 *
 * These functions manage the FTS5 index for searchable node content.
 * FTS5 is not supported by sql.js, so these functions are no-ops
 * when using MemorySQLiteAdapter.
 */

import type { SQLiteAdapter } from './adapter'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FTSSearchResult {
  nodeId: string
  rank: number
  snippet?: string
}

export interface FTSSearchOptions {
  /** Maximum number of results */
  limit?: number
  /** Offset for pagination */
  offset?: number
  /** Include snippets in results */
  includeSnippets?: boolean
  /** Highlight markers for snippets */
  highlightMarkers?: { start: string; end: string }
}

// ─── FTS Index Management ────────────────────────────────────────────────────

/**
 * Update the FTS index for a node.
 * Call this when a node's title or content changes.
 *
 * @param db - SQLite adapter
 * @param nodeId - ID of the node
 * @param title - Node title (can be null)
 * @param content - Searchable content (can be null)
 */
export async function updateNodeFTS(
  db: SQLiteAdapter,
  nodeId: string,
  title: string | null,
  content: string | null
): Promise<void> {
  // Check if FTS table exists (sql.js doesn't support FTS5)
  const hasFTS = await checkFTSSupport(db)
  if (!hasFTS) return

  // Delete existing entry
  await db.run('DELETE FROM nodes_fts WHERE node_id = ?', [nodeId])

  // Insert new entry if there's content to index
  if (title || content) {
    await db.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
      nodeId,
      title ?? '',
      content ?? ''
    ])
  }
}

/**
 * Delete a node from the FTS index.
 *
 * @param db - SQLite adapter
 * @param nodeId - ID of the node to remove
 */
export async function deleteNodeFTS(db: SQLiteAdapter, nodeId: string): Promise<void> {
  const hasFTS = await checkFTSSupport(db)
  if (!hasFTS) return

  await db.run('DELETE FROM nodes_fts WHERE node_id = ?', [nodeId])
}

/**
 * Search nodes using FTS5.
 *
 * @param db - SQLite adapter
 * @param query - FTS5 match query (e.g., "hello world", "title:project")
 * @param options - Search options
 * @returns Array of matching node IDs with rank
 */
export async function searchNodes(
  db: SQLiteAdapter,
  query: string,
  options: FTSSearchOptions = {}
): Promise<FTSSearchResult[]> {
  const hasFTS = await checkFTSSupport(db)
  if (!hasFTS) return []

  const { limit = 50, offset = 0, includeSnippets = false, highlightMarkers } = options

  // Escape and prepare query
  const escapedQuery = escapeFTSQuery(query)
  if (!escapedQuery) return []

  let sql: string
  if (includeSnippets) {
    const startMark = highlightMarkers?.start ?? '<mark>'
    const endMark = highlightMarkers?.end ?? '</mark>'
    sql = `
      SELECT 
        node_id,
        rank,
        snippet(nodes_fts, 2, '${startMark}', '${endMark}', '...', 32) as snippet
      FROM nodes_fts
      WHERE nodes_fts MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `
  } else {
    sql = `
      SELECT node_id, rank
      FROM nodes_fts
      WHERE nodes_fts MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `
  }

  interface FTSRow {
    node_id: string
    rank: number
    snippet: string | null
    [key: string]: string | number | bigint | Uint8Array | null
  }

  const rows = await db.query<FTSRow>(sql, [escapedQuery, limit, offset])

  return rows.map((row) => ({
    nodeId: row.node_id,
    rank: row.rank,
    snippet: row.snippet ?? undefined
  }))
}

/**
 * Rebuild the entire FTS index from node data.
 * Use this after data imports or to fix index corruption.
 *
 * @param db - SQLite adapter
 * @param getNodeContent - Function to get title and content for a node
 */
export async function rebuildFTS(
  db: SQLiteAdapter,
  getNodeContent: (nodeId: string) => Promise<{ title: string | null; content: string | null }>
): Promise<number> {
  const hasFTS = await checkFTSSupport(db)
  if (!hasFTS) return 0

  // Get all node IDs
  const nodes = await db.query<{ id: string }>('SELECT id FROM nodes WHERE deleted_at IS NULL')

  // Clear existing FTS index
  await db.run('DELETE FROM nodes_fts')

  // Rebuild in batches
  let indexed = 0
  const batchSize = 100

  for (let i = 0; i < nodes.length; i += batchSize) {
    const batch = nodes.slice(i, i + batchSize)

    await db.transaction(async () => {
      for (const node of batch) {
        const { title, content } = await getNodeContent(node.id)
        if (title || content) {
          await db.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
            node.id,
            title ?? '',
            content ?? ''
          ])
          indexed++
        }
      }
    })
  }

  return indexed
}

/**
 * Optimize the FTS index.
 * Call this periodically or after large batch operations.
 */
export async function optimizeFTS(db: SQLiteAdapter): Promise<void> {
  const hasFTS = await checkFTSSupport(db)
  if (!hasFTS) return

  await db.run("INSERT INTO nodes_fts(nodes_fts) VALUES('optimize')")
}

// ─── Content Extraction ──────────────────────────────────────────────────────

/**
 * Extract searchable text from TipTap JSON content.
 */
export function extractTextFromTipTap(node: TipTapNode): string {
  const parts: string[] = []

  if (node.text) {
    parts.push(node.text)
  }

  if (node.content) {
    for (const child of node.content) {
      parts.push(extractTextFromTipTap(child))
    }
  }

  return parts.join(' ').trim()
}

/**
 * Extract searchable text from node properties.
 * Handles common property types (string, TipTap JSON).
 */
export function extractSearchableContent(properties: Record<string, unknown>): string | null {
  const parts: string[] = []

  // Check for content property (TipTap JSON or string)
  const content = properties.content
  if (content) {
    if (typeof content === 'string') {
      parts.push(content)
    } else if (typeof content === 'object' && 'type' in (content as object)) {
      parts.push(extractTextFromTipTap(content as TipTapNode))
    }
  }

  // Check for description property
  const description = properties.description
  if (typeof description === 'string') {
    parts.push(description)
  }

  // Check for body property
  const body = properties.body
  if (typeof body === 'string') {
    parts.push(body)
  }

  return parts.length > 0 ? parts.join(' ') : null
}

// ─── Private Helpers ─────────────────────────────────────────────────────────

/** Cache for FTS support check */
const ftsSupport = new WeakMap<SQLiteAdapter, boolean>()

/**
 * Check if the database supports FTS5.
 * Result is cached per adapter instance.
 */
async function checkFTSSupport(db: SQLiteAdapter): Promise<boolean> {
  if (ftsSupport.has(db)) {
    return ftsSupport.get(db)!
  }

  try {
    // Check if nodes_fts table exists
    const result = await db.queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='nodes_fts'"
    )
    const supported = result !== null
    ftsSupport.set(db, supported)
    return supported
  } catch {
    ftsSupport.set(db, false)
    return false
  }
}

/**
 * Escape special FTS5 characters in query.
 */
function escapeFTSQuery(query: string): string {
  // Remove leading/trailing whitespace
  query = query.trim()
  if (!query) return ''

  // Escape double quotes
  query = query.replace(/"/g, '""')

  // If query contains special chars, wrap in quotes
  if (/[*():^~-]/.test(query)) {
    return `"${query}"`
  }

  return query
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface TipTapNode {
  type: string
  content?: TipTapNode[]
  text?: string
}
