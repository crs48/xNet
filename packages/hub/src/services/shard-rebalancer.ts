/**
 * @xnetjs/hub - Shard rebalancer (consistent hashing).
 */

import type { ShardAssignment, ShardConfig } from './index-shards'
import type { HubStorage, ShardHostRecord } from '../storage/interface'
import { TextEncoder } from 'node:util'
import { hash } from '@xnetjs/crypto'

const encoder = new TextEncoder()

/**
 * A hub's (or shard's) position on the consistent-hash ring (exploration 0305).
 *
 * Previously `blake3(hubDid)` truncated to **32 bits** with no salt — a hub
 * operator controls their own `hubDid`, so grinding one to land immediately
 * after a target `shard:N` position (thus capturing that shard) was trivial in
 * a 32-bit space. Two changes close it:
 *
 * 1. **128 bits** — the first 16 blake3 bytes as a big-endian bigint, so hitting
 *    a chosen ring arc is birthday-infeasible.
 * 2. **A coordinator epoch nonce** the operator does not control salts the hash.
 *    Because the ring is recomputed each epoch with a fresh nonce, a hubDid that
 *    lands favourably this epoch is re-randomised next epoch — defeating
 *    *persistent* targeted capture even if a single epoch's nonce leaks.
 */
const ringPosition = (value: string, epochNonce: string): bigint => {
  const digest = hash(encoder.encode(`${epochNonce}\x1f${value}`), 'blake3')
  let acc = 0n
  for (let i = 0; i < 16; i += 1) acc = (acc << 8n) | BigInt(digest[i])
  return acc
}

const computeRange = (shardId: number, totalShards: number): { start: number; end: number } => {
  const bucket = Math.floor(256 / totalShards)
  const start = shardId * bucket
  const end = shardId === totalShards - 1 ? 255 : start + bucket - 1
  return { start, end }
}

type RingHost = { host: ShardHostRecord; hash: bigint }

const buildRing = (hosts: ShardHostRecord[], epochNonce: string): RingHost[] =>
  hosts
    .map((host) => ({ host, hash: ringPosition(host.hubDid, epochNonce) }))
    .sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0))

const pickHost = (ring: RingHost[], shardHash: bigint): ShardHostRecord | null => {
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

    const epochNonce = this.config.shardRingEpochNonce ?? ''
    const ring = buildRing(hosts, epochNonce)
    const assignments: ShardAssignment[] = []

    for (let shardId = 0; shardId < this.config.totalShards; shardId += 1) {
      const shardHash = ringPosition(`shard:${shardId}`, epochNonce)
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
