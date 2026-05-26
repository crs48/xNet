/**
 * Mind-map conversion commands for source-backed planning objects.
 */

import type { CanvasNode, CanvasNodeProperties, CanvasObjectKind, CanvasShapeNode } from '../types'
import { DatabaseRowSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { getCanvasMindMapMetadata } from './branches'
import { createCanvasMindMapBranchProperties } from './creation'

export type CanvasMindMapConvertibleKind =
  | 'mind-map-branch'
  | 'note'
  | 'page'
  | 'task'
  | 'database-row'

export type CanvasMindMapObjectConversionTarget = Exclude<
  CanvasMindMapConvertibleKind,
  'mind-map-branch'
>

export type CanvasMindMapConversionValidation = {
  valid: boolean
  errors: string[]
}

export type CanvasMindMapSourceNodeDraft = {
  schemaId: string
  properties: Record<string, unknown>
}

export type CanvasMindMapConversionTrace = {
  from: CanvasMindMapConvertibleKind
  nodeId: string
  sourceNodeId?: string
  sourceSchemaId?: string
}

export type CanvasMindMapConversionNodeUpdate = {
  id: string
  type: CanvasObjectKind
  sourceNodeId?: string
  sourceSchemaId?: string
  properties: CanvasNodeProperties
}

export type CanvasMindMapConversionCommand = {
  kind: 'canvas.mindMap.convert'
  sourceKind: CanvasMindMapConvertibleKind
  targetKind: CanvasMindMapConvertibleKind
  validation: CanvasMindMapConversionValidation
  canvasNodeUpdate: CanvasMindMapConversionNodeUpdate | null
  sourceNodeDraft?: CanvasMindMapSourceNodeDraft
}

export type CreateCanvasNodeToMindMapBranchConversionInput = {
  node: CanvasNode
  mapId: string
  parentId: string
  depth: number
  index?: number
  title?: string
}

export type CreateCanvasMindMapBranchToObjectConversionInput = {
  node: CanvasNode
  targetKind: CanvasMindMapObjectConversionTarget
  databaseId?: string
  sortKey?: string
  sourceNodeId?: string
}

const DEFAULT_BRANCH_TITLE = 'Branch'
const DEFAULT_DATABASE_ROW_SORT_KEY = 'a0'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function createValidation(errors: string[]): CanvasMindMapConversionValidation {
  return {
    valid: errors.length === 0,
    errors
  }
}

function getTitle(node: CanvasNode, fallback = DEFAULT_BRANCH_TITLE): string {
  const title =
    typeof node.alias === 'string'
      ? node.alias
      : typeof node.properties.title === 'string'
        ? node.properties.title
        : typeof node.properties.label === 'string'
          ? node.properties.label
          : fallback

  const normalized = title.trim()
  return normalized.length > 0 ? normalized : fallback
}

function getSourceSchemaIdForTarget(
  targetKind: CanvasMindMapObjectConversionTarget
): string | undefined {
  switch (targetKind) {
    case 'page':
      return PageSchema._schemaId
    case 'task':
      return TaskSchema._schemaId
    case 'database-row':
      return DatabaseRowSchema._schemaId
    case 'note':
      return undefined
  }
}

function getCanvasObjectKindForTarget(
  targetKind: CanvasMindMapObjectConversionTarget
): CanvasObjectKind {
  switch (targetKind) {
    case 'page':
      return 'page'
    case 'note':
    case 'task':
    case 'database-row':
      return 'note'
  }
}

function createConversionTrace(
  node: CanvasNode,
  from: CanvasMindMapConvertibleKind
): CanvasMindMapConversionTrace {
  return {
    from,
    nodeId: node.id,
    ...(node.sourceNodeId ? { sourceNodeId: node.sourceNodeId } : {}),
    ...(node.sourceSchemaId ? { sourceSchemaId: node.sourceSchemaId } : {})
  }
}

function createSourceNodeDraft(
  input: CreateCanvasMindMapBranchToObjectConversionInput,
  title: string
): CanvasMindMapSourceNodeDraft | undefined {
  switch (input.targetKind) {
    case 'page':
      return {
        schemaId: PageSchema._schemaId,
        properties: { title }
      }
    case 'task':
      return {
        schemaId: TaskSchema._schemaId,
        properties: {
          title,
          completed: false,
          status: 'todo',
          source: 'canvas'
        }
      }
    case 'database-row':
      return {
        schemaId: DatabaseRowSchema._schemaId,
        properties: {
          database: input.databaseId,
          sortKey: input.sortKey ?? DEFAULT_DATABASE_ROW_SORT_KEY,
          title
        }
      }
    case 'note':
      return undefined
  }
}

export function getCanvasMindMapConvertibleKind(
  node: CanvasNode
): CanvasMindMapConvertibleKind | null {
  if (getCanvasMindMapMetadata(node)) {
    return 'mind-map-branch'
  }

  if (node.sourceSchemaId === PageSchema._schemaId || node.type === 'page') {
    return 'page'
  }

  if (node.sourceSchemaId === TaskSchema._schemaId) {
    return 'task'
  }

  if (node.sourceSchemaId === DatabaseRowSchema._schemaId) {
    return 'database-row'
  }

  if (node.type === 'note') {
    return 'note'
  }

  return null
}

export function createCanvasNodeToMindMapBranchConversionCommand(
  input: CreateCanvasNodeToMindMapBranchConversionInput
): CanvasMindMapConversionCommand {
  const sourceKind = getCanvasMindMapConvertibleKind(input.node)
  const errors = [
    ...(sourceKind ? [] : [`Node ${input.node.id} cannot be converted into a mind-map branch.`]),
    ...(isNonEmptyString(input.mapId) ? [] : ['A target mind-map id is required.']),
    ...(isNonEmptyString(input.parentId) ? [] : ['A target parent branch id is required.'])
  ]
  const validation = createValidation(errors)
  if (!validation.valid || !sourceKind) {
    return {
      kind: 'canvas.mindMap.convert',
      sourceKind: sourceKind ?? 'note',
      targetKind: 'mind-map-branch',
      validation,
      canvasNodeUpdate: null
    }
  }

  const title = input.title?.trim() || getTitle(input.node)
  const branchProperties = createCanvasMindMapBranchProperties({
    title,
    mapId: input.mapId,
    parentId: input.parentId,
    depth: input.depth,
    index: input.index
  })

  return {
    kind: 'canvas.mindMap.convert',
    sourceKind,
    targetKind: 'mind-map-branch',
    validation,
    canvasNodeUpdate: {
      id: input.node.id,
      type: 'shape',
      ...(input.node.sourceNodeId ? { sourceNodeId: input.node.sourceNodeId } : {}),
      ...(input.node.sourceSchemaId ? { sourceSchemaId: input.node.sourceSchemaId } : {}),
      properties: {
        ...branchProperties,
        convertedFrom: createConversionTrace(input.node, sourceKind)
      } satisfies CanvasShapeNode['properties']
    }
  }
}

export function createCanvasMindMapBranchToObjectConversionCommand(
  input: CreateCanvasMindMapBranchToObjectConversionInput
): CanvasMindMapConversionCommand {
  const metadata = getCanvasMindMapMetadata(input.node)
  const sourceKind = getCanvasMindMapConvertibleKind(input.node)
  const errors = [
    ...(metadata ? [] : [`Node ${input.node.id} is not a mind-map branch.`]),
    ...(input.targetKind === 'database-row' && !isNonEmptyString(input.databaseId)
      ? ['A target database id is required for database row conversion.']
      : [])
  ]
  const validation = createValidation(errors)
  if (!validation.valid || sourceKind !== 'mind-map-branch' || !metadata) {
    return {
      kind: 'canvas.mindMap.convert',
      sourceKind: sourceKind ?? 'note',
      targetKind: input.targetKind,
      validation,
      canvasNodeUpdate: null
    }
  }

  const title = getTitle(input.node)
  const sourceSchemaId = getSourceSchemaIdForTarget(input.targetKind)
  const sourceNodeDraft = createSourceNodeDraft(input, title)
  const sourceNodeId = input.sourceNodeId ?? input.node.sourceNodeId

  return {
    kind: 'canvas.mindMap.convert',
    sourceKind,
    targetKind: input.targetKind,
    validation,
    ...(sourceNodeDraft ? { sourceNodeDraft } : {}),
    canvasNodeUpdate: {
      id: input.node.id,
      type: getCanvasObjectKindForTarget(input.targetKind),
      ...(sourceNodeId ? { sourceNodeId } : {}),
      ...(sourceSchemaId ? { sourceSchemaId } : {}),
      properties: {
        title,
        convertedFrom: createConversionTrace(input.node, sourceKind),
        mindMapSource: {
          mapId: metadata.mapId,
          parentId: metadata.parentId,
          depth: metadata.depth,
          index: metadata.index
        }
      }
    }
  }
}
