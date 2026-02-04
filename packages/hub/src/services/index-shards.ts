/**
 * @xnet/hub - Global shard registry (consistent hashing).
 */

import type { HubStorage, ShardAssignmentRecord } from '../storage/interface'
import { hash } from '@xnet/crypto'
import { TextEncoder } from 'node:util'

export interface ShardAssignment {
  shardId: number
  rangeStart: number
  rangeEnd: number
  primaryHub: { url: string; hubDid: string }
  replicaHub?: { url: string; hubDid: string }
  docCount: number
  updatedAt: number
}

export interface ShardConfig {
  enabled: boolean
  totalShards: number
  hostedShards: number[]
  replicationFactor: number
  registryUrl: string
  maxDocsPerShard: number
  hubDid?: string
  hubUrl?: string
  isRegistry?: boolean
  refreshIntervalMs?: number
}

const encoder = new TextEncoder()

const toAssignment = (record: ShardAssignmentRecord): ShardAssignment => ({
  shardId: record.shardId,
  rangeStart: record.rangeStart,
  rangeEnd: record.rangeEnd,
  primaryHub: { url: record.primaryUrl, hubDid: record.primaryDid },
  replicaHub:
    record.replicaUrl && record.replicaDid
      ? { url: record.replicaUrl, hubDid: record.replicaDid }
      : undefined,
  docCount: record.docCount,
  updatedAt: record.updatedAt
})

const toRecord = (assignment: ShardAssignment): ShardAssignmentRecord => ({
  shardId: assignment.shardId,
  rangeStart: assignment.rangeStart,
  rangeEnd: assignment.rangeEnd,
  primaryUrl: assignment.primaryHub.url,
  primaryDid: assignment.primaryHub.hubDid,
  replicaUrl: assignment.replicaHub?.url ?? null,
  replicaDid: assignment.replicaHub?.hubDid ?? null,
  docCount: assignment.docCount,
  updatedAt: assignment.updatedAt
})

const computeRange = (shardId: number, totalShards: number): { start: number; end: number } => {
  const bucket = Math.floor(256 / totalShards)
  const start = shardId * bucket
  const end = shardId === totalShards - 1 ? 255 : start + bucket - 1
  return { start, end }
}

const hashTerm = (term: string): number => {
  const normalized = term.toLowerCase().trim()
  const digest = hash(encoder.encode(normalized), 'blake3')
  return digest[0] ?? 0
}

export class ShardRegistry {
  private assignments: ShardAssignment[] = []
  private refreshInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    private config: ShardConfig,
    private storage: HubStorage
  ) {}

  async init(): Promise<void> {
    const cached = await this.storage.listShardAssignments()
    if (cached.length > 0) {
      this.assignments = cached.map(toAssignment)
    }

    if (this.config.isRegistry) {
      if (this.assignments.length === 0 && this.config.hubDid && this.config.hubUrl) {
        const seeded = this.seedAssignments(this.config.hubDid, this.config.hubUrl)
        await this.setAssignments(seeded)
      }
      return
    }

    await this.refresh()
    const interval = this.config.refreshIntervalMs ?? 5 * 60_000
    this.refreshInterval = setInterval(() => {
      void this.refresh()
    }, interval)
  }

  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
      this.refreshInterval = null
    }
  }

  async refresh(): Promise<void> {
    if (!this.config.registryUrl) return
    try {
      const response = await fetch(`${this.config.registryUrl}/shards/assignments`)
      if (!response.ok) return
      const records = (await response.json()) as ShardAssignmentRecord[]
      if (!Array.isArray(records)) return
      this.assignments = records.map(toAssignment)
      await this.storage.replaceShardAssignments(records)
    } catch {
      // Use cached assignments if registry unreachable
    }
  }

  async setAssignments(assignments: ShardAssignment[]): Promise<void> {
    this.assignments = assignments
    await this.storage.replaceShardAssignments(assignments.map(toRecord))
  }

  getAssignments(): ShardAssignment[] {
    return [...this.assignments]
  }

  getAssignment(shardId: number): ShardAssignment | null {
    return this.assignments.find((assignment) => assignment.shardId === shardId) ?? null
  }

  getShardForTerm(term: string): ShardAssignment | null {
    if (this.assignments.length === 0) return null
    const shardId = hashTerm(term) % this.config.totalShards
    return this.assignments.find((assignment) => assignment.shardId === shardId) ?? null
  }

  getShardsForQuery(terms: string[]): ShardAssignment[] {
    const seen = new Set<number>()
    const shards: ShardAssignment[] = []
    for (const term of terms) {
      const shard = this.getShardForTerm(term)
      if (!shard || seen.has(shard.shardId)) continue
      seen.add(shard.shardId)
      shards.push(shard)
    }
    return shards
  }

  getLocalShards(): ShardAssignment[] {
    const hosted = new Set(this.config.hostedShards)
    return this.assignments.filter((assignment) => hosted.has(assignment.shardId))
  }

  private seedAssignments(hubDid: string, hubUrl: string): ShardAssignment[] {
    const assignments: ShardAssignment[] = []
    for (let shardId = 0; shardId < this.config.totalShards; shardId += 1) {
      const range = computeRange(shardId, this.config.totalShards)
      assignments.push({
        shardId,
        rangeStart: range.start,
        rangeEnd: range.end,
        primaryHub: { url: hubUrl, hubDid },
        replicaHub: undefined,
        docCount: 0,
        updatedAt: Date.now()
      })
    }
    return assignments
  }
}
