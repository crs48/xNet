import { describe, expect, it } from 'vitest'
import { reconcileTenant, type ReconcileInput } from './reconcile'

const base: ReconcileInput = {
  dataTier: 'hot',
  substrateRef: 'ref',
  hubUrl: 'wss://x',
  lastActiveMs: 1000,
  healthy: true,
  synced: true,
  nowMs: 1000,
  coldAfterMs: 60_000
}

describe('reconcileTenant', () => {
  it('does nothing for a healthy, active, live tenant', () => {
    expect(reconcileTenant(base)).toEqual({ kind: 'none' })
  })

  it('re-provisions a hot tenant that has no live machine', () => {
    expect(reconcileTenant({ ...base, substrateRef: '', hubUrl: '' }).kind).toBe('reprovision')
  })

  it('restarts an unhealthy live hub', () => {
    expect(reconcileTenant({ ...base, healthy: false }).kind).toBe('restart')
  })

  it('demotes an idle, fully-synced hub', () => {
    const r = reconcileTenant({ ...base, lastActiveMs: 0, nowMs: 120_000, synced: true })
    expect(r.kind).toBe('demote')
  })

  it('does NOT demote an idle hub whose replica is not yet synced', () => {
    const r = reconcileTenant({ ...base, lastActiveMs: 0, nowMs: 120_000, synced: false })
    expect(r).toEqual({ kind: 'none' })
  })

  it('prioritizes re-provision over restart when both could apply', () => {
    // No machine AND unhealthy → re-provision (can't restart what isn't there).
    expect(reconcileTenant({ ...base, substrateRef: '', hubUrl: '', healthy: false }).kind).toBe(
      'reprovision'
    )
  })

  it('leaves a canceled subscription suspended', () => {
    expect(
      reconcileTenant({ ...base, subscriptionStatus: 'canceled', substrateRef: '', hubUrl: '' })
    ).toEqual({ kind: 'none' })
  })

  it('does nothing for cold tenants (reactivation is request-driven)', () => {
    expect(reconcileTenant({ ...base, dataTier: 'cold', substrateRef: '', hubUrl: '' })).toEqual({
      kind: 'none'
    })
  })

  it('takes no action on unknown health (no signal yet)', () => {
    expect(reconcileTenant({ ...base, healthy: null })).toEqual({ kind: 'none' })
  })
})
