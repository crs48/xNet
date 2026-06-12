/**
 * Social feed widget - Saved social content rendered as a compact feed.
 *
 * The stub query reuses the "Saved Content By Creator" graph lens descriptor
 * from packages/social (a query-set over SocialContent + SocialActor), so
 * the dashboard shows exactly what the data workspace lens shows.
 */

import type { WidgetDefinition, WidgetProps } from '../types'
import { createDefaultSocialGraphLenses } from '@xnetjs/social/lenses'
import { formatRelativeTime } from './shared'

export interface SocialFeedWidgetConfig extends Record<string, unknown> {
  maxItems?: number
  showPlatform?: boolean
}

function contentTimestamp(row: Record<string, unknown>): number {
  const published = Number(row.publishedAt)
  if (Number.isFinite(published) && published > 0) return published
  return Number(row.importedAt) || Number(row.updatedAt) || 0
}

function SocialFeedWidget({
  config,
  data,
  onOpenNode
}: WidgetProps<SocialFeedWidgetConfig>): JSX.Element {
  // The lens is a query-set; content rows live in its primary content query.
  const rows =
    Object.entries(data.queries).find(([queryId]) => queryId.includes('content'))?.[1] ?? data.rows
  const items = [...rows]
    .sort((a, b) => contentTimestamp(b) - contentTimestamp(a))
    .slice(0, config.maxItems ?? 20)

  if (!data.loading && items.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground">
        No saved social content yet. Run a social import to fill this feed.
      </div>
    )
  }

  return (
    <ul className="h-full overflow-y-auto px-2 py-1" data-canvas-interactive="true">
      {items.map((item) => {
        const timestamp = contentTimestamp(item)
        return (
          <li key={item.id}>
            <button
              type="button"
              className="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-accent/50"
              onClick={() => onOpenNode?.(item.id, String(item.schemaId ?? ''))}
            >
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {config.showPlatform !== false && item.platform ? (
                  <span className="rounded bg-accent px-1.5 py-0.5">{String(item.platform)}</span>
                ) : null}
                {item.actorHandle ? <span>@{String(item.actorHandle)}</span> : null}
                {timestamp > 0 ? <span>{formatRelativeTime(timestamp)}</span> : null}
              </span>
              <span className="line-clamp-2 text-sm text-foreground">
                {String(item.title || item.textPreview || 'Untitled content')}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export const socialFeedWidget: WidgetDefinition<SocialFeedWidgetConfig> = {
  type: 'feed.social',
  name: 'Social feed',
  icon: 'rss',
  description: 'Latest saved content from your social imports',
  trustTier: 'first-party',
  defaultSize: { w: 4, h: 5, minW: 3, minH: 3 },
  configFields: [
    { key: 'maxItems', label: 'Max items', type: 'number', defaultValue: 20 },
    { key: 'showPlatform', label: 'Show platform badge', type: 'checkbox', defaultValue: true }
  ],
  getStubConfig: () => {
    const lens = createDefaultSocialGraphLenses().find(
      (candidate) => candidate.id === 'social.lens.saved-content-by-creator'
    )
    if (!lens) {
      throw new Error('saved-content-by-creator lens missing from @xnetjs/social')
    }
    return {
      config: { maxItems: 20, showPlatform: true },
      query: { descriptor: lens.descriptor, refresh: 'live' }
    }
  },
  component: SocialFeedWidget
}
