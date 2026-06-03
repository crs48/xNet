import type { DID, SchemaIRI } from './node'
import type { NodeChangeEvent, NodeState } from '../store/types'
import { describe, expect, it } from 'vitest'
import {
  PresenceAggregator,
  bucketPresenceCount,
  getPresenceNoisePolicy,
  summarizePresenceNodes
} from './presence'
import { PresenceSummarySchema } from './schemas/system'

type TestPresenceStore = {
  nodes: NodeState[]
  listener: ((event: NodeChangeEvent) => void) | null
  list(options?: { includeDeleted?: boolean }): Promise<NodeState[]>
  create(options: {
    id?: string
    schemaId: SchemaIRI
    properties: Record<string, unknown>
  }): Promise<NodeState>
  update(nodeId: string, options: { properties: Record<string, unknown> }): Promise<NodeState>
  subscribe(listener: (event: NodeChangeEvent) => void): () => void
}

const alice = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID
const pageSchema = 'xnet://xnet.fyi/Page@1.0.0' as SchemaIRI
const taskSchema = 'xnet://xnet.fyi/Task@1.0.0' as SchemaIRI

const createNode = (
  id: string,
  schemaId: SchemaIRI,
  createdBy: DID = alice,
  deleted = false
): NodeState => ({
  id,
  schemaId,
  properties: {},
  timestamps: {},
  deleted,
  createdAt: 1710000000000,
  createdBy,
  updatedAt: 1710000000000,
  updatedBy: createdBy
})

const createTestStore = (nodes: NodeState[]): TestPresenceStore => ({
  nodes,
  listener: null,
  async list(options) {
    return options?.includeDeleted ? this.nodes : this.nodes.filter((node) => !node.deleted)
  },
  async create(options) {
    const now = 1710000000000
    const node: NodeState = {
      id: options.id ?? `node-${this.nodes.length + 1}`,
      schemaId: options.schemaId,
      properties: options.properties,
      timestamps: {},
      deleted: false,
      createdAt: now,
      createdBy: alice,
      updatedAt: now,
      updatedBy: alice
    }
    this.nodes.push(node)
    return node
  },
  async update(nodeId, options) {
    const node = this.nodes.find((entry) => entry.id === nodeId)
    if (!node) {
      throw new Error(`Missing node: ${nodeId}`)
    }
    node.properties = { ...node.properties, ...options.properties }
    return node
  },
  subscribe(listener) {
    this.listener = listener
    return () => {
      this.listener = null
    }
  }
})

const emitNodeChange = (
  store: TestPresenceStore,
  previousNode: NodeState | null,
  node: NodeState | null
): void => {
  store.listener?.({
    change: {} as NodeChangeEvent['change'],
    previousNode,
    node,
    isRemote: false
  })
}

const flushQueuedRebuild = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('presence aggregation', () => {
  it('uses bucketed public counts with noise and private counts without raw IDs', () => {
    const summaries = summarizePresenceNodes(
      [createNode('page-1', pageSchema), createNode('page-2', pageSchema)],
      {
        now: () => 1710000001000,
        visibilityForNode: () => 'public-metadata'
      }
    )

    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      subjectDid: alice,
      schemaIri: pageSchema,
      countBucket: '2-5',
      visibility: 'public-metadata',
      noise: 'bucketed:+1-threshold-noise'
    })
    expect(JSON.stringify(summaries[0])).not.toContain('page-1')
    expect(JSON.stringify(summaries[0])).not.toContain('page-2')
  })

  it('excludes presence summary nodes and deleted nodes from aggregation', () => {
    const summaries = summarizePresenceNodes([
      createNode('task-1', taskSchema),
      createNode('task-2', taskSchema, alice, true),
      createNode('summary-1', PresenceSummarySchema.schema['@id'])
    ])

    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      schemaIri: taskSchema,
      countBucket: '1',
      visibility: 'private'
    })
  })

  it('maintains PresenceSummary nodes in the backing store', async () => {
    const store = createTestStore([
      createNode('page-1', pageSchema),
      createNode('page-2', pageSchema)
    ])
    const aggregator = new PresenceAggregator(store, {
      now: () => 1710000002000,
      visibilityForNode: () => 'trusted-app'
    })

    const summaries = await aggregator.rebuild()
    const summaryNodes = store.nodes.filter(
      (node) => node.schemaId === PresenceSummarySchema.schema['@id']
    )

    expect(summaries).toHaveLength(1)
    expect(summaryNodes).toHaveLength(1)
    expect(summaryNodes[0].properties).toMatchObject({
      subjectDid: alice,
      schemaIri: pageSchema,
      countBucket: '2-5',
      visibility: 'trusted-app'
    })
  })

  it('keeps PresenceSummary counts consistent across create and delete churn', async () => {
    let now = 1710000003000
    const page1 = createNode('page-1', pageSchema)
    const store = createTestStore([page1])
    const aggregator = new PresenceAggregator(store, {
      now: () => now,
      visibilityForNode: () => 'private'
    })
    const getSummary = () =>
      store.nodes.find((node) => node.schemaId === PresenceSummarySchema.schema['@id'])

    await aggregator.initialize()

    expect(getSummary()?.properties.countBucket).toBe('1')

    const page2 = createNode('page-2', pageSchema)
    store.nodes.push(page2)
    now += 1000
    emitNodeChange(store, null, page2)
    await flushQueuedRebuild()

    expect(getSummary()?.properties.countBucket).toBe('2-5')

    const previousPage2 = { ...page2 }
    page2.deleted = true
    now += 1000
    emitNodeChange(store, previousPage2, page2)
    await flushQueuedRebuild()

    expect(getSummary()?.properties.countBucket).toBe('1')

    const previousPage1 = { ...page1 }
    page1.deleted = true
    now += 1000
    emitNodeChange(store, previousPage1, page1)
    await flushQueuedRebuild()

    expect(getSummary()?.properties).toMatchObject({
      countBucket: '0',
      lastUpdatedAt: now,
      sourcePolicy: 'node-derived'
    })

    aggregator.dispose()
  })

  it('documents bucket thresholds and noise policy', () => {
    expect(bucketPresenceCount(0)).toBe('0')
    expect(bucketPresenceCount(1)).toBe('1')
    expect(bucketPresenceCount(6)).toBe('6-20')
    expect(bucketPresenceCount(99)).toBe('21-100')
    expect(bucketPresenceCount(2, 'public-metadata')).toBe('2-5')
    expect(getPresenceNoisePolicy('private')).toBe('bucketed')
    expect(getPresenceNoisePolicy('public-metadata')).toBe('bucketed:+1-threshold-noise')
  })
})
