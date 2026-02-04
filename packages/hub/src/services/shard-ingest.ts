/**
 * @xnet/hub - Shard ingest router.
 */

import type { HubStorage } from '../storage/interface'
import type { ShardConfig, ShardRegistry } from './index-shards'
import { computeTermFreqs, tokenizeText } from './shard-utils'

export type IndexableDocument = {
  cid: string
  url?: string
  title: string
  body: string
  schema?: string
  author?: string
  language?: string
  tags?: string[]
  indexedAt: number
}

export type IngestResult = {
  cid: string
  termsExtracted: number
  shardsUpdated: number
  shardsTotal: number
}

export class ShardIngestRouter {
  constructor(
    private registry: ShardRegistry,
    private storage: HubStorage,
    private config: ShardConfig
  ) {}

  async ingest(doc: IndexableDocument): Promise<IngestResult> {
    const combinedTerms = tokenizeText(`${doc.title} ${doc.body}`)
    const uniqueTerms = Array.from(new Set(combinedTerms))
    const bodyTerms = tokenizeText(doc.body)
    const docLen = bodyTerms.length || uniqueTerms.length
    const termFreqs = computeTermFreqs(bodyTerms)

    const termsByShard = new Map<number, string[]>()
    for (const term of uniqueTerms) {
      const shard = this.registry.getShardForTerm(term)
      if (!shard) continue
      const list = termsByShard.get(shard.shardId) ?? []
      list.push(term)
      termsByShard.set(shard.shardId, list)
    }

    const results = await Promise.allSettled(
      Array.from(termsByShard.entries()).map(([shardId, terms]) =>
        this.sendToShard(shardId, doc, terms, termFreqs, docLen)
      )
    )

    const succeeded = results.filter((result) => result.status === 'fulfilled').length
    return {
      cid: doc.cid,
      termsExtracted: uniqueTerms.length,
      shardsUpdated: succeeded,
      shardsTotal: termsByShard.size
    }
  }

  async ingestShard(payload: {
    shardId: number
    doc: Omit<IndexableDocument, 'body'> & { body?: string }
    terms: string[]
    termFreqs: Record<string, number>
    docLen: number
  }): Promise<void> {
    const termFreqs = new Map(Object.entries(payload.termFreqs).map(([term, tf]) => [term, tf]))
    await this.indexLocally(payload.shardId, payload.doc, payload.terms, termFreqs, payload.docLen)
  }

  private async sendToShard(
    shardId: number,
    doc: IndexableDocument,
    terms: string[],
    termFreqs: Map<string, number>,
    docLen: number
  ): Promise<void> {
    const localShardIds = new Set(this.config.hostedShards)
    const assignment = this.registry.getAssignment(shardId)
    const isLocal = localShardIds.has(shardId)

    if (isLocal || assignment?.primaryHub.url === this.config.hubUrl) {
      await this.indexLocally(shardId, doc, terms, termFreqs, docLen)
      return
    }

    const target = assignment?.primaryHub.url
    if (!target) return

    await fetch(`${target}/shards/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shardId,
        doc: {
          cid: doc.cid,
          url: doc.url,
          title: doc.title,
          schema: doc.schema,
          author: doc.author,
          language: doc.language,
          indexedAt: doc.indexedAt
        },
        terms,
        termFreqs: Object.fromEntries(termFreqs),
        docLen
      })
    })
  }

  private async indexLocally(
    shardId: number,
    doc: Omit<IndexableDocument, 'body'> & { body?: string },
    terms: string[],
    termFreqs: Map<string, number>,
    docLen: number
  ): Promise<void> {
    for (const term of terms) {
      await this.storage.insertShardPosting({
        shardId,
        term,
        cid: doc.cid,
        tf: termFreqs.get(term) ?? 1,
        title: doc.title,
        url: doc.url,
        schema: doc.schema,
        author: doc.author,
        language: doc.language,
        indexedAt: doc.indexedAt,
        docLen
      })
    }

    await this.storage.recomputeShardTermStats(shardId, terms)
    const stats = await this.storage.getShardStats(shardId)
    await this.storage.updateShardDocCount(shardId, stats.totalDocs)
  }
}
