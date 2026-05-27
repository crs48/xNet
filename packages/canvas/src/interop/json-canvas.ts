/**
 * JSON Canvas 1.0 import/export helpers.
 */

import type {
  CanvasEdge,
  CanvasEdgeRelationship,
  CanvasNode,
  CanvasNodePosition,
  CanvasNodeType,
  CanvasObjectAnchorPlacement,
  CanvasSceneNodeKind,
  EdgeStyle
} from '../types'
import { createCanvasEdgeEndpoint } from '../edges/bindings'

export type JsonCanvasNodeType = 'text' | 'file' | 'link' | 'group'

export type JsonCanvasSide = 'top' | 'right' | 'bottom' | 'left'

export type JsonCanvasEdgeEnd = 'none' | 'arrow'

export type JsonCanvasNodeBase = {
  readonly id: string
  readonly type: JsonCanvasNodeType
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly color?: string
  readonly xnet?: JsonCanvasXNetNodeMetadata
}

export type JsonCanvasTextNode = JsonCanvasNodeBase & {
  readonly type: 'text'
  readonly text: string
}

export type JsonCanvasFileNode = JsonCanvasNodeBase & {
  readonly type: 'file'
  readonly file: string
}

export type JsonCanvasLinkNode = JsonCanvasNodeBase & {
  readonly type: 'link'
  readonly url: string
}

export type JsonCanvasGroupNode = JsonCanvasNodeBase & {
  readonly type: 'group'
  readonly label?: string
}

export type JsonCanvasNode =
  | JsonCanvasTextNode
  | JsonCanvasFileNode
  | JsonCanvasLinkNode
  | JsonCanvasGroupNode

export type JsonCanvasEdge = {
  readonly id: string
  readonly fromNode: string
  readonly fromSide?: JsonCanvasSide
  readonly fromEnd?: JsonCanvasEdgeEnd
  readonly toNode: string
  readonly toSide?: JsonCanvasSide
  readonly toEnd?: JsonCanvasEdgeEnd
  readonly color?: string
  readonly label?: string
  readonly xnet?: JsonCanvasXNetEdgeMetadata
}

export type JsonCanvasDocument = {
  readonly nodes: readonly JsonCanvasNode[]
  readonly edges?: readonly JsonCanvasEdge[]
}

export type JsonCanvasXNetNodeMetadata = {
  readonly kind?: CanvasSceneNodeKind | CanvasNodeType
  readonly sourceNodeId?: string
  readonly sourceSchemaId?: string
  readonly alias?: string
  readonly locked?: boolean
  readonly display?: CanvasNode['display']
  readonly properties?: Record<string, unknown>
}

export type JsonCanvasXNetEdgeMetadata = {
  readonly relationship?: CanvasEdgeRelationship
  readonly style?: EdgeStyle
}

export type ExportCanvasToJsonCanvasInput = {
  readonly nodes: readonly CanvasNode[]
  readonly edges?: readonly CanvasEdge[]
  readonly includeXNetMetadata?: boolean
}

export type ImportCanvasFromJsonCanvasResult = {
  readonly nodes: readonly CanvasNode[]
  readonly edges: readonly CanvasEdge[]
  readonly warnings: readonly string[]
}

