/**
 * @xnetjs/hub - Shard query router with BM25 scoring.
 */

import type { ShardAssignment, ShardConfig, ShardRegistry } from './index-shards'
import type { HubStorage, ShardPosting, ShardTermStat } from '../storage/interface'
import { tokenizeText } from './shard-utils'

export type GlobalSearchRequest = {
  queryId: string
  text: string
  limit?: number
}

export type ShardQueryResult = {
  cid: string
  title: string
  url?: string
  schema?: string
  author?: string
  language?: string
  indexedAt: number
  score: number
  shardId: number
  sourceHub: string
}

export type GlobalSearchResponse = {
  queryId: string
  results: ShardQueryResult[]
  took: number
}

export class ShardQueryRouter {
  constructor(
    private registry: ShardRegistry,
    private storage: HubStorage,
    private config: ShardConfig
  ) {}

  async search(request: GlobalSearchRequest): Promise<GlobalSearchResponse> {
    const start = Date.now()
    const terms = tokenizeText(request.text)
    if (terms.length === 0) {
      return { queryId: request.queryId, results: [], took: 0 }
    }

    const shards = this.registry.getShardsForQuery(terms)
    const results = await Promise.allSettled(
      shards.map((shard) => this.queryShardHost(shard, terms, request.limit ?? 20))
    )

    const merged = results
      .filter((result) => result.status === 'fulfilled')
      .flatMap((result) => (result as PromiseFulfilledResult<ShardQueryResult[]>).value)

    const deduped = this.dedupeByCid(merged)

    return {
      queryId: request.queryId,
      results: deduped.sort((a, b) => b.score - a.score).slice(0, request.limit ?? 20),
      took: Date.now() - start
    }
  }

  async queryShard(shardId: number, terms: string[], limit: number): Promise<ShardQueryResult[]> {
    return this.queryLocalShard(shardId, terms, limit)
  }

  private async queryShardHost(
    shard: ShardAssignment,
    terms: string[],
    limit: number
  ): Promise<ShardQueryResult[]> {
    const localShardIds = new Set(this.config.hostedShards)
    if (localShardIds.has(shard.shardId)) {
      return this.queryLocalShard(shard.shardId, terms, limit)
    }

    const primary = await this.queryRemoteShard(shard.primaryHub.url, shard.shardId, terms, limit)
    if (primary.length > 0) return primary

    if (shard.replicaHub) {
      return this.queryRemoteShard(shard.replicaHub.url, shard.shardId, terms, limit)
    }

    return []
  }

  private async queryRemoteShard(
    baseUrl: string,
    shardId: number,
    terms: string[],
    limit: number
  ): Promise<ShardQueryResult[]> {
    try {
      const response = await fetch(`${baseUrl}/shards/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shardId, terms, limit })
      })
      if (!response.ok) return []
      const payload = (await response.json()) as { results?: ShardQueryResult[] }
      return Array.isArray(payload.results) ? payload.results : []
    } catch {
      return []
    }
  }

  private async queryLocalShard(
    shardId: number,
    terms: string[],
    limit: number
  ): Promise<ShardQueryResult[]> {
    const postings = await this.storage.listShardPostings(shardId, terms)
    if (postings.length === 0) return []

    const termStats = await this.storage.getShardTermStats(shardId, terms)
    const stats = await this.storage.getShardStats(shardId)

    const scores = this.computeBm25Scores(postings, termStats, stats.totalDocs, stats.avgDocLen)

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((result) => ({
        ...result,
        shardId,
        sourceHub: this.config.hubUrl ?? 'local'
      }))
  }

  private computeBm25Scores(
    postings: ShardPosting[],
    termStats: ShardTermStat[],
    totalDocs: number,
    avgDocLen: number,
    k1 = 1.2,
    b = 0.75
  ): Array<Omit<ShardQueryResult, 'shardId' | 'sourceHub'>> {
    const termFreqMap = new Map<string, Map<string, number>>()
    const docMeta = new Map<
      string,
      {
        docLen: number
        title: string
        url?: string
        schema?: string
        author?: string
        language?: string
        indexedAt: number
      }
    >()

    for (const posting of postings) {
      const termMap = termFreqMap.get(posting.term) ?? new Map<string, number>()
      termMap.set(posting.cid, posting.tf)
      termFreqMap.set(posting.term, termMap)
      if (!docMeta.has(posting.cid)) {
        docMeta.set(posting.cid, {
          docLen: posting.docLen,
          title: posting.title,
          url: posting.url,
          schema: posting.schema,
          author: posting.author,
          language: posting.language,
          indexedAt: posting.indexedAt
        })
      }
    }

    const avgLen = avgDocLen > 0 ? avgDocLen : 1
    const idfByTerm = new Map<string, number>()
    for (const stat of termStats) {
      const df = stat.docFreq
      const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5))
      idfByTerm.set(stat.term, idf)
    }

    const scores = new Map<string, number>()
    for (const [term, docs] of termFreqMap.entries()) {
      const idf = idfByTerm.get(term) ?? 0
      for (const [cid, tf] of docs.entries()) {
        const meta = docMeta.get(cid)
        if (!meta) continue
        const numerator = tf * (k1 + 1)
        const denominator = tf + k1 * (1 - b + b * (meta.docLen / avgLen))
        const score = idf * (denominator === 0 ? 0 : numerator / denominator)
        scores.set(cid, (scores.get(cid) ?? 0) + score)
      }
    }

    return Array.from(scores.entries()).map(([cid, score]) => {
      const meta = docMeta.get(cid)
      return {
        cid,
        score,
        title: meta?.title ?? '',
        url: meta?.url,
        schema: meta?.schema,
        author: meta?.author,
        language: meta?.language,
        indexedAt: meta?.indexedAt ?? 0
      }
    })
  }

  private dedupeByCid(results: ShardQueryResult[]): ShardQueryResult[] {
    const byCid = new Map<string, ShardQueryResult>()
    for (const result of results) {
      const existing = byCid.get(result.cid)
      if (!existing || result.score > existing.score) {
        byCid.set(result.cid, result)
      }
    }
    return Array.from(byCid.values())
  }
}
