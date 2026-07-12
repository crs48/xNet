/**
 * Shard-ring grinding resistance (exploration 0305).
 *
 * The consistent-hash ring places hubs by `ringPosition(hubDid, epochNonce)` —
 * 128-bit and salted by a coordinator nonce. A hub operator controls their
 * `hubDid` but not the nonce, so they cannot grind a hubDid that durably
 * captures a target shard: re-salting per epoch re-randomises placement.
 */
import { describe, expect, it } from 'vitest'
import { ShardRebalancer } from '../src/services/shard-rebalancer'
import type { ShardAssignment, ShardConfig } from '../src/services/index-shards'
import { createMemoryStorage } from '../src/storage'

const baseConfig = (over: Partial<ShardConfig> = {}): ShardConfig => ({
  enabled: true,
  totalShards: 8,
  hostedShards: [],
  replicationFactor: 1,
  registryUrl: 'http://registry',
  maxDocsPerShard: 1000,
  ...over
})

const captureRegistry = () => {
  let last: ShardAssignment[] = []
  return {
    setAssignments: async (a: ShardAssignment[]) => {
      last = a
    },
    get: () => last
  }
}

/** Which hub owns each shard, keyed by shardId. */
const ownership = (assignments: ShardAssignment[]): Record<number, string> =>
  Object.fromEntries(assignments.map((a) => [a.shardId, a.primaryHub.hubDid]))

async function assignmentsFor(nonce: string, hubDids: string[]): Promise<Record<number, string>> {
  const storage = createMemoryStorage()
  const registry = captureRegistry()
  const rebalancer = new ShardRebalancer(
    baseConfig({ shardRingEpochNonce: nonce }),
    storage,
    registry
  )
  for (const hubDid of hubDids) {
    await rebalancer.registerHost({ hubDid, url: `http://${hubDid}`, capacity: 100 })
  }
  return ownership(registry.get())
}

describe('shard ring grinding resistance (0305)', () => {
  const honest = ['did:key:zHostA', 'did:key:zHostB', 'did:key:zHostC']

  it('re-salting per epoch re-randomises shard ownership (no persistent capture)', async () => {
    const epoch1 = await assignmentsFor('epoch-nonce-1', honest)
    const epoch2 = await assignmentsFor('epoch-nonce-2', honest)
    // The same hosts, but at least one shard changes owner across epochs — a
    // hubDid favourably placed in epoch 1 cannot be relied on in epoch 2.
    const shardIds = Object.keys(epoch1).map(Number)
    const changed = shardIds.some((id) => epoch1[id] !== epoch2[id])
    expect(changed).toBe(true)
  })

  it('a grinder blind to the epoch nonce cannot reliably capture a target shard', async () => {
    // Attacker grinds many vanity hubDids WITHOUT knowing the (secret) epoch
    // nonce, then the coordinator assigns with that nonce. Capturing a chosen
    // shard should be ~chance, not deterministic.
    const secretNonce = 'coordinator-secret-epoch-42'
    const TARGET_SHARD = 3
    let captures = 0
    const TRIES = 200
    for (let i = 0; i < TRIES; i += 1) {
      const attacker = `did:key:zGrind${i}`
      const owners = await assignmentsFor(secretNonce, [...honest, attacker])
      if (owners[TARGET_SHARD] === attacker) captures++
    }
    // With 4 hosts, chance capture of one shard is ~1/4. Assert it is nowhere
    // near deterministic — the 32-bit unsalted ring let a grinder hit 100%.
    expect(captures).toBeLessThan(TRIES * 0.6)
  })

  it('is deterministic for a fixed nonce + host set (convergent)', async () => {
    const a = await assignmentsFor('fixed', honest)
    const b = await assignmentsFor('fixed', honest)
    expect(a).toEqual(b)
  })
})
