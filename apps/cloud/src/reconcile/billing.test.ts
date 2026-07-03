import { describe, expect, it } from 'vitest'
import {
  reconcileBilling,
  applyBillingEvent,
  DUNNING_WINDOWS,
  type BillingReconcileInput,
  type DunningState
} from './billing'

const NOW = 1_000_000
const base: BillingReconcileInput = {
  billingState: 'active',
  subscriptionStatus: 'active',
  nowMs: NOW
}

describe('reconcileBilling', () => {
  it('does nothing for a paid, active tenant', () => {
    expect(reconcileBilling(base)).toEqual({ kind: 'none' })
  })

  it('does nothing while a grace hub is still within the grace window', () => {
    const r = reconcileBilling({
      ...base,
      billingState: 'grace',
      subscriptionStatus: 'past_due',
      graceUntilMs: NOW + 1000
    })
    expect(r).toEqual({ kind: 'none' })
  })

  it('flips a grace hub to read-only once the grace window elapses unpaid', () => {
    const r = reconcileBilling({
      ...base,
      billingState: 'grace',
      subscriptionStatus: 'past_due',
      graceUntilMs: NOW - 1
    })
    expect(r.kind).toBe('read_only')
  })

  it('suspends a read-only hub cold once Stripe marks it unpaid, scheduling deletion', () => {
    const r = reconcileBilling({
      ...base,
      billingState: 'read_only',
      subscriptionStatus: 'unpaid'
    })
    expect(r).toEqual({
      kind: 'suspend_cold',
      reason: 'subscription unpaid',
      deleteAfterMs: NOW + DUNNING_WINDOWS.retentionMs
    })
  })

  it('also suspends a read-only hub whose subscription was canceled', () => {
    const r = reconcileBilling({
      ...base,
      billingState: 'read_only',
      subscriptionStatus: 'canceled'
    })
    expect(r.kind).toBe('suspend_cold')
  })

  it('holds a read-only hub that is still merely past_due (Stripe still retrying)', () => {
    const r = reconcileBilling({
      ...base,
      billingState: 'read_only',
      subscriptionStatus: 'past_due'
    })
    expect(r).toEqual({ kind: 'none' })
  })

  it('moves a suspended hub to pending_deletion once the retention window elapses', () => {
    const r = reconcileBilling({
      ...base,
      billingState: 'suspended',
      subscriptionStatus: 'unpaid',
      deleteAfterMs: NOW - 1
    })
    expect(r.kind).toBe('pending_deletion')
    if (r.kind === 'pending_deletion') {
      expect(r.finalNoticeUntilMs).toBe(NOW + DUNNING_WINDOWS.finalNoticeMs)
    }
  })

  it('holds a suspended hub still inside the retention window', () => {
    const r = reconcileBilling({
      ...base,
      billingState: 'suspended',
      subscriptionStatus: 'unpaid',
      deleteAfterMs: NOW + 1000
    })
    expect(r).toEqual({ kind: 'none' })
  })

  it('deletes only after the final-notice window elapses', () => {
    const r = reconcileBilling({
      ...base,
      billingState: 'pending_deletion',
      subscriptionStatus: 'unpaid',
      finalNoticeUntilMs: NOW - 1
    })
    expect(r).toEqual({ kind: 'delete', reason: 'final notice elapsed' })
  })

  it('never deletes while still inside the final-notice window', () => {
    const r = reconcileBilling({
      ...base,
      billingState: 'pending_deletion',
      subscriptionStatus: 'unpaid',
      finalNoticeUntilMs: NOW + 1
    })
    expect(r).toEqual({ kind: 'none' })
  })

  it('is terminal once deleted', () => {
    expect(
      reconcileBilling({ ...base, billingState: 'deleted', subscriptionStatus: 'canceled' })
    ).toEqual({ kind: 'none' })
  })

  it('reactivates from ANY pre-deletion state the moment payment recovers', () => {
    for (const billingState of ['grace', 'read_only', 'suspended', 'pending_deletion'] as const) {
      const r = reconcileBilling({
        ...base,
        billingState,
        subscriptionStatus: 'active',
        // deadlines that would otherwise fire — recovery must still win.
        graceUntilMs: NOW - 1,
        deleteAfterMs: NOW - 1,
        finalNoticeUntilMs: NOW - 1
      })
      expect(r).toEqual({ kind: 'reactivate', reason: 'payment recovered' })
    }
  })

  it('does NOT resurrect an already-deleted tenant even if payment recovers', () => {
    expect(
      reconcileBilling({ ...base, billingState: 'deleted', subscriptionStatus: 'active' })
    ).toEqual({ kind: 'none' })
  })

  it('honors injected windows (generosity is configurable)', () => {
    const windows = { graceMs: 1, retentionMs: 999, finalNoticeMs: 5 }
    const r = reconcileBilling(
      { ...base, billingState: 'read_only', subscriptionStatus: 'unpaid' },
      windows
    )
    expect(r).toEqual({
      kind: 'suspend_cold',
      reason: 'subscription unpaid',
      deleteAfterMs: NOW + 999
    })
  })

  it('uses the recommended default windows (14d grace / 30d retention / 7d final)', () => {
    const DAY = 24 * 60 * 60 * 1000
    expect(DUNNING_WINDOWS).toEqual({
      graceMs: 14 * DAY,
      retentionMs: 30 * DAY,
      finalNoticeMs: 7 * DAY
    })
  })
})

