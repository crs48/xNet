import { describe, expect, it } from 'vitest'
import { reconcileBilling, DUNNING_WINDOWS, type BillingReconcileInput } from './billing'

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
