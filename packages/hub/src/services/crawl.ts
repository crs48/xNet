/**
 * @xnet/hub - Crawl coordinator service.
 */

import type {
  CrawlDomainState,
  CrawlHistoryEntry,
  CrawlQueueEntry,
  CrawlerProfile,
  HubStorage
} from '../storage/interface'
import type { ShardIngestRouter } from './shard-ingest'
import type { RobotsChecker } from './crawl-robots'
import { randomUUID } from 'node:crypto'
import { validateExternalUrl } from '../utils/url'

export interface CrawlTask {
  taskId: string
  url: string
  domain: string
  priority: number
  assignedAt: number
  assignedTo: string
  deadlineMs: number
  crawlCount: number
  previousCid?: string
}

export interface CrawlResult {
  taskId: string
  url: string
  cid: string
  title: string
  body: string
  outLinks: string[]
  language: string
  statusCode: number
  contentType: string
  crawlTimeMs: number
  robotsAllowed: boolean
  crawlerDid: string
  crawledAt: number
}

export type CrawlConfig = {
  enabled: boolean
  maxBatchSize: number
  taskDeadlineMs: number
  domainCooldownMs: number
  maxQueueSize: number
  blocklist: string[]
  userAgent: string
  seedUrls?: string[]
  deadlineCheckIntervalMs?: number
}

export class CrawlCoordinator {
  private activeTasks = new Map<string, CrawlTask>()
  private activeUrls = new Map<string, string>()
  private domainLastCrawl = new Map<string, number>()
  private deadlineChecker: ReturnType<typeof setInterval> | null = null

  constructor(
    private storage: HubStorage,
    private shardIngest: ShardIngestRouter,
    private config: CrawlConfig,
    private robots?: RobotsChecker
  ) {}

  start(): void {
    if (this.deadlineChecker) return
    const interval = this.config.deadlineCheckIntervalMs ?? 30_000
    this.deadlineChecker = setInterval(() => this.expireDeadTasks(), interval)
  }

  stop(): void {
    if (!this.deadlineChecker) return
    clearInterval(this.deadlineChecker)
    this.deadlineChecker = null
  }

  async registerCrawler(profile: CrawlerProfile): Promise<void> {
    await this.storage.upsertCrawler(profile)
  }

  async seedUrls(urls: string[], priority = 1): Promise<void> {
    for (const url of urls) {
      const normalized = this.normalizeUrl(url)
      if (!normalized) continue
      if (!validateExternalUrl(normalized).valid) continue
      const domain = new URL(normalized).hostname
      if (this.isBlockedDomain(domain)) continue
      const entry: CrawlQueueEntry = {
        url: normalized,
        domain,
        priority,
        language: null,
        crawlCount: 0,
        lastCid: null,
        lastCrawledAt: null,
        enqueuedAt: Date.now()
      }
      await this.storage.upsertCrawlQueue(entry)
    }
  }

  async getNextTasks(crawlerDid: string, maxTasks: number): Promise<CrawlTask[]> {
    const crawler = await this.storage.getCrawler(crawlerDid)
    if (!crawler) throw new Error('Crawler not registered')

    const batchSize = Math.min(maxTasks, crawler.capacity, this.config.maxBatchSize)
    const candidates = await this.storage.getQueuedUrls({
      limit: batchSize * 3,
      languages: crawler.languages,
      domains: crawler.domains
    })

    const tasks: CrawlTask[] = []
    for (const candidate of candidates) {
      if (tasks.length >= batchSize) break
      if (this.activeUrls.has(candidate.url)) continue
      if (this.isBlockedDomain(candidate.domain)) continue
      if (this.robots && !(await this.robots.isAllowed(candidate.url))) continue

      const domainState = await this.getDomainState(candidate.domain)
      if (domainState.blocked) continue
      const last = this.domainLastCrawl.get(candidate.domain) ?? domainState.lastCrawledAt ?? 0
      if (Date.now() - last < domainState.cooldownMs) continue

      const task: CrawlTask = {
        taskId: randomUUID(),
        url: candidate.url,
        domain: candidate.domain,
        priority: candidate.priority,
        assignedAt: Date.now(),
        assignedTo: crawlerDid,
        deadlineMs: this.config.taskDeadlineMs,
        crawlCount: candidate.crawlCount,
        previousCid: candidate.lastCid ?? undefined
      }
      tasks.push(task)
      this.activeTasks.set(task.taskId, task)
      this.activeUrls.set(candidate.url, task.taskId)
      this.domainLastCrawl.set(candidate.domain, Date.now())
    }

    return tasks
  }

