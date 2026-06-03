/**
 * Presence aggregation derived from NodeStore change streams.
 */

import type { DID, SchemaIRI } from './node'
import type { NodeChangeEvent, NodeState } from '../store/types'
import { getBaseSchemaIRI, parseSchemaIRI } from './node'
import {
  PresenceSummarySchema,
  buildSystemNodeId,
  type PresenceCountBucket,
  type PresenceVisibility
} from './schemas/system'

export type PresenceAggregatorStore = {
  list(options?: { includeDeleted?: boolean }): Promise<NodeState[]>
  create(options: {
    id?: string
    schemaId: SchemaIRI
    properties: Record<string, unknown>
  }): Promise<NodeState>
  update(nodeId: string, options: { properties: Record<string, unknown> }): Promise<NodeState>
  subscribe(listener: (event: NodeChangeEvent) => void): () => void
}

export type PresenceVisibilityResolver = (node: NodeState) => PresenceVisibility

export type PresenceAggregatorOptions = {
  visibilityForNode?: PresenceVisibilityResolver
  now?: () => number
}

export type PresenceSummaryDescriptor = {
  id: string
  subjectDid: DID
  schemaIri: SchemaIRI
  namespace: string
  countBucket: PresenceCountBucket
  visibility: PresenceVisibility
  lastUpdatedAt: number
  sourcePolicy: string
  noise: string
}

type PresenceGroupKey = string

export class PresenceAggregator {
  private readonly visibilityForNode: PresenceVisibilityResolver
  private readonly now: () => number
  private unsubscribe: (() => void) | null = null
  private rebuildQueued = false

  constructor(
    private readonly store: PresenceAggregatorStore,
    options: PresenceAggregatorOptions = {}
  ) {
    this.visibilityForNode = options.visibilityForNode ?? (() => 'private')
    this.now = options.now ?? Date.now
  }

  async initialize(): Promise<void> {
    await this.rebuild()
    this.unsubscribe = this.store.subscribe((event) => {
      if (isPresenceSummaryNode(event.node) || isPresenceSummaryNode(event.previousNode)) {
        return
      }
      void this.queueRebuild()
    })
  }