describe('applyBillingEvent', () => {
  it('opens grace with a deadline on the first payment failure of an active tenant', () => {
    const s = applyBillingEvent(undefined, { kind: 'payment_failed' }, NOW)
    expect(s).toEqual({
      state: 'grace',
      subscriptionStatus: 'past_due',
      graceUntilMs: NOW + DUNNING_WINDOWS.graceMs
    })
  })

  it('does not reset the grace deadline on a later failure (no clock reset)', () => {
    const grace: DunningState = {
      state: 'grace',
      subscriptionStatus: 'past_due',
      graceUntilMs: NOW + 100
    }
    const s = applyBillingEvent(grace, { kind: 'payment_failed' }, NOW + 5000)
    expect(s.graceUntilMs).toBe(NOW + 100)
    expect(s.state).toBe('grace')
  })

  it('returns to active and clears timers when payment recovers, from any funnel state', () => {
    const suspended: DunningState = {
      state: 'suspended',
      subscriptionStatus: 'unpaid',
      deleteAfterMs: NOW + 100
    }
    expect(applyBillingEvent(suspended, { kind: 'payment_recovered' }, NOW)).toEqual({
      state: 'active',
      subscriptionStatus: 'active'
    })
  })

  it('a subscription flip to active is also a recovery', () => {
    const readOnly: DunningState = { state: 'read_only', subscriptionStatus: 'past_due' }
    expect(
      applyBillingEvent(readOnly, { kind: 'subscription_status', status: 'active' }, NOW)
    ).toEqual({ state: 'active', subscriptionStatus: 'active' })
  })

  it('a subscription flip to past_due on an active tenant opens grace', () => {
    const s = applyBillingEvent(undefined, { kind: 'subscription_status', status: 'past_due' }, NOW)
    expect(s.state).toBe('grace')
    expect(s.graceUntilMs).toBe(NOW + DUNNING_WINDOWS.graceMs)
  })

  it('records unpaid/canceled status without advancing the lifecycle (timers do that)', () => {
    const readOnly: DunningState = {
      state: 'read_only',
      subscriptionStatus: 'past_due',
      graceUntilMs: NOW - 1
    }
    const s = applyBillingEvent(readOnly, { kind: 'subscription_status', status: 'unpaid' }, NOW)
    expect(s).toEqual({ state: 'read_only', subscriptionStatus: 'unpaid', graceUntilMs: NOW - 1 })
    // …and now reconcileBilling can move it to suspend_cold.
    expect(
      reconcileBilling({
        billingState: s.state,
        subscriptionStatus: s.subscriptionStatus,
        nowMs: NOW
      }).kind
    ).toBe('suspend_cold')
  })

  it('never resurrects a deleted tenant', () => {
    const deleted: DunningState = { state: 'deleted', subscriptionStatus: 'canceled' }
    expect(applyBillingEvent(deleted, { kind: 'payment_recovered' }, NOW)).toEqual(deleted)
    expect(
      applyBillingEvent(deleted, { kind: 'subscription_status', status: 'active' }, NOW)
    ).toEqual(deleted)
  })
})
