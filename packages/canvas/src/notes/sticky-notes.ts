/**
 * Sticky note helpers for fast canvas ideation and promotion.
 */

import type { CanvasViewportSnapshot } from '../ingestion'
import type { CanvasNode, CanvasNodeProperties, CanvasObjectKind, Point, Rect } from '../types'
import { DatabaseRowSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { createSourceBackedCanvasNode } from '../ingestion'

export const CANVAS_STICKY_NOTE_ROLE = 'sticky-note'

export type CanvasStickyNoteColor = 'yellow' | 'blue' | 'green' | 'rose' | 'violet' | 'slate'

export type CanvasStickyNotePromotionTarget = 'page' | 'task' | 'database-row'

export type CanvasStickyNotePromotionDraft = {
  target: CanvasStickyNotePromotionTarget
  canvasKind: Extract<CanvasObjectKind, 'page' | 'note'>
  schemaId: string
  title: string
  body: string
  sourceProperties: CanvasNodeProperties
  canvasProperties: CanvasNodeProperties
}

export type CreateCanvasStickyNotePropertiesInput = {
  title?: string
  body?: string
  color?: CanvasStickyNoteColor
}

export type CreateCanvasStickyNoteNodeInput = CreateCanvasStickyNotePropertiesInput & {
  viewport: CanvasViewportSnapshot
  canvasPoint?: Point | null
  rect?: Partial<Rect>
}

const DEFAULT_STICKY_NOTE_TITLE = 'Sticky note'
const DEFAULT_STICKY_NOTE_RECT = {
  width: 240,
  height: 180
} as const

export const CANVAS_STICKY_NOTE_COLOR_PRESETS: Record<
  CanvasStickyNoteColor,
  {
    fill: string
    stroke: string
    labelColor: string
  }
> = {
  yellow: {
    fill: '#fef3c7',
    stroke: '#d97706',
    labelColor: '#451a03'
  },
  blue: {
    fill: '#e0f2fe',
    stroke: '#0284c7',
    labelColor: '#082f49'
  },
  green: {
    fill: '#dcfce7',
    stroke: '#16a34a',
    labelColor: '#052e16'
  },
  rose: {
    fill: '#ffe4e6',
    stroke: '#e11d48',
    labelColor: '#4c0519'
  },
  violet: {
    fill: '#ede9fe',
    stroke: '#7c3aed',
    labelColor: '#2e1065'
  },
  slate: {
    fill: '#f8fafc',
    stroke: '#475569',
    labelColor: '#0f172a'
  }
}

export function createCanvasStickyNoteProperties({
  title = DEFAULT_STICKY_NOTE_TITLE,
  body = '',
  color = 'yellow'
}: CreateCanvasStickyNotePropertiesInput = {}): CanvasNodeProperties {
  const preset = CANVAS_STICKY_NOTE_COLOR_PRESETS[color]

  return {
    title,
    body,
    label: title,
    stickyNoteRole: CANVAS_STICKY_NOTE_ROLE,
    stickyNoteColor: color,
    fill: preset.fill,
    stroke: preset.stroke,
    labelColor: preset.labelColor
  }
}

export function isCanvasStickyNoteNode(node: CanvasNode): boolean {
  return node.type === 'note' && node.properties.stickyNoteRole === CANVAS_STICKY_NOTE_ROLE
}

export function createCanvasStickyNoteNode(input: CreateCanvasStickyNoteNodeInput): CanvasNode {
  return createSourceBackedCanvasNode({
    objectKind: 'note',
    viewport: input.viewport,
    canvasPoint: input.canvasPoint,
    rect: {
      ...DEFAULT_STICKY_NOTE_RECT,
      ...(input.rect ?? {})
    },
    title: input.title ?? DEFAULT_STICKY_NOTE_TITLE,
    properties: createCanvasStickyNoteProperties(input)
  })
}

function readStickyText(node: CanvasNode, key: 'title' | 'label' | 'body'): string {
  const value = node.properties[key]

  return typeof value === 'string' ? value.trim() : ''
}

function getStickyTitle(node: CanvasNode): string {
  return readStickyText(node, 'title') || readStickyText(node, 'label') || DEFAULT_STICKY_NOTE_TITLE
}

function getStickyBody(node: CanvasNode): string {
  return readStickyText(node, 'body')
}

function getPromotionSchemaId(target: CanvasStickyNotePromotionTarget): string {
  switch (target) {
    case 'page':
      return PageSchema._schemaId
    case 'task':
      return TaskSchema._schemaId
    case 'database-row':
      return DatabaseRowSchema._schemaId
  }
}

function getPromotionCanvasKind(
  target: CanvasStickyNotePromotionTarget
): Extract<CanvasObjectKind, 'page' | 'note'> {
  return target === 'page' ? 'page' : 'note'
}

function createPromotionSourceProperties(
  node: CanvasNode,
  target: CanvasStickyNotePromotionTarget
): CanvasNodeProperties {
  const title = getStickyTitle(node)
  const body = getStickyBody(node)
  const base = {
    title,
    body,
    promotedFromCanvasObjectId: node.id,
    promotedFrom: 'canvas-sticky-note',
    source: 'canvas'
  }

  switch (target) {
    case 'page':
      return base
    case 'task':
      return {
        ...base,
        completed: false,
        status: 'todo',
        priority: 'medium'
      }
    case 'database-row':
      return {
        ...base,
        sortKey: `canvas:${node.id}`,
        cell_title: title,
        cell_notes: body
      }
  }
}

export function createCanvasStickyNotePromotionDraft(
  node: CanvasNode,
  target: CanvasStickyNotePromotionTarget
): CanvasStickyNotePromotionDraft {
  const title = getStickyTitle(node)
  const body = getStickyBody(node)
  const schemaId = getPromotionSchemaId(target)
  const sourceProperties = createPromotionSourceProperties(node, target)

  return {
    target,
    canvasKind: getPromotionCanvasKind(target),
    schemaId,
    title,
    body,
    sourceProperties,
    canvasProperties: {
      ...node.properties,
      ...sourceProperties,
      title,
      body,
      stickyNotePromotionTarget: target,
      stickyNotePromoted: true,
      sourceSchemaId: schemaId,
      sourceDisplayKind: target
    }
  }
}

export function promoteCanvasStickyNoteNode(
  node: CanvasNode,
  target: CanvasStickyNotePromotionTarget
): CanvasNode {
  const draft = createCanvasStickyNotePromotionDraft(node, target)

  return {
    ...node,
    type: draft.canvasKind,
    sourceSchemaId: draft.schemaId,
    properties: draft.canvasProperties
  }
}
