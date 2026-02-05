/**
 * @xnet/hub - Shard rebalancer (consistent hashing).
 */

import type { HubStorage, ShardHostRecord } from '../storage/interface'
import type { ShardAssignment, ShardConfig } from './index-shards'
import { hash } from '@xnet/crypto'
import { TextEncoder } from 'node:util'

const encoder = new TextEncoder()

const hashToUint32 = (value: string): number => {
  const digest = hash(encoder.encode(value), 'blake3')
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength)
  return view.getUint32(0, false)
}

const computeRange = (shardId: number, totalShards: number): { start: number; end: number } => {
  const bucket = Math.floor(256 / totalShards)
  const start = shardId * bucket
  const end = shardId === totalShards - 1 ? 255 : start + bucket - 1
  return { start, end }
}

type RingHost = { host: ShardHostRecord; hash: number }

const buildRing = (hosts: ShardHostRecord[]): RingHost[] =>
  hosts.map((host) => ({ host, hash: hashToUint32(host.hubDid) })).sort((a, b) => a.hash - b.hash)

const pickHost = (ring: RingHost[], shardHash: number): ShardHostRecord | null => {
  if (ring.length === 0) return null
  const found = ring.find((entry) => entry.hash >= shardHash)
  return (found ?? ring[0]).host
}

export class ShardRebalancer {
  constructor(
    private config: ShardConfig,
    private storage: HubStorage,
    private registry: { setAssignments: (assignments: ShardAssignment[]) => Promise<void> }
  ) {}

  async registerHost(input: {
    hubDid: string
    url: string
    capacity: number
  }): Promise<ShardAssignment[]> {
    const now = Date.now()
    const host: ShardHostRecord = {
      hubDid: input.hubDid,
      url: input.url,
      capacity: input.capacity,
      registeredAt: now,
      lastSeen: now
    }
    await this.storage.upsertShardHost(host)
    return this.rebalance()
  }

  async removeHost(hubDid: string): Promise<ShardAssignment[]> {
    await this.storage.removeShardHost(hubDid)
    return this.rebalance()
  }

  async rebalance(): Promise<ShardAssignment[]> {
    const hosts = await this.storage.listShardHosts()
    if (hosts.length === 0) {
      await this.registry.setAssignments([])
      return []
    }

    const ring = buildRing(hosts)
    const assignments: ShardAssignment[] = []

    for (let shardId = 0; shardId < this.config.totalShards; shardId += 1) {
      const shardHash = hashToUint32(`shard:${shardId}`)
      const primary = pickHost(ring, shardHash)
      if (!primary) continue

      const range = computeRange(shardId, this.config.totalShards)
      const primaryIndex = ring.findIndex((entry) => entry.host.hubDid === primary.hubDid)
      const replica =
        this.config.replicationFactor > 1 && ring.length > 1
          ? ring[(primaryIndex + 1) % ring.length]?.host
          : null

      assignments.push({
        shardId,
        rangeStart: range.start,
        rangeEnd: range.end,
        primaryHub: { url: primary.url, hubDid: primary.hubDid },
        replicaHub: replica ? { url: replica.url, hubDid: replica.hubDid } : undefined,
        docCount: 0,
        updatedAt: Date.now()
      })
    }

    await this.registry.setAssignments(assignments)
    return assignments
  }
}
