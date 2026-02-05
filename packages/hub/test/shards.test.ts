import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShardRegistry, type ShardAssignment, type ShardConfig } from '../src/services/index-shards'
import { ShardIngestRouter } from '../src/services/shard-ingest'
import { ShardQueryRouter } from '../src/services/shard-router'
import { createMemoryStorage } from '../src/storage'

const createAssignments = (
  totalShards: number,
  hubDid: string,
  hubUrl: string
): ShardAssignment[] =>
  Array.from({ length: totalShards }, (_, shardId) => ({
    shardId,
    rangeStart: Math.floor((256 / totalShards) * shardId),
    rangeEnd:
      shardId === totalShards - 1 ? 255 : Math.floor((256 / totalShards) * (shardId + 1)) - 1,
    primaryHub: { url: hubUrl, hubDid },
    replicaHub: undefined,
    docCount: 0,
    updatedAt: Date.now()
  }))

describe('Global Index Shards', () => {
  const config: ShardConfig = {
    enabled: true,
    totalShards: 4,
    hostedShards: [0, 1, 2, 3],
    replicationFactor: 1,
    registryUrl: 'http://localhost',
    maxDocsPerShard: 1000,
    hubDid: 'did:key:z6MkLocal',
    hubUrl: 'http://localhost',
    isRegistry: true
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('assigns terms to correct shards deterministically', async () => {
    const storage = createMemoryStorage()
    const registry = new ShardRegistry(config, storage)
    await registry.setAssignments(
      createAssignments(config.totalShards, config.hubDid!, config.hubUrl!)
    )

    const shard1 = registry.getShardForTerm('permaculture')
    const shard2 = registry.getShardForTerm('permaculture')

    expect(shard1?.shardId).toBe(shard2?.shardId)
  })

  it('routes multi-term query to multiple shards', async () => {
    const storage = createMemoryStorage()
    const registry = new ShardRegistry(config, storage)
    await registry.setAssignments(
      createAssignments(config.totalShards, config.hubDid!, config.hubUrl!)
    )

    const shards = registry.getShardsForQuery(['food', 'forest', 'design'])
    expect(shards.length).toBeGreaterThanOrEqual(1)
    expect(shards.length).toBeLessThanOrEqual(3)
  })

  it('ingests document and queries it back', async () => {
    const storage = createMemoryStorage()
    const registry = new ShardRegistry(config, storage)
    await registry.setAssignments(
      createAssignments(config.totalShards, config.hubDid!, config.hubUrl!)
    )

    const ingest = new ShardIngestRouter(registry, storage, config)
    const router = new ShardQueryRouter(registry, storage, config)

    await ingest.ingest({
      cid: 'cid:blake3:test123',
      title: 'Food Forest Design Guide',
      body: 'A comprehensive guide to designing seven-layer food forests for temperate climates.',
      schema: 'xnet://farming/Page',
      indexedAt: Date.now()
    })

    const results = await router.search({
      queryId: 'q-1',
      text: 'food forest temperate',
      limit: 10
    })

    expect(results.results.length).toBeGreaterThanOrEqual(1)
    expect(results.results[0].cid).toBe('cid:blake3:test123')
  })

  it('handles shard host failure with replica fallback', async () => {
    const storage = createMemoryStorage()
    const registry = new ShardRegistry({ ...config, hostedShards: [], totalShards: 1 }, storage)

    await registry.setAssignments([
      {
        shardId: 0,
        rangeStart: 0,
        rangeEnd: 255,
        primaryHub: { url: 'http://dead-host', hubDid: 'did:key:dead' },
        replicaHub: { url: 'http://replica-host', hubDid: 'did:key:replica' },
        docCount: 0,
        updatedAt: Date.now()
      }
    ])

    const router = new ShardQueryRouter(registry, storage, {
      ...config,
      hostedShards: [],
      totalShards: 1
    })
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input)
      if (url.includes('dead-host')) {
        return new Response(null, { status: 500 })
      }
      return new Response(
        JSON.stringify({
          results: [
            {
              cid: 'cid:replica',
              title: 'Replica Result',
              indexedAt: Date.now(),
              score: 1,
              shardId: 0,
              sourceHub: 'replica'
            }
          ]
        }),
        { status: 200 }
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    const results = await router.search({
      queryId: 'q-failover',
      text: 'resilience',
      limit: 10
    })

    expect(results.results[0]?.cid).toBe('cid:replica')
  })
})
