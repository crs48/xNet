/**
 * The dunning driver (exploration 0418).
 *
 * `reconcileBilling` is already exhaustively tested as a pure function; what is
 * tested here is the half that has side effects — that each decided action calls
 * the right control-plane methods in the right ORDER, and that a failure leaves
 * the tenant where it was rather than half-degraded.
 */

import type { ControlPlane } from '../control-plane'
import type { TenantRecord } from '../registry'
import { resolveEntitlements } from '@xnetjs/entitlements'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DUNNING_WINDOWS, reconcileBilling, type DunningState } from './billing'
import {
  applyBillingAction,
  dunningStateOf,
  reconcileInputFor,
  silentNotifier,
  summarizeSweep,
  type BillingNotifier
} from './billing-driver'

const NOW = 1_000_000_000_000

const tenant = (billing?: DunningState): TenantRecord => ({
  tenantId: 'acme',
  plan: 'personal',
  entitlements: resolveEntitlements('personal'),
  billingUserId: 'user_1',
  did: 'did:key:zabc',
  hubUrl: 'https://acme.example',
  substrateRef: 'run/acme',
  region: 'us-central1',
  targetVersion: '1.0.0',
  createdAt: NOW - 1000,
  lastActiveMs: NOW,
  dataTier: 'hot',
  ...(billing ? { billing } : {})
})

/** A control plane recording call order — the thing most worth asserting. */
const fakeCp = () => {
  const calls: string[] = []
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(name)
      void args
      return Promise.resolve(null)
    }
  return {
    calls,
    cp: {
      reactivateTenant: vi.fn(record('reactivateTenant')),
      setWritesEnabled: vi.fn(record('setWritesEnabled')),
      setBillingState: vi.fn(record('setBillingState')),
      suspendTenant: vi.fn(record('suspendTenant')),
      stageExportBundle: vi.fn(record('stageExportBundle')),
      deleteTenant: vi.fn(record('deleteTenant'))
    } as unknown as ControlPlane
  }
}

const spyNotifier = (): BillingNotifier & { calls: string[] } => {
  const calls: string[] = []
  const rec = (n: string) => async () => {
    calls.push(n)
  }
  return {
    calls,
    graceOpened: rec('graceOpened'),
    readOnly: rec('readOnly'),
    suspended: rec('suspended'),
    finalNotice: rec('finalNotice'),
    deleted: rec('deleted'),
    recovered: rec('recovered')
  }
}

describe('dunningStateOf', () => {
  it('treats a tenant that never missed a payment as healthy', () => {
    expect(dunningStateOf(tenant())).toEqual({ state: 'active', subscriptionStatus: 'active' })
  })
})

