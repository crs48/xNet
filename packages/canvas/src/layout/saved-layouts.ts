/**
 * Saved canvas layout definitions and deterministic layout planners.
 */

import type { CanvasFrameVariant } from '../frames/frame-variants'
import type { CanvasEdge, CanvasNode, CanvasNodePosition, Point, Rect } from '../types'
import { createCanvasFrameVariantProperties } from '../frames/frame-variants'

export type CanvasSavedLayoutKind =
  | 'grid'
  | 'swimlane'
  | 'kanban'
  | 'timeline'
  | 'dependency-map'
  | 'org-chart'

export type CanvasSavedLayoutDirection = 'RIGHT' | 'DOWN'

export type CanvasSavedLayoutOptions = {
  columns?: number
  columnGap?: number
  rowGap?: number
  padding?: number
  laneField?: string
  lanes?: readonly string[]
  timeField?: string
  parentField?: string
  direction?: CanvasSavedLayoutDirection
}

export type CanvasSavedLayoutDefinition = {
  kind: CanvasSavedLayoutKind
  label: string
  description: string
  layoutHint: string
  frameVariant: CanvasFrameVariant
  defaultOptions: Required<
    Pick<CanvasSavedLayoutOptions, 'columnGap' | 'rowGap' | 'padding' | 'direction'>
  > &
    Pick<CanvasSavedLayoutOptions, 'columns' | 'laneField' | 'lanes' | 'timeField' | 'parentField'>
}

export type CanvasSavedLayoutState = {
  kind: CanvasSavedLayoutKind
  version: 1
  options: CanvasSavedLayoutOptions
}

export type CanvasSavedLayoutPlan = {
  kind: CanvasSavedLayoutKind
  positions: Map<string, CanvasNodePosition>
  lanes: readonly string[]
  bounds: Rect
}

export type CreateCanvasSavedLayoutPlanInput = {
  kind: CanvasSavedLayoutKind
  nodes: readonly CanvasNode[]
  edges?: readonly CanvasEdge[]
  origin?: Point
  options?: CanvasSavedLayoutOptions
}

export const CANVAS_SAVED_LAYOUT_DEFINITIONS = [
  {
    kind: 'grid',
    label: 'Grid',
    description: 'Compact result grid for source-backed cards and mixed planning objects.',
    layoutHint: 'grid',
    frameVariant: 'standard',
    defaultOptions: {
      columns: 4,
      columnGap: 24,
      rowGap: 24,
      padding: 32,
      direction: 'RIGHT'
    }
  },
  {
    kind: 'swimlane',
    label: 'Swimlane',
    description: 'Horizontal lanes grouped by owner, phase, status, or plugin fields.',
    layoutHint: 'swimlane',
    frameVariant: 'swimlane',
    defaultOptions: {
      columnGap: 24,
      rowGap: 32,
      padding: 32,
      laneField: 'lane',
      lanes: ['To do', 'Doing', 'Done'],
      direction: 'RIGHT'
    }
  },
  {
    kind: 'kanban',
    label: 'Kanban',
    description: 'Vertical workflow columns for operational status boards.',
    layoutHint: 'kanban',
    frameVariant: 'kanban',
    defaultOptions: {
      columnGap: 28,
      rowGap: 20,
      padding: 32,
      laneField: 'status',
      lanes: ['Backlog', 'In progress', 'Done'],
      direction: 'DOWN'
    }
  },
  {
    kind: 'timeline',
    label: 'Timeline',
    description: 'Date-ordered planning layout for roadmaps, launches, and milestones.',
    layoutHint: 'timeline',
    frameVariant: 'timeline',
    defaultOptions: {
      columnGap: 36,
      rowGap: 28,
      padding: 32,
      timeField: 'date',
      direction: 'RIGHT'
    }
  },
  {
    kind: 'dependency-map',
    label: 'Dependency Map',
    description: 'Layered dependency layout driven by semantic edges.',
    layoutHint: 'dependency-map',
    frameVariant: 'standard',
    defaultOptions: {
      columnGap: 96,
      rowGap: 36,
      padding: 32,
      direction: 'RIGHT'
    }
  },
  {
    kind: 'org-chart',
    label: 'Org Chart',
    description: 'Top-down hierarchy layout for teams, accounts, systems, or ownership maps.',
    layoutHint: 'org-chart',
    frameVariant: 'standard',
    defaultOptions: {
      columnGap: 40,
      rowGap: 84,
      padding: 32,
      parentField: 'parentId',
      direction: 'DOWN'
    }
  }
] as const satisfies readonly CanvasSavedLayoutDefinition[]

