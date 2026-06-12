/**
 * Schema registry for running saved views anywhere in the shell
 * (saved-view tabs, the query console) — core schemas plus the
 * social import schemas (exploration 0166).
 */
import type { SavedViewSchemaRegistry } from '@xnetjs/react'
import {
  CanvasSchema,
  DashboardSchema,
  DatabaseSchema,
  PageSchema,
  SavedViewSchema,
  TaskSchema
} from '@xnetjs/data'
import { socialSchemas } from '@xnetjs/social/schemas'

export const WORKBENCH_SAVED_VIEW_REGISTRY = [
  PageSchema,
  DatabaseSchema,
  CanvasSchema,
  DashboardSchema,
  TaskSchema,
  SavedViewSchema,
  ...socialSchemas
] as unknown as SavedViewSchemaRegistry
