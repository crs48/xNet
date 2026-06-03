/**
 * @xnetjs/hub - Crawl coordinator service.
 */

import type { RobotsChecker } from './crawl-robots'
import type { ShardIngestRouter } from './shard-ingest'
import type {
  CrawlDomainState,
  CrawlHistoryEntry,
  CrawlQueueEntry,
  CrawlerProfile,
  HubStorage
} from '../storage/interface'
import type { ContentFingerprint, DuplicateContentOptions } from '@xnetjs/abuse'
import { randomUUID } from 'node:crypto'
import { assessDuplicateContent, createContentFingerprint } from '@xnetjs/abuse'
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
  quality?: CrawlQualitySignals
}

export type CrawlQualitySignals = {
  duplicateScore?: number
  slopScore?: number
  provenanceScore?: number
  sourceReputation?: number
  contentFingerprint?: ContentFingerprint
}

export type CrawlDomainPolicy = {
  domain: string
  action?: 'allow' | 'skip' | 'quarantine' | 'block'
  cooldownMs?: number
  minCrawlerReputation?: number
  maxDuplicateScoreForIndex?: number
  maxSlopScoreForIndex?: number
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
  domainPolicies?: CrawlDomainPolicy[]
  minCrawlerReputation?: number
  maxDuplicateScoreForIndex?: number
  maxSlopScoreForIndex?: number
  duplicateReferenceLimit?: number
  duplicateDetection?: DuplicateContentOptions
}

export type CrawlIngestionDecision = {
  admission: 'index' | 'skip' | 'quarantine'
  reasons: string[]
  searchScoreMultiplier: number
  duplicateScore: number
  slopScore: number
  provenanceScore: number
  sourceReputation: number
}