const JSON_CANVAS_NODE_TYPES = new Set<JsonCanvasNodeType>(['text', 'file', 'link', 'group'])
const JSON_CANVAS_SIDES = new Set<JsonCanvasSide>(['top', 'right', 'bottom', 'left'])
const CANVAS_SCENE_NODE_KINDS = new Set<CanvasSceneNodeKind>([
  'page',
  'database',
  'external-reference',
  'media',
  'shape',
  'note',
  'group'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readPosition(node: JsonCanvasNode): CanvasNodePosition {
  return {
    x: readFiniteNumber(node.x, 0),
    y: readFiniteNumber(node.y, 0),
    width: Math.max(1, readFiniteNumber(node.width, 240)),
    height: Math.max(1, readFiniteNumber(node.height, 160)),
    zIndex: 0
  }
}

function getNodeTitle(node: CanvasNode): string {
  return (
    node.alias ??
    readString(node.properties.title) ??
    readString(node.properties.name) ??
    readString(node.properties.url) ??
    node.id
  )
}

function getOptionalColor(node: CanvasNode): string | undefined {
  return readString(node.properties.color) ?? readString(node.properties.fill)
}

function getOptionalText(node: CanvasNode): string | undefined {
  return readString(node.properties.text) ?? readString(node.properties.content)
}

function getOptionalUrl(node: CanvasNode): string | undefined {
  return readString(node.properties.url) ?? readString(node.properties.embedUrl)
}

function getOptionalFile(node: CanvasNode): string | undefined {
  return (
    readString(node.properties.file) ??
    readString(node.properties.filePath) ??
    readString(node.properties.path) ??
    readString(node.properties.blobPath)
  )
}

function createXNetNodeMetadata(node: CanvasNode): JsonCanvasXNetNodeMetadata {
  return {
    kind: node.type,
    ...(node.sourceNodeId ? { sourceNodeId: node.sourceNodeId } : {}),
    ...(node.sourceSchemaId ? { sourceSchemaId: node.sourceSchemaId } : {}),
    ...(node.alias ? { alias: node.alias } : {}),
    ...(node.locked !== undefined ? { locked: node.locked } : {}),
    ...(node.display ? { display: node.display } : {}),
    properties: node.properties
  }
}

function createJsonCanvasBaseNode<T extends JsonCanvasNodeType>(
  node: CanvasNode,
  type: T,
  includeXNetMetadata: boolean
): JsonCanvasNodeBase & { readonly type: T } {
  return {
    id: node.id,
    type,
    x: node.position.x,
    y: node.position.y,
    width: node.position.width,
    height: node.position.height,
    ...(getOptionalColor(node) ? { color: getOptionalColor(node) } : {}),
    ...(includeXNetMetadata ? { xnet: createXNetNodeMetadata(node) } : {})
  }
}

function exportNodeToJsonCanvas(node: CanvasNode, includeXNetMetadata: boolean): JsonCanvasNode {
  if (node.type === 'group') {
    return {
      ...createJsonCanvasBaseNode(node, 'group', includeXNetMetadata),
      label: getNodeTitle(node)
    }
  }

  if (node.type === 'external-reference') {
    const url = getOptionalUrl(node)
    if (url) {
      return {
        ...createJsonCanvasBaseNode(node, 'link', includeXNetMetadata),
        url
      }
    }
  }

  if (node.type === 'media') {
    const file = getOptionalFile(node)
    if (file) {
      return {
        ...createJsonCanvasBaseNode(node, 'file', includeXNetMetadata),
        file
      }
    }

    const url = getOptionalUrl(node)
    if (url) {
      return {
        ...createJsonCanvasBaseNode(node, 'link', includeXNetMetadata),
        url
      }
    }
  }

  return {
    ...createJsonCanvasBaseNode(node, 'text', includeXNetMetadata),
    text: [getNodeTitle(node), readString(node.properties.subtitle), getOptionalText(node)]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join('\n')
  }
}

function isJsonCanvasSide(value: unknown): value is JsonCanvasSide {
  return typeof value === 'string' && JSON_CANVAS_SIDES.has(value as JsonCanvasSide)
}

function getJsonCanvasSide(
  placement: CanvasObjectAnchorPlacement | undefined
): JsonCanvasSide | undefined {
  return isJsonCanvasSide(placement) ? placement : undefined
}

function getJsonCanvasEnd(
  marker: EdgeStyle['markerStart'] | EdgeStyle['markerEnd']
): JsonCanvasEdgeEnd | undefined {
  if (marker === 'arrow') {
    return 'arrow'
  }

  return marker === 'none' ? 'none' : undefined
}

function createXNetEdgeMetadata(edge: CanvasEdge): JsonCanvasXNetEdgeMetadata | undefined {
  if (!edge.relationship && !edge.style) {
    return undefined
  }

  return {
    ...(edge.relationship ? { relationship: edge.relationship } : {}),
    ...(edge.style ? { style: edge.style } : {})
  }
}

function exportEdgeToJsonCanvas(edge: CanvasEdge, includeXNetMetadata: boolean): JsonCanvasEdge {
  const metadata = includeXNetMetadata ? createXNetEdgeMetadata(edge) : undefined

  return {
    id: edge.id,
    fromNode: edge.source?.objectId ?? edge.sourceId,
    ...(getJsonCanvasSide(edge.source?.placement)
      ? { fromSide: getJsonCanvasSide(edge.source?.placement) }
      : {}),
    ...(getJsonCanvasEnd(edge.style?.markerStart)
      ? { fromEnd: getJsonCanvasEnd(edge.style?.markerStart) }
      : {}),
    toNode: edge.target?.objectId ?? edge.targetId,
    ...(getJsonCanvasSide(edge.target?.placement)
      ? { toSide: getJsonCanvasSide(edge.target?.placement) }
      : {}),
    ...(getJsonCanvasEnd(edge.style?.markerEnd)
      ? { toEnd: getJsonCanvasEnd(edge.style?.markerEnd) }
      : {}),
    ...(edge.style?.stroke ? { color: edge.style.stroke } : {}),
    ...((edge.label ?? edge.relationship?.label)
      ? { label: edge.label ?? edge.relationship?.label }
      : {}),
    ...(metadata ? { xnet: metadata } : {})
  }
}

function compareNodesForExport(left: CanvasNode, right: CanvasNode): number {
  return (
    (left.position.zIndex ?? 0) - (right.position.zIndex ?? 0) || left.id.localeCompare(right.id)
  )
}

export function exportCanvasToJsonCanvas(input: ExportCanvasToJsonCanvasInput): JsonCanvasDocument {
  const includeXNetMetadata = input.includeXNetMetadata ?? true
  const nodes = [...input.nodes]
    .sort(compareNodesForExport)
    .map((node) => exportNodeToJsonCanvas(node, includeXNetMetadata))
  const edges = [...(input.edges ?? [])]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((edge) => exportEdgeToJsonCanvas(edge, includeXNetMetadata))

  return edges.length > 0 ? { nodes, edges } : { nodes }
}

function readXNetProperties(
  metadata: JsonCanvasXNetNodeMetadata | undefined
): Record<string, unknown> {
  return metadata?.properties && isRecord(metadata.properties) ? metadata.properties : {}
}

function readXNetKind(
  metadata: JsonCanvasXNetNodeMetadata | undefined
): CanvasSceneNodeKind | undefined {
  return metadata?.kind && CANVAS_SCENE_NODE_KINDS.has(metadata.kind as CanvasSceneNodeKind)
    ? (metadata.kind as CanvasSceneNodeKind)
    : undefined
}

function createImportedNode(
  node: JsonCanvasNode,
  type: CanvasSceneNodeKind,
  properties: Record<string, unknown>
): CanvasNode {
  return {
    id: node.id,
    type,
    ...(node.xnet?.sourceNodeId ? { sourceNodeId: node.xnet.sourceNodeId } : {}),
    ...(node.xnet?.sourceSchemaId ? { sourceSchemaId: node.xnet.sourceSchemaId } : {}),
    ...(node.xnet?.alias ? { alias: node.xnet.alias } : {}),
    ...(node.xnet?.locked !== undefined ? { locked: node.xnet.locked } : {}),
    ...(node.xnet?.display ? { display: node.xnet.display } : {}),
    position: readPosition(node),
    properties
  }
}

function importJsonCanvasNode(node: JsonCanvasNode): CanvasNode {
  const metadataKind = readXNetKind(node.xnet)
  const metadataProperties = readXNetProperties(node.xnet)
  const colorProperties = node.color ? { color: node.color } : {}

  switch (node.type) {
    case 'link':
      return createImportedNode(node, metadataKind ?? 'external-reference', {
        ...metadataProperties,
        ...colorProperties,
        url: node.url,
        title: metadataProperties.title ?? node.url
      })
    case 'file':
      return createImportedNode(node, metadataKind ?? 'media', {
        ...metadataProperties,
        ...colorProperties,
        file: node.file,
        title: metadataProperties.title ?? node.file.split('/').at(-1) ?? node.file
      })
    case 'group':
      return createImportedNode(node, metadataKind ?? 'group', {
        ...metadataProperties,
        ...colorProperties,
        title: metadataProperties.title ?? node.label,
        containerRole: metadataProperties.containerRole ?? 'frame'
      })
    case 'text':
    default:
      return createImportedNode(node, metadataKind ?? 'note', {
        ...metadataProperties,
        ...colorProperties,
        text: node.text,
        title: metadataProperties.title ?? node.text.split('\n')[0] ?? 'Text'
      })
  }
}

function getJsonCanvasPlacement(
  side: JsonCanvasSide | undefined
): CanvasObjectAnchorPlacement | undefined {
  return side
}

function createImportedEdgeStyle(edge: JsonCanvasEdge): EdgeStyle | undefined {
  const style = edge.xnet?.style ?? {}
  const nextStyle: EdgeStyle = {
    ...style,
    ...(edge.color ? { stroke: edge.color } : {}),
    ...(edge.fromEnd ? { markerStart: edge.fromEnd } : {}),
    ...(edge.toEnd ? { markerEnd: edge.toEnd } : {})
  }

  return Object.keys(nextStyle).length > 0 ? nextStyle : undefined
}

function importJsonCanvasEdge(edge: JsonCanvasEdge): CanvasEdge {
  const style = createImportedEdgeStyle(edge)

  return {
    id: edge.id,
    sourceId: edge.fromNode,
    targetId: edge.toNode,
    source: createCanvasEdgeEndpoint(edge.fromNode, {
      placement: getJsonCanvasPlacement(edge.fromSide)
    }),
    target: createCanvasEdgeEndpoint(edge.toNode, {
      placement: getJsonCanvasPlacement(edge.toSide)
    }),
    ...(edge.label ? { label: edge.label } : {}),
    ...(style ? { style } : {}),
    ...(edge.xnet?.relationship ? { relationship: edge.xnet.relationship } : {})
  }
}

function validateJsonCanvasDocument(document: JsonCanvasDocument): readonly string[] {
  const nodeIds = new Set<string>()
  const warnings: string[] = []

  for (const node of document.nodes) {
    if (!JSON_CANVAS_NODE_TYPES.has(node.type)) {
      warnings.push(`Unsupported JSON Canvas node type '${node.type}' for node '${node.id}'.`)
    }
    if (nodeIds.has(node.id)) {
      warnings.push(`Duplicate JSON Canvas node id '${node.id}'.`)
    }
    nodeIds.add(node.id)
  }

  for (const edge of document.edges ?? []) {
    if (!nodeIds.has(edge.fromNode) || !nodeIds.has(edge.toNode)) {
      warnings.push(`JSON Canvas edge '${edge.id}' references a missing node.`)
    }
  }

  return warnings
}

export function importCanvasFromJsonCanvas(
  document: JsonCanvasDocument
): ImportCanvasFromJsonCanvasResult {
  const warnings = validateJsonCanvasDocument(document)

  return {
    nodes: document.nodes.map(importJsonCanvasNode),
    edges: (document.edges ?? []).map(importJsonCanvasEdge),
    warnings
  }
}