const CANVAS_SAVED_LAYOUT_VALUES = CANVAS_SAVED_LAYOUT_DEFINITIONS.map(
  (definition) => definition.kind
) as readonly CanvasSavedLayoutKind[]

function getDefaultLayoutDefinition(): CanvasSavedLayoutDefinition {
  return CANVAS_SAVED_LAYOUT_DEFINITIONS[0]
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function mergeOptions(
  definition: CanvasSavedLayoutDefinition,
  options: CanvasSavedLayoutOptions = {}
): Required<Pick<CanvasSavedLayoutOptions, 'columnGap' | 'rowGap' | 'padding' | 'direction'>> &
  CanvasSavedLayoutOptions {
  return {
    ...definition.defaultOptions,
    ...options,
    lanes: options.lanes ?? definition.defaultOptions.lanes
  }
}

function preservePosition(node: CanvasNode, x: number, y: number): CanvasNodePosition {
  return {
    ...node.position,
    x,
    y
  }
}

function getNodeFieldValue(node: CanvasNode, field: string | undefined): string | null {
  if (!field) {
    return null
  }

  return normalizeString(node.properties[field])
}

function getLaneValue(node: CanvasNode, laneField: string | undefined): string {
  return (
    getNodeFieldValue(node, laneField) ??
    getNodeFieldValue(node, 'status') ??
    getNodeFieldValue(node, 'lane') ??
    'Unsorted'
  )
}

function getOrderedLanes(
  nodes: readonly CanvasNode[],
  options: CanvasSavedLayoutOptions
): string[] {
  const explicitLanes = [...(options.lanes ?? [])].filter((lane) => lane.trim().length > 0)
  const seen = new Set(explicitLanes)
  const inferred = nodes
    .map((node) => getLaneValue(node, options.laneField))
    .filter((lane) => {
      if (seen.has(lane)) {
        return false
      }
      seen.add(lane)
      return true
    })

  return [...explicitLanes, ...inferred]
}

function calculateBounds(positions: Map<string, CanvasNodePosition>): Rect {
  if (positions.size === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const rects = [...positions.values()]
  const minX = Math.min(...rects.map((position) => position.x))
  const minY = Math.min(...rects.map((position) => position.y))
  const maxX = Math.max(...rects.map((position) => position.x + position.width))
  const maxY = Math.max(...rects.map((position) => position.y + position.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

function createGridPositions(input: {
  nodes: readonly CanvasNode[]
  origin: Point
  options: CanvasSavedLayoutOptions
}): Map<string, CanvasNodePosition> {
  const columns =
    typeof input.options.columns === 'number' && input.options.columns > 0
      ? Math.floor(input.options.columns)
      : Math.max(1, Math.ceil(Math.sqrt(input.nodes.length || 1)))
  const columnGap = input.options.columnGap ?? 24
  const rowGap = input.options.rowGap ?? 24
  const padding = input.options.padding ?? 0
  const positions = new Map<string, CanvasNodePosition>()
  let y = input.origin.y + padding

  for (let rowStart = 0; rowStart < input.nodes.length; rowStart += columns) {
    const row = input.nodes.slice(rowStart, rowStart + columns)
    const rowHeight = Math.max(...row.map((node) => node.position.height))
    let x = input.origin.x + padding

    for (const node of row) {
      positions.set(node.id, preservePosition(node, x, y))
      x += node.position.width + columnGap
    }

    y += rowHeight + rowGap
  }

  return positions
}

function createLanePositions(input: {
  kind: CanvasSavedLayoutKind
  nodes: readonly CanvasNode[]
  origin: Point
  options: CanvasSavedLayoutOptions
}): { positions: Map<string, CanvasNodePosition>; lanes: string[] } {
  const lanes = getOrderedLanes(input.nodes, input.options)
  const laneIndex = new Map(lanes.map((lane, index) => [lane, index]))
  const columnGap = input.options.columnGap ?? 24
  const rowGap = input.options.rowGap ?? 24
  const padding = input.options.padding ?? 0
  const laneOffsets = new Map(lanes.map((lane) => [lane, 0]))
  const laneWidth = Math.max(240, ...input.nodes.map((node) => node.position.width))
  const laneHeight = Math.max(140, ...input.nodes.map((node) => node.position.height))
  const positions = new Map<string, CanvasNodePosition>()

  for (const node of input.nodes) {
    const lane = getLaneValue(node, input.options.laneField)
    const index = laneIndex.get(lane) ?? lanes.length
    const offset = laneOffsets.get(lane) ?? 0

    if (input.kind === 'kanban') {
      positions.set(
        node.id,
        preservePosition(
          node,
          input.origin.x + padding + index * (laneWidth + columnGap),
          input.origin.y + padding + offset
        )
      )
      laneOffsets.set(lane, offset + node.position.height + rowGap)
    } else {
      positions.set(
        node.id,
        preservePosition(
          node,
          input.origin.x + padding + offset,
          input.origin.y + padding + index * (laneHeight + rowGap)
        )
      )
      laneOffsets.set(lane, offset + node.position.width + columnGap)
    }
  }

  return { positions, lanes }
}

function getTimelineTime(node: CanvasNode, timeField: string | undefined): number {
  const value =
    getNodeFieldValue(node, timeField) ??
    getNodeFieldValue(node, 'date') ??
    getNodeFieldValue(node, 'dueDate') ??
    getNodeFieldValue(node, 'startDate')
  const time = value ? Date.parse(value) : NaN

  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER
}

function createTimelinePositions(input: {
  nodes: readonly CanvasNode[]
  origin: Point
  options: CanvasSavedLayoutOptions
}): Map<string, CanvasNodePosition> {
  const columnGap = input.options.columnGap ?? 36
  const rowGap = input.options.rowGap ?? 28
  const padding = input.options.padding ?? 0
  const positions = new Map<string, CanvasNodePosition>()
  const sorted = [...input.nodes].sort(
    (left, right) =>
      getTimelineTime(left, input.options.timeField) -
      getTimelineTime(right, input.options.timeField)
  )
  let x = input.origin.x + padding

  sorted.forEach((node, index) => {
    positions.set(
      node.id,
      preservePosition(
        node,
        x,
        input.origin.y + padding + (index % 2) * (node.position.height + rowGap)
      )
    )
    x += node.position.width + columnGap
  })

  return positions
}

function createDepthMap(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[]
): Map<string, number> {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const outgoing = new Map<string, string[]>()
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]))

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) {
      continue
    }

    outgoing.set(edge.sourceId, [...(outgoing.get(edge.sourceId) ?? []), edge.targetId])
    incomingCount.set(edge.targetId, (incomingCount.get(edge.targetId) ?? 0) + 1)
  }

  const roots = nodes.filter((node) => (incomingCount.get(node.id) ?? 0) === 0)
  const queue = roots.length > 0 ? roots.map((node) => node.id) : nodes.map((node) => node.id)
  const depths = new Map(nodes.map((node) => [node.id, 0]))

  for (const sourceId of queue) {
    const sourceDepth = depths.get(sourceId) ?? 0

    for (const targetId of outgoing.get(sourceId) ?? []) {
      const currentDepth = depths.get(targetId) ?? 0
      const nextDepth = Math.max(depths.get(targetId) ?? 0, sourceDepth + 1)
      if (nextDepth > currentDepth && nextDepth <= nodes.length) {
        depths.set(targetId, nextDepth)
        queue.push(targetId)
      }
    }
  }

  return depths
}