export function evaluateCrawlIngestion(input: {
  result: CrawlResult
  task: CrawlTask
  lastHistory?: CrawlHistoryEntry | null
  crawler?: CrawlerProfile | null
  domainState?: { blocked: boolean }
  domainPolicy?: CrawlDomainPolicy | null
  config?: Pick<
    CrawlConfig,
    'minCrawlerReputation' | 'maxDuplicateScoreForIndex' | 'maxSlopScoreForIndex'
  >
}): CrawlIngestionDecision {
  const duplicateScore = Math.max(
    input.lastHistory?.cid === input.result.cid ? 1 : 0,
    clamp01(input.result.quality?.duplicateScore)
  )
  const slopScore = clamp01(input.result.quality?.slopScore)
  const provenanceScore = clamp01(input.result.quality?.provenanceScore ?? 1)
  const sourceReputation = normalizeReputation(
    input.result.quality?.sourceReputation ?? input.crawler?.reputation ?? 0
  )
  const minCrawlerReputation =
    input.domainPolicy?.minCrawlerReputation ?? input.config?.minCrawlerReputation ?? 0
  const maxDuplicateScore =
    input.domainPolicy?.maxDuplicateScoreForIndex ?? input.config?.maxDuplicateScoreForIndex ?? 0.98
  const maxSlopScore =
    input.domainPolicy?.maxSlopScoreForIndex ?? input.config?.maxSlopScoreForIndex ?? 0.92
  const reasons: string[] = []

  if (input.domainState?.blocked || input.domainPolicy?.action === 'block') {
    return createCrawlDecision('skip', ['domain-blocked'], {
      duplicateScore,
      slopScore,
      provenanceScore,
      sourceReputation
    })
  }

  if (input.domainPolicy?.action === 'skip') {
    return createCrawlDecision('skip', ['domain-policy-skip'], {
      duplicateScore,
      slopScore,
      provenanceScore,
      sourceReputation
    })
  }

  if (!input.result.robotsAllowed) reasons.push('robots-disallowed')
  if (input.result.statusCode < 200 || input.result.statusCode >= 300) reasons.push('bad-status')
  if (duplicateScore >= maxDuplicateScore) reasons.push('duplicate-content')
  if (sourceReputation * 100 < minCrawlerReputation) reasons.push('low-source-reputation')
  if (slopScore >= maxSlopScore) reasons.push('slop-score')

  if (
    reasons.includes('robots-disallowed') ||
    reasons.includes('bad-status') ||
    reasons.includes('duplicate-content')
  ) {
    return createCrawlDecision('skip', reasons, {
      duplicateScore,
      slopScore,
      provenanceScore,
      sourceReputation
    })
  }

  if (input.domainPolicy?.action === 'quarantine') reasons.push('domain-policy-quarantine')

  if (reasons.length > 0) {
    return createCrawlDecision('quarantine', reasons, {
      duplicateScore,
      slopScore,
      provenanceScore,
      sourceReputation
    })
  }

  return createCrawlDecision('index', ['accepted'], {
    duplicateScore,
    slopScore,
    provenanceScore,
    sourceReputation
  })
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
      if (this.getDomainPolicy(domain)?.action === 'skip') continue
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
      if (this.getDomainPolicy(candidate.domain)?.action === 'skip') continue
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
    quarantined: number
    errors: number
  }> {
    let indexed = 0
    let skipped = 0
    let quarantined = 0
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
      const recentHistory = await this.storage.listRecentCrawlHistory({
        limit: this.config.duplicateReferenceLimit ?? 50
      })
      const contentFingerprint =
        result.quality?.contentFingerprint ??
        createContentFingerprint(
          { title: result.title, body: result.body },
          this.config.duplicateDetection
        )
      const duplicateAssessment = assessDuplicateContent(
        contentFingerprint,
        crawlReferenceFingerprints(recentHistory, lastHistory),
        this.config.duplicateDetection
      )
      const evaluatedResult: CrawlResult = {
        ...result,
        quality: {
          ...result.quality,
          contentFingerprint,
          duplicateScore: Math.max(
            clamp01(result.quality?.duplicateScore),
            duplicateAssessment.duplicateScore
          )
        }
      }
      const crawler = await this.storage.getCrawler(result.crawlerDid)
      const domainState = await this.getDomainState(task.domain)
      const domainPolicy = this.getDomainPolicy(task.domain)
      const decision = evaluateCrawlIngestion({
        result: evaluatedResult,
        task,
        lastHistory,
        crawler,
        domainState,
        domainPolicy,
        config: this.config
      })

      if (decision.admission === 'skip') {
        skipped += 1
      } else if (decision.admission === 'quarantine') {
        skipped += 1
        quarantined += 1
      } else {
        await this.shardIngest.ingest({
          cid: evaluatedResult.cid,
          url: evaluatedResult.url,
          title: evaluatedResult.title,
          body: evaluatedResult.body,
          language: evaluatedResult.language,
          indexedAt: evaluatedResult.crawledAt,
          tags: decision.reasons,
          searchScoreMultiplier: decision.searchScoreMultiplier
        })
        indexed += 1
      }

      await this.storage.appendCrawlHistory(
        this.toHistoryEntry(evaluatedResult, contentFingerprint)
      )
      await this.storage.upsertCrawlQueue({
        url: evaluatedResult.url,
        domain: task.domain,
        priority: task.priority,
        language: evaluatedResult.language,
        crawlCount: task.crawlCount + 1,
        lastCid: evaluatedResult.cid,
        lastCrawledAt: evaluatedResult.crawledAt,
        enqueuedAt: Date.now()
      })

      await this.seedUrls(evaluatedResult.outLinks, Math.max(task.priority - 1, 1))
      await this.updateCrawlerStats(evaluatedResult.crawlerDid, evaluatedResult.statusCode)
      await this.updateDomainState(task.domain, evaluatedResult.crawledAt)
    }

    return {
      processed: results.length,
      indexed,
      skipped,
      quarantined,
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
    const domainPolicy = this.getDomainPolicy(domain)
    const state: CrawlDomainState = {
      domain,
      lastCrawledAt: crawledAt,
      cooldownMs: domainPolicy?.cooldownMs ?? this.config.domainCooldownMs,
      blocked: domainPolicy?.action === 'block'
    }
    await this.storage.upsertCrawlDomainState(state)
  }

  private async getDomainState(domain: string): Promise<{
    cooldownMs: number
    lastCrawledAt: number | null
    blocked: boolean
  }> {
    const domainPolicy = this.getDomainPolicy(domain)
    const state = await this.storage.getCrawlDomainState(domain)
    if (!state) {
      return {
        cooldownMs: domainPolicy?.cooldownMs ?? this.config.domainCooldownMs,
        lastCrawledAt: null,
        blocked: domainPolicy?.action === 'block'
      }
    }
    return {
      cooldownMs: domainPolicy?.cooldownMs ?? state.cooldownMs,
      lastCrawledAt: state.lastCrawledAt ?? null,
      blocked: state.blocked || domainPolicy?.action === 'block'
    }
  }

  private isBlockedDomain(domain: string): boolean {
    return (
      this.config.blocklist.some((blocked) => domain.endsWith(blocked)) ||
      this.getDomainPolicy(domain)?.action === 'block'
    )
  }

  private getDomainPolicy(domain: string): CrawlDomainPolicy | null {
    return (
      this.config.domainPolicies?.find((policy) => {
        return domain === policy.domain || domain.endsWith(`.${policy.domain}`)
      }) ?? null
    )
  }

  private normalizeUrl(url: string): string | null {
    try {
      const parsed = new URL(url)
      return parsed.toString()
    } catch {
      return null
    }
  }

  private toHistoryEntry(
    result: CrawlResult,
    contentFingerprint: ContentFingerprint
  ): CrawlHistoryEntry {
    return {
      url: result.url,
      cid: result.cid,
      title: result.title,
      statusCode: result.statusCode,
      contentType: result.contentType,
      language: result.language,
      crawlerDid: result.crawlerDid,
      crawlTimeMs: result.crawlTimeMs,
      crawledAt: result.crawledAt,
      contentFingerprint
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

    // Prune stale domain cooldown entries to prevent unbounded growth.
    // Keep entries younger than 2x the cooldown period.
    const domainCutoff = now - this.config.domainCooldownMs * 2
    if (this.domainLastCrawl.size > 10_000) {
      for (const [domain, lastCrawl] of this.domainLastCrawl) {
        if (lastCrawl < domainCutoff) {
          this.domainLastCrawl.delete(domain)
        }
      }
    }
  }
}

