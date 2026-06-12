/**
 * Saved view widget - Tile-constrained table over any query.
 *
 * Renders the widget instance's own descriptor, or — when savedViewId is
 * configured — the descriptor persisted in a SavedViewSchema node, as a
 * compact table. Columns derive from the rows; the full SavedViewRunner
 * chrome (facets, search, pagination) stays on the data workspace surface.
 */

import type { WidgetDefinition, WidgetProps } from '../types'
import { nodeQuery, rowTitle, stubDescriptor, TASK_SCHEMA_IRI } from './shared'

export interface SavedViewWidgetConfig extends Record<string, unknown> {
  /** Optional SavedViewSchema node whose descriptor replaces the inline query */
  savedViewId?: string
  /** Max columns rendered in the tile */
  maxColumns?: number
}

const INTERNAL_KEYS = new Set([
  'id',
  'schemaId',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
  'deleted'
])

function columnsForRows(
  rows: ReadonlyArray<Record<string, unknown>>,
  maxColumns: number
): string[] {
  const first = rows[0]
  if (!first) return []

  return Object.keys(first)
    .filter((key) => !INTERNAL_KEYS.has(key) && !key.startsWith('_'))
    .filter((key) => {
      const value = first[key]
      return value === null || ['string', 'number', 'boolean'].includes(typeof value)
    })
    .slice(0, maxColumns)
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? '✓' : ''
  return String(value)
}

function SavedViewWidget({
  config,
  data,
  onOpenNode
}: WidgetProps<SavedViewWidgetConfig>): JSX.Element {
  const columns = columnsForRows(data.rows, config.maxColumns ?? 4)

  if (!data.loading && data.rows.length === 0) {
    return <div className="px-4 py-3 text-sm text-muted-foreground">No rows</div>
  }

  return (
    <div className="h-full overflow-auto" data-canvas-interactive="true">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className="border-b border-border px-3 py-1.5 text-left text-xs font-medium text-muted-foreground"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => onOpenNode?.(row.id, String(row.schemaId ?? ''))}
              title={rowTitle(row)}
            >
              {columns.map((column) => (
                <td
                  key={column}
                  className="max-w-48 truncate border-b border-border/50 px-3 py-1.5 text-foreground"
                >
                  {formatCell(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const savedViewWidget: WidgetDefinition<SavedViewWidgetConfig> = {
  type: 'view.saved',
  name: 'Saved view',
  icon: 'table',
  description: 'Any saved view or query, rendered as a compact table',
  trustTier: 'first-party',
  defaultSize: { w: 6, h: 4, minW: 3, minH: 2 },
  configFields: [
    { key: 'savedViewId', label: 'Saved view node id', type: 'text' },
    { key: 'maxColumns', label: 'Max columns', type: 'number', defaultValue: 4 }
  ],
  getStubConfig: () => ({
    config: { maxColumns: 4 },
    query: {
      descriptor: stubDescriptor(
        'Saved view',
        nodeQuery(TASK_SCHEMA_IRI, {
          orderBy: [{ field: 'updatedAt', direction: 'desc' }],
          first: 25
        })
      ),
      refresh: 'live'
    }
  }),
  component: SavedViewWidget
}