function createLayeredPositions(input: {
  kind: CanvasSavedLayoutKind
  nodes: readonly CanvasNode[]
  edges: readonly CanvasEdge[]
  origin: Point
  options: CanvasSavedLayoutOptions
}): Map<string, CanvasNodePosition> {
  const columnGap = input.options.columnGap ?? 72
  const rowGap = input.options.rowGap ?? 36
  const padding = input.options.padding ?? 0
  const depths = createDepthMap(input.nodes, input.edges)
  const layers = new Map<number, CanvasNode[]>()

  for (const node of input.nodes) {
    const depth = depths.get(node.id) ?? 0
    layers.set(depth, [...(layers.get(depth) ?? []), node])
  }

  const positions = new Map<string, CanvasNodePosition>()
  const sortedLayers = [...layers.entries()].sort(([left], [right]) => left - right)
  const down = input.kind === 'org-chart' || input.options.direction === 'DOWN'

  for (const [depth, layerNodes] of sortedLayers) {
    let alongOffset = down ? input.origin.x + padding : input.origin.y + padding

    for (const node of layerNodes) {
      const x = down
        ? alongOffset
        : input.origin.x + padding + depth * (node.position.width + columnGap)
      const y = down
        ? input.origin.y + padding + depth * (node.position.height + rowGap)
        : alongOffset
      positions.set(node.id, preservePosition(node, x, y))
      alongOffset +=
        (down ? node.position.width : node.position.height) + (down ? columnGap : rowGap)
    }
  }

  return positions
}

