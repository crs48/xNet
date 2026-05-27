/**
 * Canvas frame variant helpers.
 */

import type { CanvasViewportSnapshot } from '../ingestion'
import type { CanvasNode, CanvasNodeProperties, Point, Rect } from '../types'
import { createCanvasPrimitiveNode } from '../ingestion'
import { getCanvasContainerMemberIds, getCanvasContainerRole } from '../selection/scene-operations'

export type CanvasFrameVariant =
  | 'standard'
  | 'presentation'
  | 'query'
  | 'swimlane'
  | 'kanban'
  | 'timeline'

export type CanvasFrameLaneAxis = 'horizontal' | 'vertical'

export type CanvasFrameVariantProperties = CanvasNodeProperties & {
  title?: string
  containerRole: 'frame'
  frameVariant: CanvasFrameVariant
  frameIntent: 'freeform' | 'presentation' | 'query' | 'swimlane' | 'kanban' | 'timeline'
  memberIds: string[]
  memberCount: number
  layoutHint?: string
  exportRole?: 'slide'
  aspectRatio?: '16:9'
  queryMode?: 'saved-query'
  queryText?: string
  laneAxis?: CanvasFrameLaneAxis
  lanes?: readonly string[]
  swimlaneGrouping?: 'lane'
  columnLimit?: number
  timeScale?: 'week' | 'month' | 'quarter'
}

export type CanvasFrameVariantDefinition = {
  variant: CanvasFrameVariant
  label: string
  description: string
  defaultTitle: string
  defaultSize: Pick<Rect, 'width' | 'height'>
  properties: Omit<CanvasFrameVariantProperties, 'title' | 'memberIds' | 'memberCount'>
}

export type CanvasFrameVariantNodeInput = {
  variant?: CanvasFrameVariant
  viewport: CanvasViewportSnapshot
  title?: string
  canvasPoint?: Point | null
  spreadIndex?: number
  properties?: CanvasNodeProperties
}

export const CANVAS_FRAME_VARIANT_DEFINITIONS = [
  {
    variant: 'standard',
    label: 'Standard',
    description: 'Loose planning frame for any cluster of canvas objects.',
    defaultTitle: 'Frame',
    defaultSize: { width: 640, height: 420 },
    properties: {
      containerRole: 'frame',
      frameVariant: 'standard',
      frameIntent: 'freeform',
      layoutHint: 'freeform'
    }
  },
  {
    variant: 'presentation',
    label: 'Presentation',
    description: 'Slide-sized frame for walkthroughs, exports, and narrative planning.',
    defaultTitle: 'Slide frame',
    defaultSize: { width: 960, height: 540 },
    properties: {
      containerRole: 'frame',
      frameVariant: 'presentation',
      frameIntent: 'presentation',
      exportRole: 'slide',
      aspectRatio: '16:9',
      layoutHint: 'deck'
    }
  },
  {
    variant: 'query',
    label: 'Query',
    description: 'Saved-query frame for live result sets and operational views.',
    defaultTitle: 'Query frame',
    defaultSize: { width: 720, height: 420 },
    properties: {
      containerRole: 'frame',
      frameVariant: 'query',
      frameIntent: 'query',
      queryMode: 'saved-query',
      queryText: '',
      layoutHint: 'results'
    }
  },
  {
    variant: 'swimlane',
    label: 'Swimlane',
    description: 'Horizontal lanes for ownership, phase, or status planning.',
    defaultTitle: 'Swimlane frame',
    defaultSize: { width: 860, height: 500 },
    properties: {
      containerRole: 'frame',
      frameVariant: 'swimlane',
      frameIntent: 'swimlane',
      laneAxis: 'horizontal',
      lanes: ['To do', 'Doing', 'Done'],
      swimlaneGrouping: 'lane',
      layoutHint: 'swimlane'
    }
  },
  {
    variant: 'kanban',
    label: 'Kanban',
    description: 'Vertical workflow columns for backlog and delivery planning.',
    defaultTitle: 'Kanban frame',
    defaultSize: { width: 860, height: 500 },
    properties: {
      containerRole: 'frame',
      frameVariant: 'kanban',
      frameIntent: 'kanban',
      laneAxis: 'vertical',
      lanes: ['Backlog', 'In progress', 'Done'],
      columnLimit: 8,
      layoutHint: 'kanban'
    }
  },
  {
    variant: 'timeline',
    label: 'Timeline',
    description: 'Time-oriented frame for roadmap, launch, and dependency planning.',
    defaultTitle: 'Timeline frame',
    defaultSize: { width: 920, height: 360 },
    properties: {
      containerRole: 'frame',
      frameVariant: 'timeline',
      frameIntent: 'timeline',
      timeScale: 'month',
      lanes: ['Now', 'Next', 'Later'],
      layoutHint: 'timeline'
    }
  }
] as const satisfies readonly CanvasFrameVariantDefinition[]

