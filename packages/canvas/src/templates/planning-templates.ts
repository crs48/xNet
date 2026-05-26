/**
 * Built-in planning templates for the infinite canvas.
 */

import type { CanvasViewportSnapshot } from '../ingestion'
import type { CanvasEdge, CanvasNode, CanvasNodeProperties, Point, Rect } from '../types'
import { createCanvasEdgeRelationship } from '../edges/relationships'
import {
  createCanvasFrameVariantProperties,
  type CanvasFrameVariant
} from '../frames/frame-variants'
import { createCanvasStickyNoteProperties, type CanvasStickyNoteColor } from '../notes/sticky-notes'
import { createEdge, createNode } from '../store'

export type CanvasPlanningTemplateId =
  | 'research-synthesis'
  | 'product-roadmap'
  | 'incident-review'
  | 'planning-board'

export type CanvasPlanningTemplateCategory = 'research' | 'product' | 'operations' | 'planning'

export type CanvasPlanningTemplateDefinition = {
  id: CanvasPlanningTemplateId
  name: string
  description: string
  category: CanvasPlanningTemplateCategory
  defaultSize: Pick<Rect, 'width' | 'height'>
  rootLocalId: string
}

export type CanvasPlanningTemplateInstance = {
  templateId: CanvasPlanningTemplateId
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  rootNodeId: string
  bounds: Rect
}

export type CreateCanvasPlanningTemplateInstanceInput = {
  templateId: CanvasPlanningTemplateId
  viewport: CanvasViewportSnapshot
  canvasPoint?: Point | null
  idPrefix?: string
}

type TemplateNodeBase = {
  localId: string
  title: string
  rect: Rect
  properties?: CanvasNodeProperties
}

type TemplateFrameNode = TemplateNodeBase & {
  type: 'frame'
  variant: CanvasFrameVariant
  memberLocalIds?: string[]
}

type TemplateStickyNode = TemplateNodeBase & {
  type: 'sticky'
  color: CanvasStickyNoteColor
  body?: string
}

type TemplateShapeNode = TemplateNodeBase & {
  type: 'shape'
  shapeType?: CanvasNodeProperties['shapeType']
}

type TemplateNode = TemplateFrameNode | TemplateStickyNode | TemplateShapeNode

type TemplateEdge = {
  from: string
  to: string
  label?: string
}

type TemplateBlueprint = CanvasPlanningTemplateDefinition & {
  nodes: readonly TemplateNode[]
  edges: readonly TemplateEdge[]
}

export const CANVAS_PLANNING_TEMPLATE_DEFINITIONS = [
  {
    id: 'research-synthesis',
    name: 'Research Synthesis',
    description: 'Cluster evidence, insights, opportunities, and decisions from research work.',
    category: 'research',
    defaultSize: { width: 1040, height: 640 },
    rootLocalId: 'frame'
  },
  {
    id: 'product-roadmap',
    name: 'Product Roadmap',
    description: 'Organize now, next, later work with outcomes and dependency prompts.',
    category: 'product',
    defaultSize: { width: 1160, height: 560 },
    rootLocalId: 'timeline'
  },
  {
    id: 'incident-review',
    name: 'Incident Review',
    description: 'Capture timeline, impact, root cause, actions, and owners after an incident.',
    category: 'operations',
    defaultSize: { width: 1120, height: 620 },
    rootLocalId: 'frame'
  },
  {
    id: 'planning-board',
    name: 'Planning Board',
    description: 'Start a kanban-style planning surface with goals, blockers, and decisions.',
    category: 'planning',
    defaultSize: { width: 1120, height: 640 },
    rootLocalId: 'kanban'
  }
] as const satisfies readonly CanvasPlanningTemplateDefinition[]

