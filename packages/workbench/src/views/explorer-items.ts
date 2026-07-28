/**
 * Explorer item contracts (0166/0169) — a leaf module so the folder
 * context and the row components can share types without an import
 * cycle (rows → context → items, rows → items).
 */
import { CanvasSchema, DashboardSchema, DatabaseSchema, MapSchema, PageSchema } from '@xnetjs/data'
import { LabSchema } from '@xnetjs/labs'

export type ExplorerNodeType = 'page' | 'database' | 'canvas' | 'dashboard' | 'map' | 'lab'

export interface ExplorerItem {
  id: string
  title: string
  type: ExplorerNodeType
  updatedAt: number
  createdAt?: number
  folder?: string | null
  sortKey?: string
  tags?: string[]
}

export const EXPLORER_SCHEMAS = {
  page: PageSchema,
  database: DatabaseSchema,
  canvas: CanvasSchema,
  dashboard: DashboardSchema,
  map: MapSchema,
  lab: LabSchema
} as const

export const SCHEMA_IDS: Record<ExplorerNodeType, string> = {
  page: PageSchema._schemaId,
  database: DatabaseSchema._schemaId,
  canvas: CanvasSchema._schemaId,
  dashboard: DashboardSchema._schemaId,
  map: MapSchema._schemaId,
  lab: LabSchema._schemaId
}

export function isExplorerNodeType(value: string): value is ExplorerNodeType {
  return value in SCHEMA_IDS
}