  async submitResults(results: CrawlResult[]): Promise<{
    processed: number
    indexed: number
    skipped: number
    errors: number
  }> {
    let indexed = 0
    let skipped = 0
    let errors = 0

    for (const result of results) {
      const task = this.activeTasks.get(result.taskId)
      if (!task) {
        errors += 1
        continue
      }

      this.activeTasks.delete(result.taskId)
      this.activeUrls.delete(task.url)

      const lastHistory = await this.storage.getCrawlHistory(result.url)
      const isDuplicate = lastHistory?.cid === result.cid

      if (isDuplicate) {
        skipped += 1
      } else if (result.robotsAllowed && result.statusCode >= 200 && result.statusCode < 300) {
        await this.shardIngest.ingest({
          cid: result.cid,
          url: result.url,
          title: result.title,
          body: result.body,
          language: result.language,
          indexedAt: result.crawledAt
        })
        indexed += 1
      }

      await this.storage.appendCrawlHistory(this.toHistoryEntry(result))
      await this.storage.upsertCrawlQueue({
        url: result.url,
        domain: task.domain,
        priority: task.priority,
        language: result.language,
        crawlCount: task.crawlCount + 1,
        lastCid: result.cid,
        lastCrawledAt: result.crawledAt,
        enqueuedAt: Date.now()
      })

      await this.seedUrls(result.outLinks, Math.max(task.priority - 1, 1))
      await this.updateCrawlerStats(result.crawlerDid, result.statusCode)
      await this.updateDomainState(task.domain, result.crawledAt)
    }

    return {
      processed: results.length,
      indexed,
      skipped,
      errors
    }
  }

  async getStats(): Promise<{
    queued: number
    active: number
    crawlers: number
  }> {
    const queued = (await this.storage.getQueuedUrls({ limit: this.config.maxQueueSize })).length
    const crawlers = (await this.storage.listCrawlers()).length
    return { queued, active: this.activeTasks.size, crawlers }
  }

  private async updateCrawlerStats(crawlerDid: string, statusCode: number): Promise<void> {
    const crawler = await this.storage.getCrawler(crawlerDid)
    if (!crawler) return
    const success = statusCode >= 200 && statusCode < 300
    const reputation = Math.max(0, Math.min(100, crawler.reputation + (success ? 1 : -1)))
    await this.storage.updateCrawlerStats(crawlerDid, {
      reputation,
      totalCrawled: crawler.totalCrawled + 1
    })
  }

  private async updateDomainState(domain: string, crawledAt: number): Promise<void> {
    const state: CrawlDomainState = {
      domain,
      lastCrawledAt: crawledAt,
      cooldownMs: this.config.domainCooldownMs,
      blocked: false
    }
    await this.storage.upsertCrawlDomainState(state)
  }

  private async getDomainState(domain: string): Promise<{
    cooldownMs: number
    lastCrawledAt: number | null
    blocked: boolean
  }> {
    const state = await this.storage.getCrawlDomainState(domain)
    if (!state) {
      return {
        cooldownMs: this.config.domainCooldownMs,
        lastCrawledAt: null,
        blocked: false
      }
    }
    return {
      cooldownMs: state.cooldownMs,
      lastCrawledAt: state.lastCrawledAt ?? null,
      blocked: state.blocked
    }
  }

  private isBlockedDomain(domain: string): boolean {
    return this.config.blocklist.some((blocked) => domain.endsWith(blocked))
  }

  private normalizeUrl(url: string): string | null {
    try {
      const parsed = new URL(url)
      return parsed.toString()
    } catch {
      return null
    }
  }

  private toHistoryEntry(result: CrawlResult): CrawlHistoryEntry {
    return {
      url: result.url,
      cid: result.cid,
      title: result.title,
      statusCode: result.statusCode,
      contentType: result.contentType,
      language: result.language,
      crawlerDid: result.crawlerDid,
      crawlTimeMs: result.crawlTimeMs,
      crawledAt: result.crawledAt
    }
  }

  private expireDeadTasks(): void {
    const now = Date.now()
    for (const [taskId, task] of this.activeTasks.entries()) {
      if (now - task.assignedAt > task.deadlineMs) {
        this.activeTasks.delete(taskId)
        this.activeUrls.delete(task.url)
      }
    }
  }
}
