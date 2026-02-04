import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStorage } from '../src/storage'
import { ShardIngestRouter } from '../src/services/shard-ingest'
import { ShardRegistry, type ShardConfig } from '../src/services/index-shards'
import { CrawlCoordinator, type CrawlConfig } from '../src/services/crawl'

const createShardSetup = async () => {
  const storage = createMemoryStorage()
  const shardConfig: ShardConfig = {
    enabled: true,
    totalShards: 1,
    hostedShards: [0],
    replicationFactor: 1,
    registryUrl: '',
    maxDocsPerShard: 1000,
    hubDid: 'did:key:z6MkLocal',
    hubUrl: 'http://localhost',
    isRegistry: true
  }
  const registry = new ShardRegistry(shardConfig, storage)
  await registry.setAssignments([
    {
      shardId: 0,
      rangeStart: 0,
      rangeEnd: 255,
      primaryHub: { url: shardConfig.hubUrl!, hubDid: shardConfig.hubDid! },
      replicaHub: undefined,
      docCount: 0,
      updatedAt: Date.now()
    }
  ])
  const ingest = new ShardIngestRouter(registry, storage, shardConfig)
  return { storage, ingest }
}

const baseCrawlConfig: CrawlConfig = {
  enabled: true,
  maxBatchSize: 2,
  taskDeadlineMs: 2000,
  domainCooldownMs: 2000,
  maxQueueSize: 100,
  blocklist: ['blocked.com'],
  userAgent: 'xNetCrawler/1.0'
}

