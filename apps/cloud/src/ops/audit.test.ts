import { describe, expect, it } from 'vitest'
import { InMemoryDocStore } from '../stores/durable'
import {
  AuditLog,
  AuditWriteError,
  ReasonRequiredError,
  audited,
  requiresReason,
  type AuditEntry,
  type AuditPublisher
} from './audit'

const T0 = Date.UTC(2026, 6, 1)

function setup(publisher?: AuditPublisher) {
  const docs = new InMemoryDocStore<AuditEntry>()
  let t = T0
  const log = new AuditLog({
    docs,
    ...(publisher ? { publisher } : {}),
    nowMs: () => (t += 1000)
  })
  return { docs, log }
}

const okPublisher = (): { publisher: AuditPublisher; seen: AuditEntry[] } => {
  const seen: AuditEntry[] = []
  return { publisher: { publish: async (e) => void seen.push(e) }, seen }
}

const deadPublisher: AuditPublisher = {
  publish: async () => {
    throw new Error('ops hub unreachable')
  }
}

describe('requiresReason', () => {
  it('demands a reason for mutations and not for reads', () => {
    expect(requiresReason('tenant.recover')).toBe(true)
    expect(requiresReason('tenant.delete-data')).toBe(true)
    expect(requiresReason('operator.bind')).toBe(true)
    expect(requiresReason('tenant.read')).toBe(false)
  })
})

describe('AuditLog', () => {
  it('records a read without a reason', async () => {
    const { publisher, seen } = okPublisher()
    const { log } = setup(publisher)
    const e = await log.append({
      operator: 'user_1',
      action: 'tenant.read',
      tenantId: 't_a',
      outcome: 'ok'
    })
    expect(e.entryId).toMatch(/^\d{16}-\d{6}$/)
    expect(seen).toHaveLength(1)
  })

  it('refuses a mutation with no reason', async () => {
    const { log } = setup()
    await expect(
      log.append({
        operator: 'user_1',
        action: 'tenant.recover',
        tenantId: 't_a',
        outcome: 'started'
      })
    ).rejects.toBeInstanceOf(ReasonRequiredError)
  })

  it('refuses a mutation whose reason is only whitespace', async () => {
    const { log } = setup()
    await expect(
      log.append({
        operator: 'user_1',
        action: 'tenant.recover',
        tenantId: 't_a',
        reason: '   ',
        outcome: 'started'
      })
    ).rejects.toBeInstanceOf(ReasonRequiredError)
  })

  it('marks entries published once the ops hub confirms', async () => {
    const { publisher } = okPublisher()
    const { docs, log } = setup(publisher)
    const e = await log.append({
      operator: 'user_1',
      action: 'tenant.read',
      tenantId: 't_a',
      outcome: 'ok'
    })
    expect((await docs.get(e.entryId))?.published).toBe(true)
    expect(log.pendingCount()).toBe(0)
  })

  // ADR-31: an unreachable ops hub degrades to "audit history is stale", never to
  // "no operator can act". The gap must be visible, which is what the queue is for.
  it('still records, and queues visibly, when the ops hub is unreachable', async () => {
    const { docs, log } = setup(deadPublisher)
    const e = await log.append({
      operator: 'user_1',
      action: 'tenant.read',
      tenantId: 't_a',
      outcome: 'ok'
    })
    expect(await docs.get(e.entryId)).not.toBeNull() // tier 1 landed
    expect((await docs.get(e.entryId))?.published).toBeUndefined()
    expect(log.pendingCount()).toBe(1)
  })

  it('drains the queue when the hub comes back', async () => {
    const docs = new InMemoryDocStore<AuditEntry>()
    let alive = false
    const publisher: AuditPublisher = {
      publish: async () => {
        if (!alive) throw new Error('down')
      }
    }
    const log = new AuditLog({ docs, publisher, nowMs: () => T0 })
    await log.append({ operator: 'u', action: 'tenant.read', tenantId: 't', outcome: 'ok' })
    await log.append({ operator: 'u', action: 'tenant.read', tenantId: 't', outcome: 'ok' })
    expect(log.pendingCount()).toBe(2)

    alive = true
    expect(await log.drain()).toBe(2)
    expect(log.pendingCount()).toBe(0)
  })

  it('keeps entries queued if the drain itself fails', async () => {
    const { log } = setup(deadPublisher)
    await log.append({ operator: 'u', action: 'tenant.read', tenantId: 't', outcome: 'ok' })
    expect(await log.drain()).toBe(0)
    expect(log.pendingCount()).toBe(1)
  })

  // The fail-closed gate: no tier-1 write, no action.
  it('throws AuditWriteError when the tier-1 store rejects', async () => {
    const docs = new InMemoryDocStore<AuditEntry>()
    docs.put = async () => {
      throw new Error('firestore down')
    }
    const log = new AuditLog({ docs, nowMs: () => T0 })
    await expect(
      log.append({ operator: 'u', action: 'tenant.read', tenantId: 't', outcome: 'ok' })
    ).rejects.toBeInstanceOf(AuditWriteError)
  })

  it('reads a tenant history in chronological order', async () => {
    const { log } = setup()
    for (const outcome of ['started', 'ok'] as const) {
      await log.append({ operator: 'u', action: 'tenant.read', tenantId: 't_a', outcome })
    }
    await log.append({ operator: 'u', action: 'tenant.read', tenantId: 't_b', outcome: 'ok' })
    const history = await log.forTenant('t_a')
    expect(history.map((e) => e.outcome)).toEqual(['started', 'ok'])
  })

  it('reads an operator history', async () => {
    const { log } = setup()
    await log.append({ operator: 'u1', action: 'tenant.read', tenantId: 't', outcome: 'ok' })
    await log.append({ operator: 'u2', action: 'tenant.read', tenantId: 't', outcome: 'ok' })
    expect(await log.byOperator('u1')).toHaveLength(1)
  })
})