describe('applyBillingAction', () => {
  let cp: ReturnType<typeof fakeCp>
  let notify: ReturnType<typeof spyNotifier>

  beforeEach(() => {
    cp = fakeCp()
    notify = spyNotifier()
  })

  it('does nothing for the `none` action', async () => {
    const out = await applyBillingAction(cp.cp, notify, tenant(), { kind: 'none' }, NOW)
    expect(out).toEqual({ kind: 'none' })
    expect(cp.calls).toEqual([])
    expect(notify.calls).toEqual([])
  })

  it('reactivate: restores service, clears the timers, then tells the customer', async () => {
    const out = await applyBillingAction(
      cp.cp,
      notify,
      tenant({ state: 'read_only', subscriptionStatus: 'past_due' }),
      { kind: 'reactivate', reason: 'payment recovered' },
      NOW
    )
    expect(out).toEqual({ kind: 'applied', action: 'reactivate' })
    expect(cp.calls).toEqual(['reactivateTenant', 'setBillingState'])
    expect(notify.calls).toEqual(['recovered'])
    // Recovery must fully clear the deadlines, not just move the state.
    expect(cp.cp.setBillingState).toHaveBeenCalledWith('acme', {
      state: 'active',
      subscriptionStatus: 'active'
    })
  })

  it('read_only: blocks writes before recording the state', async () => {
    const out = await applyBillingAction(
      cp.cp,
      notify,
      tenant({ state: 'grace', subscriptionStatus: 'past_due', graceUntilMs: NOW - 1 }),
      { kind: 'read_only', reason: 'grace elapsed, still unpaid' },
      NOW
    )
    expect(out).toEqual({ kind: 'applied', action: 'read_only' })
    expect(cp.calls).toEqual(['setWritesEnabled', 'setBillingState'])
    expect(cp.cp.setWritesEnabled).toHaveBeenCalledWith('acme', false)
    expect(notify.calls).toEqual(['readOnly'])
  })

  it('read_only: preserves the grace deadline rather than dropping it', async () => {
    await applyBillingAction(
      cp.cp,
      notify,
      tenant({ state: 'grace', subscriptionStatus: 'past_due', graceUntilMs: 42 }),
      { kind: 'read_only', reason: 'x' },
      NOW
    )
    expect(cp.cp.setBillingState).toHaveBeenCalledWith('acme', {
      state: 'read_only',
      subscriptionStatus: 'past_due',
      graceUntilMs: 42
    })
  })

  it('suspend_cold: tears the machine down and schedules deletion', async () => {
    const deleteAfterMs = NOW + DUNNING_WINDOWS.retentionMs
    const out = await applyBillingAction(
      cp.cp,
      notify,
      tenant({ state: 'read_only', subscriptionStatus: 'unpaid' }),
      { kind: 'suspend_cold', reason: 'subscription unpaid', deleteAfterMs },
      NOW
    )
    expect(out).toEqual({ kind: 'applied', action: 'suspend_cold' })
    expect(cp.calls).toEqual(['suspendTenant', 'setBillingState'])
    expect(notify.calls).toEqual(['suspended'])
  })

  it('pending_deletion: NOTIFIES FIRST — the clock must not start unannounced', async () => {
    const order: string[] = []
    const n: BillingNotifier = {
      ...silentNotifier,
      finalNotice: async () => {
        order.push('notify')
      }
    }
    const cp2 = fakeCp()
    ;(cp2.cp.setBillingState as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push('persist')
      return Promise.resolve(null)
    })
    await applyBillingAction(
      cp2.cp,
      n,
      tenant({ state: 'suspended', subscriptionStatus: 'unpaid' }),
      { kind: 'pending_deletion', reason: 'retention elapsed', finalNoticeUntilMs: NOW + 1 },
      NOW
    )
    expect(order).toEqual(['notify', 'persist'])
  })

  it('pending_deletion: a failed notice does NOT start the deletion clock', async () => {
    const n: BillingNotifier = {
      ...silentNotifier,
      finalNotice: async () => {
        throw new Error('smtp down')
      }
    }
    const out = await applyBillingAction(
      cp.cp,
      n,
      tenant({ state: 'suspended', subscriptionStatus: 'unpaid' }),
      { kind: 'pending_deletion', reason: 'r', finalNoticeUntilMs: NOW + 1 },
      NOW
    )
    expect(out).toEqual({ kind: 'failed', action: 'pending_deletion', error: 'smtp down' })
    expect(cp.cp.setBillingState).not.toHaveBeenCalled()
  })

  it('delete: is SKIPPED unless explicitly enabled', async () => {
    const out = await applyBillingAction(
      cp.cp,
      notify,
      tenant({ state: 'pending_deletion', subscriptionStatus: 'unpaid' }),
      { kind: 'delete', reason: 'final notice elapsed' },
      NOW
    )
    expect(out).toEqual({ kind: 'skipped_delete_disabled' })
    expect(cp.cp.deleteTenant).not.toHaveBeenCalled()
  })

  it('delete: stages the export BEFORE destroying anything (Charter §6)', async () => {
    const out = await applyBillingAction(
      cp.cp,
      notify,
      tenant({ state: 'pending_deletion', subscriptionStatus: 'unpaid' }),
      { kind: 'delete', reason: 'final notice elapsed' },
      NOW,
      { deleteEnabled: true }
    )
    expect(out).toEqual({ kind: 'applied', action: 'delete' })
    expect(cp.calls).toEqual(['stageExportBundle', 'deleteTenant'])
    expect(notify.calls).toEqual(['deleted'])
  })

  it('delete: a failed export staging aborts the deletion', async () => {
    ;(cp.cp.stageExportBundle as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('r2 down'))
    const out = await applyBillingAction(
      cp.cp,
      notify,
      tenant({ state: 'pending_deletion', subscriptionStatus: 'unpaid' }),
      { kind: 'delete', reason: 'x' },
      NOW,
      { deleteEnabled: true }
    )
    expect(out).toEqual({ kind: 'failed', action: 'delete', error: 'r2 down' })
    expect(cp.cp.deleteTenant).not.toHaveBeenCalled()
  })

  it('a control-plane failure is reported, not thrown — one bad tenant cannot stop the sweep', async () => {
    ;(cp.cp.setWritesEnabled as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('run 503'))
    const out = await applyBillingAction(
      cp.cp,
      notify,
      tenant({ state: 'grace', subscriptionStatus: 'past_due' }),
      { kind: 'read_only', reason: 'x' },
      NOW
    )
    expect(out).toEqual({ kind: 'failed', action: 'read_only', error: 'run 503' })
  })
})

describe('the decision and the driver, composed', () => {
  it('drives a lapsed grace window all the way to read-only', async () => {
    const cp = fakeCp()
    const notify = spyNotifier()
    const t = tenant({ state: 'grace', subscriptionStatus: 'past_due', graceUntilMs: NOW - 1 })
    const action = reconcileBilling(reconcileInputFor(t, NOW))
    expect(action.kind).toBe('read_only')
    const out = await applyBillingAction(cp.cp, notify, t, action, NOW)
    expect(out).toEqual({ kind: 'applied', action: 'read_only' })
  })

  it('a healthy tenant is a no-op every tick', async () => {
    const t = tenant()
    const action = reconcileBilling(reconcileInputFor(t, NOW))
    expect(action).toEqual({ kind: 'none' })
  })
})

describe('summarizeSweep', () => {
  it('counts outcomes and names the failures', () => {
    expect(
      summarizeSweep([
        { tenantId: 'a', outcome: { kind: 'applied', action: 'read_only' } },
        { tenantId: 'b', outcome: { kind: 'none' } },
        { tenantId: 'c', outcome: { kind: 'failed', action: 'delete', error: 'boom' } },
        { tenantId: 'd', outcome: { kind: 'skipped_delete_disabled' } }
      ])
    ).toEqual({ scanned: 4, applied: 1, failed: 1, skipped: 1, failures: ['c'] })
  })
})
