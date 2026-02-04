/**
 * @xnet/hub - Hub federation search service.
 */

import type { HubStorage } from '../storage/interface'
import type { QueryRequest, QueryResponse } from './query'
import { createUCAN, hasCapability, verifyUCAN } from '@xnet/identity'
import { sign, verify } from '@xnet/crypto'
import { parseDID } from '@xnet/identity'
import { TextEncoder } from 'node:util'
import { QueryService } from './query'
import { validateExternalUrl } from '../utils/url'

export type FederationPeer = {
  url: string
  hubDid: string
  schemas: string[] | '*'
  trustLevel: 'full' | 'metadata'
  maxLatencyMs: number
  rateLimit: number
  healthy: boolean
  lastSuccessAt: number | null
}

export type FederationExpose = {
  schemas: string[] | '*'
  requireAuth: boolean
  rateLimit: number
  maxResults: number
}

export type FederationConfig = {
  enabled: boolean
  hubDid: string
  peers: FederationPeer[]
  expose: FederationExpose
  peerTimeoutMs: number
  totalTimeoutMs: number
  hubSigningKey?: Uint8Array
  getHubToken?: (audience: string) => Promise<string>
  openRegistration?: boolean
}

export type FederationQueryRequest = {
  queryId: string
  text?: string
  schema?: string
  filters?: Array<{
    field: string
    operator: 'eq' | 'contains' | 'gt' | 'lt'
    value: unknown
  }>
  limit: number
  auth: string
  fromHub: string
}

export type FederatedResult = {
  nodeId: string
  cid: string
  score: number
  title: string
  schema: string
  snippet?: string
  author: string
  updatedAt: number
  sourceHub: string
}

export type FederationQueryResponse = {
  queryId: string
  results: FederatedResult[]
  totalEstimate: number
  executionMs: number
  hubDid: string
  signature: string
}

type RateLimiterState = { count: number; resetAt: number }

const encodeForSignature = (response: Omit<FederationQueryResponse, 'signature'>): Uint8Array => {
  const encoder = new TextEncoder()
  return encoder.encode(JSON.stringify(response))
}

const toBase64 = (data: Uint8Array): string => Buffer.from(data).toString('base64')

const fromBase64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'))

export class FederationService {
  private rateLimiters = new Map<string, RateLimiterState>()

  constructor(
    public readonly config: FederationConfig,
    private storage: HubStorage,
    private queryService: QueryService
  ) {}

  async loadPeers(): Promise<void> {
    const stored = await this.storage.listFederationPeers()
    if (stored.length === 0) return
    const merged = new Map<string, FederationPeer>()

    for (const peer of this.config.peers) {
      merged.set(peer.hubDid, peer)
    }

    for (const peer of stored) {
      merged.set(peer.hubDid, {
        url: peer.url,
        hubDid: peer.hubDid,
        schemas: peer.schemas,
        trustLevel: peer.trustLevel,
        maxLatencyMs: peer.maxLatencyMs,
        rateLimit: peer.rateLimit,
        healthy: peer.healthy,
        lastSuccessAt: peer.lastSuccessAt
      })
    }

    this.config.peers = Array.from(merged.values())
  }

  async registerPeer(peer: FederationPeer, registeredBy?: string | null): Promise<FederationPeer> {
    const urlCheck = validateExternalUrl(peer.url)
    if (!urlCheck.valid) {
      throw new Error(`Invalid peer URL: ${urlCheck.error}`)
    }

    const entry = {
      hubDid: peer.hubDid,
      url: peer.url,
      schemas: peer.schemas,
      trustLevel: peer.trustLevel,
      maxLatencyMs: peer.maxLatencyMs,
      rateLimit: peer.rateLimit,
      healthy: peer.healthy,
      lastSuccessAt: peer.lastSuccessAt,
      registeredAt: Date.now(),
      registeredBy: registeredBy ?? null
    }

    await this.storage.upsertFederationPeer(entry)

    const existing = this.config.peers.find((item) => item.hubDid === peer.hubDid)
    if (existing) {
      Object.assign(existing, peer)
      return existing
    }

    this.config.peers.push(peer)
    return peer
  }

