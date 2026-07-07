/**
 * DashboardView - App wrapper around the dashboard surface: provides the
 * schema registry widget queries may target and routes node opens to the
 * right surface.
 */
import { useNavigate } from '@tanstack/react-router'
import { DashboardSurface } from '@xnetjs/dashboard'
import { CANVAS_DASHBOARD_SCHEMA_REGISTRY } from '@xnetjs/views'
import { useCallback } from 'react'

// Single-sourced with the canvas widget cards (0277 W2) so dashboards and
// canvas widgets resolve queries against the same schema set.
export const DASHBOARD_SCHEMA_REGISTRY = CANVAS_DASHBOARD_SCHEMA_REGISTRY

/** Schema-IRI fragment → surface route. First match wins; fallback is /data. */
const NODE_OPEN_TARGETS: ReadonlyArray<{ match: string; to: string; paramKey?: string }> = [
  { match: '/Page', to: '/doc/$docId', paramKey: 'docId' },
  { match: '/Database', to: '/db/$dbId', paramKey: 'dbId' },
  { match: '/Canvas', to: '/canvas/$canvasId', paramKey: 'canvasId' },
  { match: '/Map', to: '/map/$mapId', paramKey: 'mapId' },
  { match: '/Task', to: '/tasks' }
]

function nodeOpenOptions(
  nodeId: string,
  schemaId: string
): { to: string; params?: Record<string, string> } {
  const target = NODE_OPEN_TARGETS.find((candidate) => schemaId.includes(candidate.match))
  if (!target) return { to: '/data' }
  if (!target.paramKey) return { to: target.to }
  return { to: target.to, params: { [target.paramKey]: nodeId } }
}

export function DashboardView({ dashboardId }: { dashboardId: string }) {
  const navigate = useNavigate()

  const handleOpenNode = useCallback(
    (nodeId: string, schemaId: string) => {
      void navigate(nodeOpenOptions(nodeId, schemaId) as never)
    },
    [navigate]
  )

  return (
    <DashboardSurface
      dashboardId={dashboardId}
      schemas={DASHBOARD_SCHEMA_REGISTRY}
      onOpenNode={handleOpenNode}
    />
  )
}
