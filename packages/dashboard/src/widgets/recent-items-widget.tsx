/**
 * Recent items widget - Merged feed of recently updated nodes across
 * schemas, via a query-set descriptor (one query per source schema).
 */

import type { WidgetDefinition, WidgetProps } from '../types'
import { useMemo } from 'react'
import {
  CANVAS_SCHEMA_IRI,
  DATABASE_SCHEMA_IRI,
  formatRelativeTime,
  nodeQuery,
  PAGE_SCHEMA_IRI,
  rowTitle,
  TASK_SCHEMA_IRI
} from './shared'

export interface RecentItemsWidgetConfig extends Record<string, unknown> {
  maxItems?: number
}

const QUERY_ICONS: Record<string, string> = {
  pages: '📄',
  tasks: '☑️',
  canvases: '🖼️',
  databases: '🗃️'
}

function RecentItemsWidget({
  config,
  data,
  onOpenNode
}: WidgetProps<RecentItemsWidgetConfig>): JSX.Element {
  const items = useMemo(() => {
    const merged = Object.entries(data.queries).flatMap(([queryId, rows]) =>
      rows.map((row) => ({ queryId, row }))
    )
    return merged
      .sort((a, b) => (Number(b.row.updatedAt) || 0) - (Number(a.row.updatedAt) || 0))
      .slice(0, config.maxItems ?? 15)
  }, [data.queries, config.maxItems])

  if (!data.loading && items.length === 0) {
    return <div className="px-4 py-3 text-sm text-muted-foreground">Nothing recent</div>
  }

  return (
    <ul className="h-full overflow-y-auto px-2 py-1" data-canvas-interactive="true">
      {items.map(({ queryId, row }) => (
        <li key={`${queryId}:${row.id}`}>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50"
            onClick={() => onOpenNode?.(row.id, String(row.schemaId ?? ''))}
          >
            <span aria-hidden>{QUERY_ICONS[queryId] ?? '•'}</span>
            <span className="min-w-0 flex-1 truncate text-foreground">{rowTitle(row)}</span>
            {typeof row.updatedAt === 'number' ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatRelativeTime(row.updatedAt)}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  )
}

export const recentItemsWidget: WidgetDefinition<RecentItemsWidgetConfig> = {
  type: 'feed.recent',
  name: 'Recent items',
  icon: 'history',
  description: 'Recently updated pages, tasks, canvases, and databases',
  trustTier: 'first-party',
  defaultSize: { w: 4, h: 5, minW: 3, minH: 3 },
  configFields: [{ key: 'maxItems', label: 'Max items', type: 'number', defaultValue: 15 }],
  getStubConfig: () => ({
    config: { maxItems: 15 },
    query: {
      descriptor: {
        version: 1,
        title: 'Recent items',
        query: {
          version: 1,
          kind: 'query-set',
          mode: 'dashboard',
          queries: {
            pages: nodeQuery(PAGE_SCHEMA_IRI, {
              orderBy: [{ field: 'updatedAt', direction: 'desc' }],
              first: 15
            }),
            tasks: nodeQuery(TASK_SCHEMA_IRI, {
              orderBy: [{ field: 'updatedAt', direction: 'desc' }],
              first: 15
            }),
            canvases: nodeQuery(CANVAS_SCHEMA_IRI, {
              orderBy: [{ field: 'updatedAt', direction: 'desc' }],
              first: 15
            }),
            databases: nodeQuery(DATABASE_SCHEMA_IRI, {
              orderBy: [{ field: 'updatedAt', direction: 'desc' }],
              first: 15
            })
          }
        }
      },
      refresh: 'live'
    }
  }),
  component: RecentItemsWidget
}