  async search(request: QueryRequest & { federate?: boolean }): Promise<QueryResponse> {
    const start = Date.now()
    const results: FederatedResult[] = []

    const localResponse = await this.queryService.handleQuery(request)
    results.push(
      ...localResponse.results.map((result) => ({
        nodeId: result.docId,
        cid: result.docId,
        score: Number.isFinite(result.rank) ? result.rank : 1,
        title: result.title,
        schema: result.schemaIri ?? '',
        snippet: result.snippet,
        author: '',
        updatedAt: Date.now(),
        sourceHub: 'local'
      }))
    )

    if (this.config.enabled && request.federate !== false) {
      const fedResults = await this.queryPeers(request)
      results.push(...fedResults)
    }

    const deduped = this.deduplicateByCid(results)
    const ranked = this.reciprocalRankFusion(deduped)
    const responseResults = ranked.map((result) => ({
      docId: result.nodeId,
      title: result.title,
      schemaIri: result.schema,
      snippet: result.snippet ?? '',
      rank: result.score,
      cid: result.cid,
      sourceHub: result.sourceHub,
      author: result.author,
      updatedAt: result.updatedAt
    }))

    return {
      type: 'query-response',
      id: request.id,
      results: responseResults.slice(0, request.limit ?? 20),
      total: responseResults.length,
      took: Date.now() - start
    }
  }

  async handleIncomingQuery(request: FederationQueryRequest): Promise<FederationQueryResponse> {
    const start = Date.now()

    if (this.config.expose.requireAuth) {
      const verification = verifyUCAN(request.auth)
      if (!verification.valid || !verification.payload) {
        throw new Error('Invalid federation UCAN')
      }
      if (verification.payload.aud !== this.config.hubDid) {
        throw new Error('Invalid federation UCAN')
      }
      if (!hasCapability(verification.payload, '*', 'federation/query')) {
        throw new Error('Invalid federation UCAN')
      }
    }

    if (!this.checkRateLimit(request.fromHub, this.config.expose.rateLimit)) {
      throw new Error('Rate limited')
    }

    const schemaAllowed =
      this.config.expose.schemas === '*' ||
      !request.schema ||
      this.config.expose.schemas.includes(request.schema)

    let results: FederatedResult[] = []
    let totalEstimate = 0

    if (schemaAllowed) {
      const queryRequest: QueryRequest = {
        type: 'query-request',
        id: request.queryId,
        query: request.text ?? '',
        filters: { schemaIri: request.schema },
        limit: Math.min(request.limit, this.config.expose.maxResults)
      }

      const localResults = await this.queryService.handleQuery(queryRequest)

      results = localResults.results.map((result) => ({
        nodeId: result.docId,
        cid: result.docId,
        score: Number.isFinite(result.rank) ? result.rank : 0,
        title: result.title,
        schema: result.schemaIri ?? '',
        snippet: result.snippet,
        author: '',
        updatedAt: Date.now(),
        sourceHub: this.config.hubDid
      }))
      totalEstimate = localResults.total
    }

    const response: FederationQueryResponse = {
      queryId: request.queryId,
      results,
      totalEstimate,
      executionMs: Date.now() - start,
      hubDid: this.config.hubDid,
      signature: ''
    }

    response.signature = await this.signResponse(response)
    await this.logQuery(request, response)

    return response
  }

  private async queryPeers(request: QueryRequest): Promise<FederatedResult[]> {
    const eligiblePeers = this.config.peers.filter((peer) => {
      if (!peer.healthy) return false
      if (peer.schemas !== '*' && request.filters?.schemaIri) {
        return peer.schemas.includes(request.filters.schemaIri)
      }
      return true
    })

    if (eligiblePeers.length === 0) return []

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.totalTimeoutMs)

