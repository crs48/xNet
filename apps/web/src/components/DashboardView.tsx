/**
 * DashboardView - App wrapper around the dashboard surface: provides the
 * schema registry widget queries may target and routes node opens to the
 * right surface.
 */
import type { SavedViewSchemaRegistry } from '@xnetjs/react'
import { useNavigate } from '@tanstack/react-router'
import { DashboardSurface } from '@xnetjs/dashboard'
import {
  CanvasSchema,
  DatabaseSchema,
  PageSchema,
  ProjectSchema,
  SavedViewSchema,
  TaskSchema
} from '@xnetjs/data'
import { socialSchemas } from '@xnetjs/social/schemas'
import { useCallback } from 'react'

export const DASHBOARD_SCHEMA_REGISTRY = [
  PageSchema,
  DatabaseSchema,
  TaskSchema,
  ProjectSchema,
  CanvasSchema,
  SavedViewSchema,
  ...socialSchemas
] as unknown as SavedViewSchemaRegistry

export function DashboardView({ dashboardId }: { dashboardId: string }) {
  const navigate = useNavigate()

  const handleOpenNode = useCallback(
    (nodeId: string, schemaId: string) => {
      if (schemaId.includes('/Page@') || schemaId.includes('/Page')) {
        void navigate({ to: '/doc/$docId', params: { docId: nodeId } })
      } else if (schemaId.includes('/Database')) {
        void navigate({ to: '/db/$dbId', params: { dbId: nodeId } })
      } else if (schemaId.includes('/Canvas')) {
        void navigate({ to: '/canvas/$canvasId', params: { canvasId: nodeId } })
      } else if (schemaId.includes('/Task')) {
        void navigate({ to: '/tasks' })
      } else {
        void navigate({ to: '/data' })
      }
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
