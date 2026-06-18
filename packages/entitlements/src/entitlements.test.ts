import { describe, expect, it } from 'vitest'
import { entitlementsFromEnv, signEntitlements, verifyEntitlements } from './entitlements'
import { resolveEntitlements, withAiBudget, withStorage } from './plans'

const SECRET = 'test-signing-secret'

describe('signEntitlements / verifyEntitlements', () => {
  it('round-trips entitlements through a signed token', () => {
    const ent = withStorage(resolveEntitlements('personal'), 50 * 1024 * 1024 * 1024)
    const token = signEntitlements(ent, SECRET)
    expect(token).toContain('.')
    expect(verifyEntitlements(token, SECRET)).toEqual(ent)
  })

  it('carries the AI budget through the token (the hub reads its included + cap)', () => {
    const ent = withAiBudget(resolveEntitlements('personal'), 3, 40)
    const back = verifyEntitlements(signEntitlements(ent, SECRET), SECRET)
    expect(back.includedAiUsd).toBe(3)
    expect(back.aiMonthlyBudgetUsd).toBe(40)
    expect(back.aiEnabled).toBe(true)
  })

  it('rejects a token signed with a different secret', () => {
    const token = signEntitlements(resolveEntitlements('team'), SECRET)
    expect(() => verifyEntitlements(token, 'wrong-secret')).toThrow(/Invalid entitlement token/)
  })

  it('rejects a tampered payload', () => {
    const token = signEntitlements(resolveEntitlements('personal'), SECRET)
    const [, sig] = token.split('.')
    const forged = `${Buffer.from(JSON.stringify({ plan: 'enterprise' })).toString('base64url')}.${sig}`
    expect(() => verifyEntitlements(forged, SECRET)).toThrow(/Invalid entitlement token/)
  })

  it('rejects malformed tokens', () => {
    expect(() => verifyEntitlements('no-dot-here', SECRET)).toThrow(/Malformed/)
    expect(() => verifyEntitlements('.sig', SECRET)).toThrow(/Malformed/)
    expect(() => verifyEntitlements('payload.', SECRET)).toThrow(/Malformed/)
  })

  it('requires a secret on both sides', () => {
    expect(() => signEntitlements(resolveEntitlements('demo'), '')).toThrow(/secret/)
    expect(() => verifyEntitlements('a.b', '')).toThrow(/secret/)
  })
})

describe('entitlementsFromEnv', () => {
  it('falls back to the demo plan when HUB_PLAN is absent', () => {
    expect(entitlementsFromEnv({})).toEqual(resolveEntitlements('demo'))
  })

  it('uses a provided fallback when HUB_PLAN is absent', () => {
    const fallback = resolveEntitlements('personal')
    expect(entitlementsFromEnv({}, fallback)).toEqual(fallback)
  })

  it('verifies HUB_PLAN against XNET_PLAN_SECRET', () => {
    const ent = resolveEntitlements('team')
    const env = { HUB_PLAN: signEntitlements(ent, SECRET), XNET_PLAN_SECRET: SECRET }
    expect(entitlementsFromEnv(env)).toEqual(ent)
  })

  it('throws when HUB_PLAN is set but the secret is missing', () => {
    const env = { HUB_PLAN: signEntitlements(resolveEntitlements('team'), SECRET) }
    expect(() => entitlementsFromEnv(env)).toThrow(/XNET_PLAN_SECRET is missing/)
  })
})