    try {
      const promises = eligiblePeers.map((peer) =>
        this.queryPeer(peer, request, controller.signal).catch(() => [] as FederatedResult[])
      )
      const settled = await Promise.allSettled(promises)
      return settled
        .filter((entry) => entry.status === 'fulfilled')
        .flatMap((entry) => (entry as PromiseFulfilledResult<FederatedResult[]>).value)
    } finally {
      clearTimeout(timeout)
    }
  }

  private async queryPeer(
    peer: FederationPeer,
    request: QueryRequest,
    signal: AbortSignal
  ): Promise<FederatedResult[]> {
    if (!this.checkRateLimit(peer.url, peer.rateLimit)) {
      return []
    }

    const fedRequest: FederationQueryRequest = {
      queryId: request.id,
      text: request.query,
      schema: request.filters?.schemaIri,
      limit: Math.min(request.limit ?? 20, peer.trustLevel === 'full' ? 50 : 20),
      auth: await this.generateHubUCAN(peer.hubDid),
      fromHub: this.config.hubDid
    }

    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    const peerTimeoutMs = Math.min(peer.maxLatencyMs, this.config.peerTimeoutMs)
    const peerTimeout = setTimeout(() => controller.abort(), peerTimeoutMs)

    try {
      const response = await fetch(`${peer.url}/federation/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fedRequest),
        signal: controller.signal
      })

      clearTimeout(peerTimeout)
      signal.removeEventListener('abort', onAbort)

      if (!response.ok) {
        this.markPeerUnhealthy(peer)
        return []
      }

      const fedResponse = (await response.json()) as FederationQueryResponse

      if (!this.verifyResponseSignature(fedResponse, peer.hubDid)) {
        this.markPeerUnhealthy(peer)
        return []
      }

      await this.markPeerHealthy(peer)

      return fedResponse.results
    } catch (error) {
      clearTimeout(peerTimeout)
      signal.removeEventListener('abort', onAbort)
      if ((error as Error).name !== 'AbortError') {
        this.markPeerUnhealthy(peer)
      }
      return []
    }
  }

  private deduplicateByCid(results: FederatedResult[]): FederatedResult[] {
    const seen = new Map<string, FederatedResult>()
    for (const result of results) {
      const existing = seen.get(result.cid)
      if (!existing || result.score > existing.score) {
        seen.set(result.cid, result)
      }
    }
    return [...seen.values()]
  }

  private reciprocalRankFusion(results: FederatedResult[], k = 60): FederatedResult[] {
    const bySource = new Map<string, FederatedResult[]>()
    for (const result of results) {
      const list = bySource.get(result.sourceHub) ?? []
      list.push(result)
      bySource.set(result.sourceHub, list)
    }

    for (const list of bySource.values()) {
      list.sort((a, b) => b.score - a.score)
    }

    const rrfScores = new Map<string, number>()
    for (const [, list] of bySource) {
      for (let rank = 0; rank < list.length; rank++) {
        const current = rrfScores.get(list[rank].cid) ?? 0
        rrfScores.set(list[rank].cid, current + 1 / (k + rank + 1))
      }
    }

    return results
      .map((result) => ({ ...result, score: rrfScores.get(result.cid) ?? 0 }))
      .sort((a, b) => b.score - a.score)
  }

  private checkRateLimit(key: string, maxPerMinute: number): boolean {
    const now = Date.now()
    const limiter = this.rateLimiters.get(key)
    if (!limiter || now > limiter.resetAt) {
      // Prune expired entries periodically to prevent unbounded growth
      if (this.rateLimiters.size > 1000) {
        for (const [k, v] of this.rateLimiters) {
          if (now > v.resetAt) this.rateLimiters.delete(k)
        }
      }
      this.rateLimiters.set(key, { count: 1, resetAt: now + 60_000 })
      return true
    }
    if (limiter.count >= maxPerMinute) return false
    limiter.count++
    return true
  }

  private markPeerUnhealthy(peer: FederationPeer): void {
    peer.healthy = false
    void this.storage.updateFederationPeerHealth(peer.hubDid, false, peer.lastSuccessAt ?? null)
    setTimeout(() => {
      peer.healthy = true
      void this.storage.updateFederationPeerHealth(peer.hubDid, true, peer.lastSuccessAt ?? null)
    }, 60_000)
  }

  private async markPeerHealthy(peer: FederationPeer): Promise<void> {
    peer.lastSuccessAt = Date.now()
    peer.healthy = true
    await this.storage.updateFederationPeerHealth(peer.hubDid, true, peer.lastSuccessAt)
  }

  private async generateHubUCAN(audience: string): Promise<string> {
    if (this.config.getHubToken) {
      return this.config.getHubToken(audience)
    }
    if (!this.config.hubSigningKey) return ''

    return createUCAN({
      issuer: this.config.hubDid,
      issuerKey: this.config.hubSigningKey,
      audience,
      capabilities: [{ with: '*', can: 'federation/query' }],
      expiration: Math.floor(Date.now() / 1000) + 5 * 60
    })
  }

  private verifyResponseSignature(response: FederationQueryResponse, expectedDid: string): boolean {
    if (response.hubDid !== expectedDid) return false
    if (!response.signature) return false

    try {
      const publicKey = parseDID(response.hubDid)
      const payload = { ...response, signature: '' }
      const message = encodeForSignature({
        queryId: payload.queryId,
        results: payload.results,
        totalEstimate: payload.totalEstimate,
        executionMs: payload.executionMs,
        hubDid: payload.hubDid
      })
      return verify(message, fromBase64(response.signature), publicKey)
    } catch {
      return false
    }
  }

  private async signResponse(response: FederationQueryResponse): Promise<string> {
    if (!this.config.hubSigningKey) return ''

    const payload = {
      queryId: response.queryId,
      results: response.results,
      totalEstimate: response.totalEstimate,
      executionMs: response.executionMs,
      hubDid: response.hubDid
    }
    const signature = sign(encodeForSignature(payload), this.config.hubSigningKey)
    return toBase64(signature)
  }

  private async logQuery(
    request: FederationQueryRequest,
    response: FederationQueryResponse
  ): Promise<void> {
    await this.storage.logFederationQuery({
      queryId: request.queryId,
      fromHub: request.fromHub,
      queryText: request.text ?? '',
      schemaFilter: request.schema ?? null,
      resultCount: response.results.length,
      executionMs: response.executionMs,
      timestamp: Date.now()
    })
  }
}
