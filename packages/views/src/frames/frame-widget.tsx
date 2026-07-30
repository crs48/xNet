/**
 * The generic dashboard frame widget (0346): any workspace node through
 * any registered view, as a dashboard tile — the grid container's
 * adoption of the Frame contract.
 */

import type { WidgetDefinition } from '@xnetjs/dashboard'
import { registerBuiltinViews } from '../builtins.js'
import { viewRegistry } from '../registry.js'
import { FrameRenderer } from './FrameRenderer.js'
import type { FrameDef } from './types.js'
import React from 'react'

if (!viewRegistry.has('board')) registerBuiltinViews()

export interface FrameWidgetConfig extends Record<string, unknown> {
  /** 'node' (default) or 'collection' — the Set/Collection duality. */
  sourceKind?: 'node' | 'collection'
  /** Target node id (database, page, …) for node frames. */
  nodeId: string
  /** Curated node ids (one per line / comma) for collection frames. */
  nodeIds?: string
  /** ViewRegistry type + shell-owned 'table'. */
  viewType: string
}

/** Parse the config's curated-id text into a bounded id list. */
export function parseCollectionIds(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[\n,]/)
    .map((id) => id.trim())
    .filter(Boolean)
}

/** Widget type key in the dashboard registry. */
export const FRAME_WIDGET_TYPE = 'frame.node'

export function createFrameWidgetDefinition(): WidgetDefinition<FrameWidgetConfig> {
  return {
    type: FRAME_WIDGET_TYPE,
    name: 'Frame',
    icon: 'Frame',
    description: 'A live view of any workspace node — database, page, or plugin view.',
    trustTier: 'first-party',
    configFields: [
      {
        key: 'sourceKind',
        label: 'Source',
        type: 'select',
        options: [
          { label: 'One node (live view)', value: 'node' },
          { label: 'Collection (curated list)', value: 'collection' }
        ]
      },
      { key: 'nodeId', label: 'Node id', type: 'text' },
      {
        key: 'nodeIds',
        label: 'Collection ids (one per line)',
        type: 'text',
        description: 'Used when Source is Collection.'
      },
      {
        key: 'viewType',
        label: 'View',
        type: 'select',
        options: [
          { label: 'Table', value: 'table' },
          ...viewRegistry.getAll().map((v) => ({ label: v.name, value: v.type }))
        ]
      }
    ],
    defaultSize: { w: 6, h: 5, minW: 3, minH: 3 },
    getStubConfig: () => ({ config: { sourceKind: 'node', nodeId: '', viewType: 'table' } }),
    component: ({ config }) => {
      const collectionIds = parseCollectionIds(config.nodeIds)
      const isCollection = config.sourceKind === 'collection'
      const frame: FrameDef = {
        id: isCollection
          ? `widget:collection:${collectionIds.join(',')}`
          : `widget:${config.nodeId}:${config.viewType}`,
        source: isCollection
          ? { kind: 'collection', nodeIds: collectionIds }
          : { kind: 'node', nodeId: config.nodeId },
        viewType: config.viewType || 'table',
        tier: 'live',
        sortKey: ''
      }
      if (isCollection ? collectionIds.length === 0 : !config.nodeId) {
        return (
          <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
            Configure this frame: pick {isCollection ? 'some nodes' : 'a node'}.
          </div>
        )
      }
      return <FrameRenderer frame={frame} className="h-full overflow-hidden" />
    }
  }
}

/** Register into a dashboard WidgetRegistry (host calls once at boot). */
export function registerFrameWidget(registry: {
  register: (def: WidgetDefinition<FrameWidgetConfig>) => { dispose(): void }
  has: (type: string) => boolean
}): void {
  if (!registry.has(FRAME_WIDGET_TYPE)) {
    registry.register(createFrameWidgetDefinition())
  }
}