describe('Crawl Coordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('assigns tasks to registered crawlers', async () => {
    const { storage, ingest } = await createShardSetup()
    const coordinator = new CrawlCoordinator(storage, ingest, baseCrawlConfig, {
      isAllowed: async () => true
    } as any)

    await coordinator.registerCrawler({
      did: 'did:key:crawler1',
      type: 'desktop',
      capacity: 2,
      languages: ['en'],
      reputation: 50,
      totalCrawled: 0,
      registeredAt: Date.now()
    })

    await coordinator.seedUrls(['https://example.com/page1', 'https://example.com/page2'])
    const tasks = await coordinator.getNextTasks('did:key:crawler1', 2)
    expect(tasks.length).toBeGreaterThan(0)
  })

  it('respects domain rate limiting', async () => {
    const { storage, ingest } = await createShardSetup()
    const coordinator = new CrawlCoordinator(storage, ingest, baseCrawlConfig, {
      isAllowed: async () => true
    } as any)

    await coordinator.registerCrawler({
      did: 'did:key:crawler1',
      type: 'desktop',
      capacity: 5,
      languages: ['en'],
      reputation: 50,
      totalCrawled: 0,
      registeredAt: Date.now()
    })

    await coordinator.seedUrls([
      'https://rate.com/page1',
      'https://rate.com/page2',
      'https://other.com/page'
    ])

    const tasks = await coordinator.getNextTasks('did:key:crawler1', 5)
    const rateTasks = tasks.filter((task) => task.domain === 'rate.com')
    expect(rateTasks.length).toBeLessThanOrEqual(1)
  })

  it('respects persisted domain cooldown across coordinator restarts', async () => {
    const { storage, ingest } = await createShardSetup()
    const coordinator = new CrawlCoordinator(storage, ingest, baseCrawlConfig, {
      isAllowed: async () => true
    } as any)

    await coordinator.registerCrawler({
      did: 'did:key:crawler1',
      type: 'desktop',
      capacity: 1,
      languages: ['en'],
      reputation: 50,
      totalCrawled: 0,
      registeredAt: Date.now()
    })

    await coordinator.seedUrls(['https://cooldown.com/page'])
    const tasks = await coordinator.getNextTasks('did:key:crawler1', 1)

    await coordinator.submitResults([
      {
        taskId: tasks[0]?.taskId ?? '',
        url: 'https://cooldown.com/page',
        cid: 'cid:blake3:cooldown',
        title: 'Cooldown Page',
        body: 'Needs cooldown',
        outLinks: [],
        language: 'en',
        statusCode: 200,
        contentType: 'text/html',
        crawlTimeMs: 100,
        robotsAllowed: true,
        crawlerDid: 'did:key:crawler1',
        crawledAt: Date.now()
      }
    ])

    const coordinatorRestarted = new CrawlCoordinator(storage, ingest, baseCrawlConfig, {
      isAllowed: async () => true
    } as any)

    const tasksAfterRestart = await coordinatorRestarted.getNextTasks('did:key:crawler1', 1)
    const urls = tasksAfterRestart.map((task) => task.url)
    expect(urls).not.toContain('https://cooldown.com/page')
  })

  it('deduplicates unchanged content by CID', async () => {
    const { storage, ingest } = await createShardSetup()
    const coordinator = new CrawlCoordinator(storage, ingest, baseCrawlConfig, {
      isAllowed: async () => true
    } as any)

    await coordinator.registerCrawler({
      did: 'did:key:crawler1',
      type: 'desktop',
      capacity: 1,
      languages: ['en'],
      reputation: 50,
      totalCrawled: 0,
      registeredAt: Date.now()
    })

    await coordinator.seedUrls(['https://static.com/page'])
    const tasks = await coordinator.getNextTasks('did:key:crawler1', 1)

    const summary = await coordinator.submitResults([
      {
        taskId: tasks[0]?.taskId ?? '',
        url: 'https://static.com/page',
        cid: 'cid:blake3:abc',
        title: 'Static Page',
        body: 'Content that never changes',
        outLinks: [],
        language: 'en',
        statusCode: 200,
        contentType: 'text/html',
        crawlTimeMs: 100,
        robotsAllowed: true,
        crawlerDid: 'did:key:crawler1',
        crawledAt: Date.now()
      }
    ])

    expect(summary.indexed).toBe(1)

    await coordinator.seedUrls(['https://static.com/page'])
    const tasks2 = await coordinator.getNextTasks('did:key:crawler1', 1)
    const summary2 = await coordinator.submitResults([
      {
        taskId: tasks2[0]?.taskId ?? '',
        url: 'https://static.com/page',
        cid: 'cid:blake3:abc',
        title: 'Static Page',
        body: 'Content that never changes',
        outLinks: [],
        language: 'en',
        statusCode: 200,
        contentType: 'text/html',
        crawlTimeMs: 100,
        robotsAllowed: true,
        crawlerDid: 'did:key:crawler1',
        crawledAt: Date.now()
      }
    ])

    expect(summary2.skipped).toBe(1)
    expect(summary2.indexed).toBe(0)
  })

  it('adds outlinks to the queue', async () => {
    const { storage, ingest } = await createShardSetup()
    const coordinator = new CrawlCoordinator(storage, ingest, baseCrawlConfig, {
      isAllowed: async () => true
    } as any)

    await coordinator.registerCrawler({
      did: 'did:key:crawler1',
      type: 'desktop',
      capacity: 3,
      languages: ['en'],
      reputation: 50,
      totalCrawled: 0,
      registeredAt: Date.now()
    })

    await coordinator.seedUrls(['https://hub.com/start'])
    const tasks = await coordinator.getNextTasks('did:key:crawler1', 1)

    await coordinator.submitResults([
      {
        taskId: tasks[0]?.taskId ?? '',
        url: 'https://hub.com/start',
        cid: 'cid:blake3:start',
        title: 'Start Page',
        body: 'Links to other pages',
        outLinks: ['https://hub.com/about', 'https://external.com/page'],
        language: 'en',
        statusCode: 200,
        contentType: 'text/html',
        crawlTimeMs: 100,
        robotsAllowed: true,
        crawlerDid: 'did:key:crawler1',
        crawledAt: Date.now()
      }
    ])

    const newTasks = await coordinator.getNextTasks('did:key:crawler1', 10)
    const urls = newTasks.map((task) => task.url)
    expect(urls).toContain('https://hub.com/about')
    expect(urls).toContain('https://external.com/page')
  })

  it('blocks domains in blocklist', async () => {
    const { storage, ingest } = await createShardSetup()
    const coordinator = new CrawlCoordinator(storage, ingest, baseCrawlConfig, {
      isAllowed: async () => true
    } as any)

    await coordinator.registerCrawler({
      did: 'did:key:crawler1',
      type: 'desktop',
      capacity: 1,
      languages: ['en'],
      reputation: 50,
      totalCrawled: 0,
      registeredAt: Date.now()
    })

    await coordinator.seedUrls(['https://blocked.com/page'])
    const tasks = await coordinator.getNextTasks('did:key:crawler1', 5)
    const blocked = tasks.filter((task) => task.domain === 'blocked.com')
    expect(blocked.length).toBe(0)
  })

  it('expires dead tasks after deadline', async () => {
    const { storage, ingest } = await createShardSetup()
    const coordinator = new CrawlCoordinator(
      storage,
      ingest,
      { ...baseCrawlConfig, taskDeadlineMs: 500, deadlineCheckIntervalMs: 200 },
      { isAllowed: async () => true } as any
    )

    coordinator.start()

    await coordinator.registerCrawler({
      did: 'did:key:crawler1',
      type: 'desktop',
      capacity: 1,
      languages: ['en'],
      reputation: 50,
      totalCrawled: 0,
      registeredAt: Date.now()
    })

    await coordinator.seedUrls(['https://timeout.com/slow'])
    await coordinator.getNextTasks('did:key:crawler1', 1)

    await vi.advanceTimersByTimeAsync(1000)

    const retried = await coordinator.getNextTasks('did:key:crawler1', 1)
    expect(retried.some((task) => task.url === 'https://timeout.com/slow')).toBe(true)
    coordinator.stop()
  })
})