describe('audited', () => {
  it('writes started BEFORE the action runs', async () => {
    const { docs, log } = setup()
    let sawDuringRun = 0
    await audited(
      log,
      { operator: 'u', action: 'tenant.recover', tenantId: 't_a', reason: 'lost passkey' },
      async () => {
        sawDuringRun = (await docs.list()).length
      }
    )
    expect(sawDuringRun).toBe(1) // the `started` entry was already durable
    expect((await log.forTenant('t_a')).map((e) => e.outcome)).toEqual(['started', 'ok'])
  })

  it('still leaves a started entry when the action throws, and rethrows', async () => {
    const { log } = setup()
    await expect(
      audited(
        log,
        { operator: 'u', action: 'tenant.delete-data', tenantId: 't_a', reason: 'user request' },
        async () => {
          throw new Error('provisioner exploded')
        }
      )
    ).rejects.toThrow('provisioner exploded')
    const history = await log.forTenant('t_a')
    expect(history.map((e) => e.outcome)).toEqual(['started', 'failed'])
    expect(history[1].parentId).toBe(history[0].entryId)
  })

  it('refuses to run the action at all when no reason is given', async () => {
    const { log } = setup()
    let ran = false
    await expect(
      audited(log, { operator: 'u', action: 'tenant.recover', tenantId: 't_a' }, async () => {
        ran = true
      })
    ).rejects.toBeInstanceOf(ReasonRequiredError)
    expect(ran).toBe(false)
  })

  it('carries the operator DID onto every entry for later verification', async () => {
    const { log } = setup()
    await audited(
      log,
      {
        operator: 'u',
        operatorDid: 'did:key:zOps',
        action: 'tenant.plan-change',
        tenantId: 't_a',
        reason: 'support escalation'
      },
      async () => undefined
    )
    const history = await log.forTenant('t_a')
    expect(history.every((e) => e.operatorDid === 'did:key:zOps')).toBe(true)
  })
})

describe('retention (decision 15)', () => {
  // Audit survives tenant deletion ON PURPOSE, and it is pro-user: if the record
  // vanished with the account, an operator could read someone's data and then
  // erase the evidence by deleting them. The data goes; the log of who touched it
  // stays. Nothing in the audit path is keyed to tenant lifecycle, and this test
  // exists so that stays true.
  it('keeps a tenant history after every trace of that tenant is deleted', async () => {
    const docs = new InMemoryDocStore<AuditEntry>()
    const tenants = new InMemoryDocStore<{ tenantId: string }>()
    const log = new AuditLog({ docs, nowMs: () => T0 })

    await tenants.put('t_gone', { tenantId: 't_gone' })
    await audited(
      log,
      { operator: 'u', action: 'tenant.read', tenantId: 't_gone' },
      async () => undefined
    )
    await audited(
      log,
      {
        operator: 'u',
        action: 'tenant.delete-data',
        tenantId: 't_gone',
        reason: 'user requested erasure'
      },
      async () => tenants.delete('t_gone')
    )

    expect(await tenants.get('t_gone')).toBeNull()
    const history = await log.forTenant('t_gone')
    expect(history).toHaveLength(4) // read started/ok + delete started/ok
    expect(history.map((e) => e.action)).toContain('tenant.delete-data')
  })

  it('entries carry no field that could hold tenant content', async () => {
    const { log } = setup()
    const e = await log.append({
      operator: 'u',
      action: 'tenant.read',
      tenantId: 't_a',
      outcome: 'ok'
    })
    expect(Object.keys(e).sort()).toEqual([
      'action',
      'atMs',
      'entryId',
      'operator',
      'outcome',
      'tenantId'
    ])
  })
})