  async rebuild(): Promise<PresenceSummaryDescriptor[]> {
    const nodes = await this.store.list({ includeDeleted: false })
    const summaries = summarizePresenceNodes(nodes, {
      visibilityForNode: this.visibilityForNode,
      now: this.now
    })
    await this.upsertSummaries(summaries)
    return summaries
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  private async queueRebuild(): Promise<void> {
    if (this.rebuildQueued) {
      return
    }

    this.rebuildQueued = true
    await Promise.resolve()
    this.rebuildQueued = false
    await this.rebuild()
  }

  private async upsertSummaries(summaries: PresenceSummaryDescriptor[]): Promise<void> {
    const existing = await this.store.list({ includeDeleted: false })
    const existingById = new Map(
      existing.filter(isPresenceSummaryNode).map((node) => [node.id, node])
    )
    const desiredIds = new Set(summaries.map((summary) => summary.id))

    for (const summary of summaries) {
      const existingSummary = existingById.get(summary.id)
      const properties = {
        subjectDid: summary.subjectDid,
        schemaIri: summary.schemaIri,
        namespace: summary.namespace,
        countBucket: summary.countBucket,
        visibility: summary.visibility,
        lastUpdatedAt: summary.lastUpdatedAt,
        sourcePolicy: summary.sourcePolicy,
        noise: summary.noise
      }

      if (!existingSummary) {
        await this.store.create({
          id: summary.id,
          schemaId: PresenceSummarySchema.schema['@id'],
          properties
        })
        continue
      }

      if (shouldUpdateSummary(existingSummary, properties)) {
        await this.store.update(summary.id, { properties })
      }
    }

    for (const existingSummary of existingById.values()) {
      if (desiredIds.has(existingSummary.id)) {
        continue
      }

      const properties = createZeroPresenceSummaryProperties(existingSummary, this.now())
      if (properties && shouldUpdateSummary(existingSummary, properties)) {
        await this.store.update(existingSummary.id, { properties })
      }
    }
  }
}

export function summarizePresenceNodes(
  nodes: NodeState[],
  options: PresenceAggregatorOptions = {}
): PresenceSummaryDescriptor[] {
  const visibilityForNode = options.visibilityForNode ?? (() => 'private')
  const now = options.now ?? Date.now
  const groups = new Map<
    PresenceGroupKey,
    { count: number; descriptor: PresenceSummaryDescriptor }
  >()

  for (const node of nodes) {
    if (node.deleted || isPresenceSummaryNode(node)) {
      continue
    }

    const visibility = visibilityForNode(node)
    const namespace = getNodeNamespace(node)
    const key: PresenceGroupKey = `${node.createdBy}|${node.schemaId}|${namespace}|${visibility}`
    const existing = groups.get(key)
    const count = (existing?.count ?? 0) + 1
    const subjectDid = node.createdBy
    const schemaIri = node.schemaId

    groups.set(key, {
      count,
      descriptor: {
        id: buildPresenceSummaryId(subjectDid, schemaIri, namespace, visibility),
        subjectDid,
        schemaIri,
        namespace,
        countBucket: bucketPresenceCount(count, visibility),
        visibility,
        lastUpdatedAt: now(),
        sourcePolicy: 'node-derived',
        noise: getPresenceNoisePolicy(visibility)
      }
    })
  }

  return [...groups.values()]
    .map((entry) => ({
      ...entry.descriptor,
      countBucket: bucketPresenceCount(entry.count, entry.descriptor.visibility)
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function bucketPresenceCount(
  count: number,
  visibility: PresenceVisibility = 'private'
): PresenceCountBucket {
  const adjusted = visibility === 'public-metadata' ? applyPublicPresenceNoise(count) : count
  if (adjusted <= 0) return '0'
  if (adjusted === 1) return '1'
  if (adjusted <= 5) return '2-5'
  if (adjusted <= 20) return '6-20'
  if (adjusted <= 100) return '21-100'
  return '100+'
}

export function getPresenceNoisePolicy(visibility: PresenceVisibility): string {
  if (visibility === 'public-metadata') {
    return 'bucketed:+1-threshold-noise'
  }

  return 'bucketed'
}

function createZeroPresenceSummaryProperties(
  node: NodeState,
  lastUpdatedAt: number
): Record<string, unknown> | null {
  const subjectDid = asString(node.properties.subjectDid)
  const schemaIri = asString(node.properties.schemaIri)
  const namespace = asString(node.properties.namespace)
  const visibility = asPresenceVisibility(node.properties.visibility)
  if (!subjectDid || !schemaIri || !namespace || !visibility) {
    return null
  }

  return {
    subjectDid,
    schemaIri,
    namespace,
    countBucket: '0',
    visibility,
    lastUpdatedAt,
    sourcePolicy: 'node-derived',
    noise: getPresenceNoisePolicy(visibility)
  }
}

function applyPublicPresenceNoise(count: number): number {
  if (count <= 1) {
    return count
  }

  return count + 1
}

function buildPresenceSummaryId(
  subjectDid: DID,
  schemaIri: SchemaIRI,
  namespace: string,
  visibility: PresenceVisibility
): string {
  return buildSystemNodeId(
    subjectDid,
    'presence',
    `${encodeURIComponent(schemaIri)}:${encodeURIComponent(namespace)}:${visibility}`
  )
}

function getNodeNamespace(node: NodeState): string {
  const parsedSystem = node.id.match(/^(xnet:\/\/did:key:[^/]+\/sys\/[^/]+\/)/)
  if (parsedSystem) {
    return parsedSystem[1]
  }

  const parsedSchema = parseSchemaIRI(node.schemaId)
  return parsedSchema.namespace || getBaseSchemaIRI(node.schemaId)
}

function isPresenceSummaryNode(node: NodeState | null | undefined): boolean {
  return (
    node !== null &&
    node !== undefined &&
    (node.schemaId === PresenceSummarySchema.schema['@id'] ||
      node.schemaId === 'xnet://xnet.fyi/PresenceSummary')
  )
}

function shouldUpdateSummary(existing: NodeState, properties: Record<string, unknown>): boolean {
  return Object.entries(properties).some(([key, value]) => existing.properties[key] !== value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asPresenceVisibility(value: unknown): PresenceVisibility | null {
  return value === 'private' || value === 'trusted-app' || value === 'public-metadata'
    ? value
    : null
}
