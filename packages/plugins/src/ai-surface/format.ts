/**
 * Token-efficient output formats for agent-facing surfaces.
 *
 * TSV is ~2x cheaper than JSON for tabular reads; these helpers are shared by
 * the workspace exporter (.tsv sidecars), the xnet CLI, and MCP responses.
 */

/** Render rows as TSV for cheap agent reads. Tabs/newlines collapse to spaces. */
export function toTsv(nodeRows: Record<string, unknown>[]): string {
  const rows = nodeRows.map(flattenRowForTsv)
  if (rows.length === 0) return ''
  const columns: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key)
    }
  }
  const lines = [
    columns.join('\t'),
    ...rows.map((row) => columns.map((column) => formatTsvCell(row[column])).join('\t'))
  ]
  return `${lines.join('\n')}\n`
}

/** Database rows are node-shaped; lift `properties` to top-level TSV columns. */
export function flattenRowForTsv(row: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(row.properties)) return row
  return {
    ...(typeof row.id === 'string' ? { id: row.id } : {}),
    ...row.properties,
    ...(row.updatedAt !== undefined ? { updatedAt: row.updatedAt } : {})
  }
}

function formatTsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return text.replace(/[\t\n\r]+/g, ' ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