const TEMPLATE_BLUEPRINTS = [
  {
    ...CANVAS_PLANNING_TEMPLATE_DEFINITIONS[0],
    nodes: [
      {
        localId: 'frame',
        type: 'frame',
        variant: 'standard',
        title: 'Research Synthesis',
        rect: { x: 0, y: 0, width: 1040, height: 640 },
        memberLocalIds: ['evidence', 'insights', 'opportunities', 'decisions']
      },
      {
        localId: 'evidence',
        type: 'sticky',
        color: 'blue',
        title: 'Evidence',
        body: 'Quotes, observations, analytics, and links.',
        rect: { x: 80, y: 96, width: 240, height: 180 }
      },
      {
        localId: 'insights',
        type: 'sticky',
        color: 'yellow',
        title: 'Insights',
        body: 'Patterns that explain the customer or system behavior.',
        rect: { x: 400, y: 96, width: 240, height: 180 }
      },
      {
        localId: 'opportunities',
        type: 'sticky',
        color: 'green',
        title: 'Opportunities',
        body: 'Ideas worth turning into product bets.',
        rect: { x: 720, y: 96, width: 240, height: 180 }
      },
      {
        localId: 'decisions',
        type: 'sticky',
        color: 'violet',
        title: 'Decisions',
        body: 'What the team will do next and why.',
        rect: { x: 400, y: 360, width: 240, height: 180 }
      }
    ],
    edges: [
      { from: 'evidence', to: 'insights', label: 'Synthesize' },
      { from: 'insights', to: 'opportunities', label: 'Frame' },
      { from: 'opportunities', to: 'decisions', label: 'Choose' }
    ]
  },
  {
    ...CANVAS_PLANNING_TEMPLATE_DEFINITIONS[1],
    nodes: [
      {
        localId: 'timeline',
        type: 'frame',
        variant: 'timeline',
        title: 'Product Roadmap',
        rect: { x: 0, y: 0, width: 1160, height: 560 },
        memberLocalIds: ['now', 'next', 'later', 'risks']
      },
      {
        localId: 'now',
        type: 'sticky',
        color: 'green',
        title: 'Now',
        body: 'Committed outcomes for the current cycle.',
        rect: { x: 96, y: 150, width: 220, height: 150 }
      },
      {
        localId: 'next',
        type: 'sticky',
        color: 'blue',
        title: 'Next',
        body: 'Strong candidates after current work lands.',
        rect: { x: 420, y: 150, width: 220, height: 150 }
      },
      {
        localId: 'later',
        type: 'sticky',
        color: 'slate',
        title: 'Later',
        body: 'Important bets that need more proof.',
        rect: { x: 744, y: 150, width: 220, height: 150 }
      },
      {
        localId: 'risks',
        type: 'sticky',
        color: 'rose',
        title: 'Risks and dependencies',
        body: 'Unknowns, sequencing constraints, and owners.',
        rect: { x: 420, y: 360, width: 260, height: 140 }
      }
    ],
    edges: [
      { from: 'now', to: 'next', label: 'Feeds' },
      { from: 'next', to: 'later', label: 'Sequenced' },
      { from: 'risks', to: 'next', label: 'Constrains' }
    ]
  },
  {
    ...CANVAS_PLANNING_TEMPLATE_DEFINITIONS[2],
    nodes: [
      {
        localId: 'frame',
        type: 'frame',
        variant: 'swimlane',
        title: 'Incident Review',
        rect: { x: 0, y: 0, width: 1120, height: 620 },
        memberLocalIds: ['timeline', 'impact', 'root-cause', 'actions', 'owners']
      },
      {
        localId: 'timeline',
        type: 'sticky',
        color: 'blue',
        title: 'Timeline',
        body: 'What happened, in order, with timestamps.',
        rect: { x: 84, y: 92, width: 240, height: 150 }
      },
      {
        localId: 'impact',
        type: 'sticky',
        color: 'rose',
        title: 'Impact',
        body: 'Customers, systems, duration, and severity.',
        rect: { x: 428, y: 92, width: 240, height: 150 }
      },
      {
        localId: 'root-cause',
        type: 'sticky',
        color: 'yellow',
        title: 'Root cause',
        body: 'The smallest explanation that still changes behavior.',
        rect: { x: 772, y: 92, width: 240, height: 150 }
      },
      {
        localId: 'actions',
        type: 'sticky',
        color: 'green',
        title: 'Corrective actions',
        body: 'Concrete changes with owners and due dates.',
        rect: { x: 260, y: 360, width: 260, height: 150 }
      },
      {
        localId: 'owners',
        type: 'sticky',
        color: 'violet',
        title: 'Owners',
        body: 'Who will close the loop and communicate status.',
        rect: { x: 600, y: 360, width: 260, height: 150 }
      }
    ],
    edges: [
      { from: 'timeline', to: 'root-cause', label: 'Explains' },
      { from: 'impact', to: 'actions', label: 'Prioritizes' },
      { from: 'actions', to: 'owners', label: 'Assigned' }
    ]
  },
  {
    ...CANVAS_PLANNING_TEMPLATE_DEFINITIONS[3],
    nodes: [
      {
        localId: 'kanban',
        type: 'frame',
        variant: 'kanban',
        title: 'Planning Board',
        rect: { x: 0, y: 0, width: 1120, height: 640 },
        memberLocalIds: ['goals', 'backlog', 'doing', 'done', 'blockers', 'decisions']
      },
      {
        localId: 'goals',
        type: 'sticky',
        color: 'green',
        title: 'Goals',
        body: 'The outcomes this board is optimizing for.',
        rect: { x: 70, y: 90, width: 220, height: 140 }
      },
      {
        localId: 'backlog',
        type: 'sticky',
        color: 'slate',
        title: 'Backlog',
        body: 'Candidates not yet committed.',
        rect: { x: 330, y: 90, width: 220, height: 140 }
      },
      {
        localId: 'doing',
        type: 'sticky',
        color: 'blue',
        title: 'Doing',
        body: 'Active work and in-flight decisions.',
        rect: { x: 590, y: 90, width: 220, height: 140 }
      },
      {
        localId: 'done',
        type: 'sticky',
        color: 'yellow',
        title: 'Done',
        body: 'Closed work and shipped outcomes.',
        rect: { x: 850, y: 90, width: 220, height: 140 }
      },
      {
        localId: 'blockers',
        type: 'sticky',
        color: 'rose',
        title: 'Blockers',
        body: 'Risks and dependencies to unblock.',
        rect: { x: 330, y: 390, width: 260, height: 150 }
      },
      {
        localId: 'decisions',
        type: 'sticky',
        color: 'violet',
        title: 'Decisions',
        body: 'Agreements that changed the plan.',
        rect: { x: 650, y: 390, width: 260, height: 150 }
      }
    ],
    edges: [
      { from: 'goals', to: 'backlog', label: 'Scopes' },
      { from: 'backlog', to: 'doing', label: 'Pull' },
      { from: 'doing', to: 'done', label: 'Ship' },
      { from: 'blockers', to: 'decisions', label: 'Resolve' }
    ]
  }
] as const satisfies readonly TemplateBlueprint[]

