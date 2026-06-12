/**
 * Page links widget - Quick links to recently updated pages.
 */

import type { WidgetDefinition, WidgetProps } from '../types'
import { formatRelativeTime, nodeQuery, PAGE_SCHEMA_IRI, rowTitle, stubDescriptor } from './shared'

export interface PageLinksWidgetConfig extends Record<string, unknown> {
  showUpdated?: boolean
}

function PageLinksWidget({
  config,
  data,
  onOpenNode
}: WidgetProps<PageLinksWidgetConfig>): JSX.Element {
  if (!data.loading && data.rows.length === 0) {
    return <div className="px-4 py-3 text-sm text-muted-foreground">No pages yet</div>
  }

  return (
    <ul className="h-full overflow-y-auto px-2 py-1" data-canvas-interactive="true">
      {data.rows.map((page) => (
        <li key={page.id}>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50"
            onClick={() => onOpenNode?.(page.id, PAGE_SCHEMA_IRI)}
          >
            <span aria-hidden>📄</span>
            <span className="min-w-0 flex-1 truncate text-foreground">{rowTitle(page)}</span>
            {config.showUpdated && typeof page.updatedAt === 'number' ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatRelativeTime(page.updatedAt)}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  )
}

export const pageLinksWidget: WidgetDefinition<PageLinksWidgetConfig> = {
  type: 'links.pages',
  name: 'Page links',
  icon: 'file-text',
  description: 'Quick links to recently updated pages',
  trustTier: 'first-party',
  defaultSize: { w: 3, h: 4, minW: 2, minH: 2 },
  configFields: [
    { key: 'showUpdated', label: 'Show updated time', type: 'checkbox', defaultValue: true }
  ],
  getStubConfig: () => ({
    config: { showUpdated: true },
    query: {
      descriptor: stubDescriptor(
        'Pages',
        nodeQuery(PAGE_SCHEMA_IRI, {
          orderBy: [{ field: 'updatedAt', direction: 'desc' }],
          first: 20
        })
      ),
      refresh: 'live'
    }
  }),
  component: PageLinksWidget
}
