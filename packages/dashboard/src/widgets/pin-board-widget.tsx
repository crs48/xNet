/**
 * Pin-board widget - Gallery-style card grid over any query (covers from a
 * configurable image-url property), the tile-sized take on the gallery view.
 */

import type { WidgetDefinition, WidgetProps } from '../types'
import { useMemo } from 'react'
import { nodeQuery, preferredSchema, rowTitle, stubDescriptor } from './shared'

const SOCIAL_CONTENT_IRI = 'xnet://xnet.fyi/social/SocialContent@1.0.0'
const MEDIA_ASSET_IRI = 'xnet://xnet.fyi/MediaAsset@1.0.0'

export interface PinBoardWidgetConfig extends Record<string, unknown> {
  /** Property holding a cover image URL */
  coverProperty?: string
  maxItems?: number
  showTitle?: boolean
}

function coverUrl(row: Record<string, unknown>, coverProperty: string | undefined): string | null {
  const candidates = coverProperty
    ? [row[coverProperty]]
    : [row.thumbnailUrl, row.coverUrl, row.imageUrl, row.url]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^https?:\/\//.test(candidate)) return candidate
  }
  return null
}

function PinBoardWidget({
  config,
  data,
  width,
  onOpenNode
}: WidgetProps<PinBoardWidgetConfig>): JSX.Element {
  const items = useMemo(
    () => data.rows.slice(0, config.maxItems ?? 12),
    [data.rows, config.maxItems]
  )
  const columns = Math.max(2, Math.min(4, Math.floor(width / 140)))

  if (!data.loading && items.length === 0) {
    return <div className="px-4 py-3 text-sm text-muted-foreground">Nothing pinned yet</div>
  }

  return (
    <div
      className="grid h-full content-start gap-2 overflow-y-auto p-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      data-canvas-interactive="true"
    >
      {items.map((item) => {
        const cover = coverUrl(item, config.coverProperty)
        return (
          <button
            key={item.id}
            type="button"
            className="flex flex-col overflow-hidden rounded-md border border-border bg-card text-left hover:border-primary"
            onClick={() => onOpenNode?.(item.id, String(item.schemaId ?? ''))}
          >
            <span className="flex aspect-square w-full items-center justify-center overflow-hidden bg-accent/40">
              {cover ? (
                <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="text-2xl" aria-hidden>
                  📌
                </span>
              )}
            </span>
            {config.showTitle !== false ? (
              <span className="truncate px-2 py-1 text-xs text-foreground">{rowTitle(item)}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export const pinBoardWidget: WidgetDefinition<PinBoardWidgetConfig> = {
  type: 'board.pins',
  name: 'Pin board',
  icon: 'layout-grid',
  description: 'Gallery grid of items with cover images',
  trustTier: 'first-party',
  defaultSize: { w: 4, h: 4, minW: 3, minH: 3 },
  configFields: [
    { key: 'coverProperty', label: 'Cover image property', type: 'property-select' },
    { key: 'maxItems', label: 'Max items', type: 'number', defaultValue: 12 },
    { key: 'showTitle', label: 'Show titles', type: 'checkbox', defaultValue: true }
  ],
  getStubConfig: ({ schemas }) => {
    const schemaId =
      preferredSchema(schemas, [SOCIAL_CONTENT_IRI, MEDIA_ASSET_IRI]) ?? MEDIA_ASSET_IRI
    return {
      config: { maxItems: 12, showTitle: true },
      query: {
        descriptor: stubDescriptor(
          'Pin board',
          nodeQuery(schemaId, {
            orderBy: [{ field: 'updatedAt', direction: 'desc' }],
            first: 50
          })
        ),
        refresh: 'live'
      }
    }
  },
  component: PinBoardWidget
}