const TEMPLATE_BY_ID = new Map<CanvasPlanningTemplateId, TemplateBlueprint>(
  TEMPLATE_BLUEPRINTS.map((template) => [template.id, template])
)

function resolveTemplateId(value: CanvasPlanningTemplateId): TemplateBlueprint {
  const template = TEMPLATE_BY_ID.get(value)
  if (!template) {
    return TEMPLATE_BLUEPRINTS[0]
  }

  return template
}

function createInstanceId(input: {
  idPrefix?: string
  templateId: CanvasPlanningTemplateId
  localId: string
}): string {
  return input.idPrefix
    ? `${input.idPrefix}-${input.localId}`
    : `canvas-template-${input.templateId}-${input.localId}-${crypto.randomUUID()}`
}

function offsetRect(rect: Rect, origin: Point): Rect {
  return {
    x: Math.round(origin.x + rect.x),
    y: Math.round(origin.y + rect.y),
    width: rect.width,
    height: rect.height
  }
}

function createTemplateNode(input: {
  node: TemplateNode
  id: string
  origin: Point
  localToId: ReadonlyMap<string, string>
}): CanvasNode {
  const baseRect = offsetRect(input.node.rect, input.origin)

  if (input.node.type === 'frame') {
    const memberIds = (input.node.memberLocalIds ?? [])
      .map((localId) => input.localToId.get(localId))
      .filter((id): id is string => typeof id === 'string')

    return createNode('group', baseRect, {
      ...createCanvasFrameVariantProperties(input.node.variant, {
        title: input.node.title,
        memberIds,
        memberCount: memberIds.length,
        ...input.node.properties
      })
    })
  }

  if (input.node.type === 'sticky') {
    return createNode('note', baseRect, {
      ...createCanvasStickyNoteProperties({
        title: input.node.title,
        body: input.node.body,
        color: input.node.color
      }),
      ...input.node.properties
    })
  }

  return createNode('shape', baseRect, {
    title: input.node.title,
    label: input.node.title,
    shapeType: input.node.shapeType ?? 'rounded-rectangle',
    ...input.node.properties
  })
}

function createTemplateEdge(input: {
  edge: TemplateEdge
  idPrefix?: string
  index: number
  localToId: ReadonlyMap<string, string>
}): CanvasEdge | null {
  const sourceId = input.localToId.get(input.edge.from)
  const targetId = input.localToId.get(input.edge.to)
  if (!sourceId || !targetId) {
    return null
  }

  return {
    ...createEdge(sourceId, targetId),
    id: input.idPrefix
      ? `${input.idPrefix}-edge-${input.index}`
      : `canvas-template-edge-${crypto.randomUUID()}`,
    relationship: createCanvasEdgeRelationship({
      kind: 'references',
      label: input.edge.label
    })
  }
}

export function getCanvasPlanningTemplateDefinition(
  templateId: CanvasPlanningTemplateId
): CanvasPlanningTemplateDefinition {
  const template = resolveTemplateId(templateId)

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    defaultSize: template.defaultSize,
    rootLocalId: template.rootLocalId
  }
}

export function createCanvasPlanningTemplateInstance(
  input: CreateCanvasPlanningTemplateInstanceInput
): CanvasPlanningTemplateInstance {
  const template = resolveTemplateId(input.templateId)
  const center = input.canvasPoint ?? input.viewport
  const origin = {
    x: Math.round(center.x - template.defaultSize.width / 2),
    y: Math.round(center.y - template.defaultSize.height / 2)
  }
  const localToId = new Map(
    template.nodes.map((node) => [
      node.localId,
      createInstanceId({
        idPrefix: input.idPrefix,
        templateId: template.id,
        localId: node.localId
      })
    ])
  )
  const nodes = template.nodes.map((node) => {
    const id = localToId.get(node.localId) ?? node.localId

    return {
      ...createTemplateNode({ node, id, origin, localToId }),
      id
    }
  })
  const edges = template.edges
    .map((edge, index) =>
      createTemplateEdge({
        edge,
        idPrefix: input.idPrefix,
        index,
        localToId
      })
    )
    .filter((edge): edge is CanvasEdge => edge !== null)
  const rootNodeId = localToId.get(template.rootLocalId) ?? nodes[0]?.id ?? ''

  return {
    templateId: template.id,
    nodes,
    edges,
    rootNodeId,
    bounds: {
      x: origin.x,
      y: origin.y,
      width: template.defaultSize.width,
      height: template.defaultSize.height
    }
  }
}
