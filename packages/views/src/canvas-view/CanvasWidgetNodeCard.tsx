/**
 * CanvasWidgetNodeCard - Shared canvas host for dashboard widget nodes
 * (exploration 0277, W2).
 *
 * Wraps the dashboard runtime around a `widget` canvas node with the
 * LOD-aware suspension rule from 0273: when the card renders as a sliver
 * (placeholder/minimal level of detail) its live query pauses instead of
 * streaming rows nobody can read. Full-detail cards keep their
 * subscriptions.
 */

import type { CanvasNode, CanvasNodeRenderContext } from '@xnetjs/canvas'
import type { SavedViewSchemaRegistry } from '@xnetjs/react'
import type { JSX } from 'react'
import { CanvasWidgetCard, DashboardRuntimeProvider } from '@xnetjs/dashboard'
import { CANVAS_DASHBOARD_SCHEMA_REGISTRY } from './dashboard-schemas.js'

export interface CanvasWidgetNodeCardProps {
  node: CanvasNode
  lod: CanvasNodeRenderContext['lod']
  /** Defaults to the shared canvas/dashboard registry. */
  schemas?: SavedViewSchemaRegistry
}

export function CanvasWidgetNodeCard({
  node,
  lod,
  schemas = CANVAS_DASHBOARD_SCHEMA_REGISTRY
}: CanvasWidgetNodeCardProps): JSX.Element {
  const suspended = lod === 'placeholder' || lod === 'minimal'

  return (
    <DashboardRuntimeProvider schemas={schemas} variables={undefined} suspended={suspended}>
      <CanvasWidgetCard node={node} />
    </DashboardRuntimeProvider>
  )
}