function crawlReferenceFingerprints(
  recentHistory: readonly CrawlHistoryEntry[],
  lastHistory: CrawlHistoryEntry | null
): ContentFingerprint[] {
  const byHash = new Map<string, ContentFingerprint>()
  for (const entry of [...recentHistory, ...(lastHistory ? [lastHistory] : [])]) {
    if (entry.contentFingerprint) {
      byHash.set(entry.contentFingerprint.textHash, entry.contentFingerprint)
    }
  }
  return Array.from(byHash.values())
}

function createCrawlDecision(
  admission: CrawlIngestionDecision['admission'],
  reasons: readonly string[],
  signals: Pick<
    CrawlIngestionDecision,
    'duplicateScore' | 'slopScore' | 'provenanceScore' | 'sourceReputation'
  >
): CrawlIngestionDecision {
  const searchScoreMultiplier =
    admission === 'index'
      ? clamp(
          1 -
            signals.duplicateScore * 0.35 -
            signals.slopScore * 0.45 -
            (1 - signals.provenanceScore) * 0.15 -
            (1 - signals.sourceReputation) * 0.2,
          0.15,
          1
        )
      : 0

  return {
    admission,
    reasons: [...reasons],
    searchScoreMultiplier,
    ...signals
  }
}

function clamp01(value: number | undefined): number {
  return clamp(value ?? 0, 0, 1)
}

function normalizeReputation(value: number): number {
  return value > 1 ? clamp(value / 100, 0, 1) : clamp(value, 0, 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