const CANVAS_FRAME_VARIANT_VALUES = CANVAS_FRAME_VARIANT_DEFINITIONS.map(
  (definition) => definition.variant
) as readonly CanvasFrameVariant[]

const CANVAS_FRAME_VARIANT_INTENTS: Record<
  CanvasFrameVariant,
  CanvasFrameVariantProperties['frameIntent']
> = {
  standard: 'freeform',
  presentation: 'presentation',
  query: 'query',
  swimlane: 'swimlane',
  kanban: 'kanban',
  timeline: 'timeline'
}

const FRAME_VARIANT_PROPERTY_KEYS = new Set([
  'frameVariant',
  'frameIntent',
  'layoutHint',
  'exportRole',
  'aspectRatio',
  'queryMode',
  'queryText',
  'queryDefinition',
  'queryResultSummary',
  'savedLayout',
  'laneAxis',
  'lanes',
  'swimlaneGrouping',
  'columnLimit',
  'timeScale'
])

function readNonEmptyTitle(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function omitFrameVariantProperties(properties: CanvasNodeProperties): CanvasNodeProperties {
  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => !FRAME_VARIANT_PROPERTY_KEYS.has(key))
  )
}

export function isCanvasFrameVariant(value: unknown): value is CanvasFrameVariant {
  return CANVAS_FRAME_VARIANT_VALUES.includes(value as CanvasFrameVariant)
}

export function getCanvasFrameVariantDefinition(
  variant: CanvasFrameVariant
): CanvasFrameVariantDefinition {
  return (
    CANVAS_FRAME_VARIANT_DEFINITIONS.find((definition) => definition.variant === variant) ??
    CANVAS_FRAME_VARIANT_DEFINITIONS[0]
  )
}

export function getCanvasFrameVariant(node: CanvasNode): CanvasFrameVariant {
  return isCanvasFrameVariant(node.properties.frameVariant)
    ? node.properties.frameVariant
    : 'standard'
}

export function createCanvasFrameVariantProperties(
  variant: CanvasFrameVariant = 'standard',
  overrides: CanvasNodeProperties = {}
): CanvasFrameVariantProperties {
  const definition = getCanvasFrameVariantDefinition(variant)
  const memberIds = readStringArray(overrides.memberIds)
  const memberCount =
    typeof overrides.memberCount === 'number' && Number.isFinite(overrides.memberCount)
      ? overrides.memberCount
      : memberIds.length

  return {
    ...definition.properties,
    ...overrides,
    title: readNonEmptyTitle(overrides.title) ?? definition.defaultTitle,
    containerRole: 'frame',
    frameVariant: definition.variant,
    frameIntent: CANVAS_FRAME_VARIANT_INTENTS[definition.variant],
    memberIds,
    memberCount
  }
}

export function applyCanvasFrameVariant(
  node: CanvasNode,
  variant: CanvasFrameVariant = 'standard'
): CanvasNode {
  const definition = getCanvasFrameVariantDefinition(variant)
  const memberIds = getCanvasContainerMemberIds(node)
  const title = readNonEmptyTitle(node.properties.title) ?? definition.defaultTitle
  const baseProperties = omitFrameVariantProperties(node.properties)

  return {
    ...node,
    properties: {
      ...baseProperties,
      ...createCanvasFrameVariantProperties(variant, {
        title,
        memberIds,
        memberCount: memberIds.length
      })
    }
  }
}

export function isCanvasFrameVariantNode(node: CanvasNode): boolean {
  return getCanvasContainerRole(node) === 'frame'
}

export function createCanvasFrameVariantNode(input: CanvasFrameVariantNodeInput): CanvasNode {
  const variant = input.variant ?? 'standard'
  const definition = getCanvasFrameVariantDefinition(variant)
  const title = input.title ?? definition.defaultTitle

  return createCanvasPrimitiveNode({
    objectKind: 'group',
    viewport: input.viewport,
    title,
    canvasPoint: input.canvasPoint,
    spreadIndex: input.spreadIndex,
    rect: definition.defaultSize,
    properties: createCanvasFrameVariantProperties(variant, {
      ...(input.properties ?? {}),
      title
    })
  })
}