export function isCanvasSavedLayoutKind(value: unknown): value is CanvasSavedLayoutKind {
  return CANVAS_SAVED_LAYOUT_VALUES.includes(value as CanvasSavedLayoutKind)
}

export function getCanvasSavedLayoutDefinition(
  kind: CanvasSavedLayoutKind
): CanvasSavedLayoutDefinition {
  return (
    CANVAS_SAVED_LAYOUT_DEFINITIONS.find((definition) => definition.kind === kind) ??
    getDefaultLayoutDefinition()
  )
}

export function createCanvasSavedLayoutState(
  kind: CanvasSavedLayoutKind,
  options: CanvasSavedLayoutOptions = {}
): CanvasSavedLayoutState {
  const definition = getCanvasSavedLayoutDefinition(kind)

  return {
    kind: definition.kind,
    version: 1,
    options: mergeOptions(definition, options)
  }
}

export function createCanvasSavedLayoutFrameProperties(
  kind: CanvasSavedLayoutKind,
  options: CanvasSavedLayoutOptions = {}
): CanvasNode['properties'] {
  const definition = getCanvasSavedLayoutDefinition(kind)
  const state = createCanvasSavedLayoutState(kind, options)

  return createCanvasFrameVariantProperties(definition.frameVariant, {
    title: `${definition.label} frame`,
    layoutHint: definition.layoutHint,
    savedLayout: state,
    lanes: state.options.lanes
  })
}

export function createCanvasSavedLayoutPlan({
  kind,
  nodes,
  edges = [],
  origin = { x: 0, y: 0 },
  options = {}
}: CreateCanvasSavedLayoutPlanInput): CanvasSavedLayoutPlan {
  const definition = getCanvasSavedLayoutDefinition(kind)
  const mergedOptions = mergeOptions(definition, options)
  let lanes: readonly string[] = []
  let positions: Map<string, CanvasNodePosition>

  if (kind === 'swimlane' || kind === 'kanban') {
    const lanePlan = createLanePositions({ kind, nodes, origin, options: mergedOptions })
    lanes = lanePlan.lanes
    positions = lanePlan.positions
  } else if (kind === 'timeline') {
    positions = createTimelinePositions({ nodes, origin, options: mergedOptions })
  } else if (kind === 'dependency-map' || kind === 'org-chart') {
    positions = createLayeredPositions({ kind, nodes, edges, origin, options: mergedOptions })
  } else {
    positions = createGridPositions({ nodes, origin, options: mergedOptions })
  }

  return {
    kind,
    positions,
    lanes,
    bounds: calculateBounds(positions)
  }
}
