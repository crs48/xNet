/**
 * Canvas/dashboard saved-view schema registry (exploration 0277, W2).
 *
 * Single-sourced here so the web and desktop canvases resolve widget
 * queries against the exact same schema set — a widget node synced from
 * one platform must hydrate identically on the other.
 */

import type { SavedViewSchemaRegistry } from '@xnetjs/react'
import {
  CanvasSchema,
  DatabaseSchema,
  ExperimentSchema,
  MetricSchema,
  ObservationSchema,
  PageSchema,
  ProjectSchema,
  SavedViewSchema,
  TaskSchema
} from '@xnetjs/data'
import { socialSchemas } from '@xnetjs/social/schemas'

export const CANVAS_DASHBOARD_SCHEMA_REGISTRY = [
  PageSchema,
  DatabaseSchema,
  TaskSchema,
  ProjectSchema,
  CanvasSchema,
  SavedViewSchema,
  MetricSchema,
  ObservationSchema,
  ExperimentSchema,
  ...socialSchemas
] as unknown as SavedViewSchemaRegistry
