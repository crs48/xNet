/**
 * The narrow surface `AiSurfaceService` hands to its built-in tool handlers
 * (`tools/`) and resource URI routes (`resources/`).
 *
 * The service stays the facade: it implements this interface with bound
 * closures over its private methods, so extracted modules depend on this
 * contract instead of the service class and the dependency points one way.
 */

import type {
  AiDatabaseMutationApplyResult,
  AiPageMarkdownApplyResult,
  AiPageMarkdownRollbackResult,
  AiResourceContent,
  AiSearchOptions
} from './service'
import type {
  AiAuditEvent,
  AiContextPack,
  AiContextPackResource,
  AiContextSeed,
  AiMutationPlan
} from './types'
import type { NodeData } from '../services/local-api'

export type AiSurfaceHost = {
  // ─── Workspace And Search ─────────────────────────────────────────────────
  search(options: AiSearchOptions): Promise<Record<string, unknown>>
  expandGraph(options: {
    nodeId: string
    hops?: number
    limit?: number
  }): Promise<Record<string, unknown>>
  createContextPack(options: {
    query?: string
    seeds?: AiContextSeed[]
    limit?: number
  }): Promise<AiContextPack>
  createExternalContextResource(options: {
    url: string
    text: string
    mimeType?: string
  }): AiContextPackResource
  getWorkspaceSummary(): Promise<Record<string, unknown>>
  getRecentNodes(): Promise<Record<string, unknown>>
  listNodes(): Promise<Record<string, unknown>>
  listSchemas(): Promise<Record<string, unknown>>
  getNodeOrThrow(id: string): Promise<NodeData>
  getNodeProjection(id: string): Promise<Record<string, unknown>>

  // ─── Pages ────────────────────────────────────────────────────────────────
  readPageMarkdown(
    pageId: string,
    includeFrontmatter: boolean,
    uri?: string
  ): Promise<AiResourceContent>
  readPageOutline(pageId: string): Promise<Record<string, unknown>>
  planPagePatch(args: Record<string, unknown>): Promise<AiMutationPlan>
  applyPageMarkdown(args: Record<string, unknown>): Promise<AiPageMarkdownApplyResult>
  rollbackPageMarkdown(args: Record<string, unknown>): Promise<AiPageMarkdownRollbackResult>
  /** Create a page and seed its content in one audited step (0346). */
  composePage(args: {
    title: string
    markdown: string
    confirmApply: boolean
    actor?: string
    intent?: string
    extra?: Record<string, unknown>
  }): Promise<Record<string, unknown>>

  // ─── Audit ────────────────────────────────────────────────────────────────
  getAuditLog(options: { planId?: string; limit?: number }): {
    events: AiAuditEvent[]
    count: number
    limit: number
  }

  // ─── Databases ────────────────────────────────────────────────────────────
  describeDatabase(
    databaseId: string,
    options?: { includeSample?: boolean }
  ): Promise<Record<string, unknown>>
  readDatabaseViews(databaseId: string): Promise<Record<string, unknown>>
  queryDatabase(options: {
    databaseId: string
    schemaId?: string
    descriptor?: Record<string, unknown>
    where?: Record<string, unknown>
    search?: unknown
    orderBy?: Record<string, unknown>
    materializedView?: unknown
    count?: string
    limit?: number
    offset?: number
  }): Promise<Record<string, unknown>>
  sampleDatabase(options: {
    databaseId: string
    schemaId?: string
    descriptor?: Record<string, unknown>
    sampleSize?: number
  }): Promise<Record<string, unknown>>
  explainDatabaseQuery(options: {
    databaseId: string
    schemaId?: string
    descriptor?: Record<string, unknown>
    limit?: number
    offset?: number
  }): Promise<Record<string, unknown>>
  planDatabaseMutation(args: Record<string, unknown>): Promise<AiMutationPlan>
  applyDatabaseMutation(args: Record<string, unknown>): Promise<AiDatabaseMutationApplyResult>

  // ─── Canvases ─────────────────────────────────────────────────────────────
  listCanvases(options: { limit?: number; offset?: number }): Promise<Record<string, unknown>>
  readCanvasViewport(options: {
    canvasId: string
    x?: number
    y?: number
    w?: number
    h?: number
    tileSize?: number
    tileIds?: string[]
    includeSourcePreviews: boolean
  }): Promise<Record<string, unknown>>
  readCanvasObjects(canvasId: string): Promise<Record<string, unknown>>
  readCanvasSelection(options: {
    canvasId: string
    objectIds: string[]
    includeSourcePreviews: boolean
  }): Promise<Record<string, unknown>>
  searchCanvas(options: {
    canvasId: string
    query: string
    limit?: number
  }): Promise<Record<string, unknown>>
  exportCanvasJsonCanvas(options: {
    canvasId: string
    includeXNetMetadata: boolean
    x?: number
    y?: number
    w?: number
    h?: number
  }): Promise<Record<string, unknown>>
  readCanvasObject(canvasId: string, objectId: string): Promise<Record<string, unknown>>
  planCanvasJsonCanvasImport(args: Record<string, unknown>): Promise<AiMutationPlan>
  planCanvasMutation(args: Record<string, unknown>): Promise<AiMutationPlan>

  // ─── Serialization ────────────────────────────────────────────────────────
  jsonResource(uri: string, value: unknown): AiResourceContent
}
