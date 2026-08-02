import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { entitlementsFromEnv, signEntitlements, verifyEntitlements } from './entitlements'
import { PLAN_ORDER, resolveEntitlements, withAiBudget, withStorage } from './plans'

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

describe('writesEnabled (exploration 0418)', () => {
  const secret = SECRET

  it('round-trips an explicit false — the read-only lever', () => {
    const token = signEntitlements(
      { ...resolveEntitlements('personal'), writesEnabled: false },
      secret
    )
    expect(verifyEntitlements(token, secret).writesEnabled).toBe(false)
  })

  it('defaults to true in the plan catalog for every plan', () => {
    for (const plan of PLAN_ORDER) {
      expect(resolveEntitlements(plan).writesEnabled).toBe(true)
    }
  })

  it('FAILS OPEN for a token signed before the field existed', () => {
    // Hand-build a legacy payload: the exact shape a hub in the fleet is running
    // on right now. Treating the missing field as `false` would brick all of them.
    const legacy = { ...resolveEntitlements('personal') } as Record<string, unknown>
    delete legacy.writesEnabled
    const payload = Buffer.from(JSON.stringify(legacy)).toString('base64url')
    const sig = createHmac('sha256', secret).update(payload).digest().toString('base64url')
    expect(verifyEntitlements(`${payload}.${sig}`, secret).writesEnabled).toBe(true)
  })

  // Exploration 0435. Same fail-open rule, same reason: every hub in the fleet
  // is running a token signed before `tenantQuotaBytes` existed. Reading the
  // missing field as `0` would give all of them a zero-byte aggregate ceiling.
  it('leaves tenantQuotaBytes ABSENT (= unlimited) on a token signed before it existed', () => {
    const legacy = { ...resolveEntitlements('personal') } as Record<string, unknown>
    delete legacy.tenantQuotaBytes
    const payload = Buffer.from(JSON.stringify(legacy)).toString('base64url')
    const sig = createHmac('sha256', secret).update(payload).digest().toString('base64url')
    expect(verifyEntitlements(`${payload}.${sig}`, secret).tenantQuotaBytes).toBeUndefined()
  })

  it('round-trips tenantQuotaBytes when it IS signed into the token', () => {
    const token = signEntitlements(
      { ...resolveEntitlements('personal'), tenantQuotaBytes: 525 * 1024 * 1024 * 1024 },
      secret
    )
    expect(verifyEntitlements(token, secret).tenantQuotaBytes).toBe(525 * 1024 * 1024 * 1024)
  })

  it('a self-hosted hub with no HUB_PLAN always resolves writesEnabled true', () => {
    // The anti-lock-in invariant (0174): no control plane, no read-only switch.
    expect(entitlementsFromEnv({}).writesEnabled).toBe(true)
    expect(entitlementsFromEnv({ XNET_PLAN_SECRET: secret }).writesEnabled).toBe(true)
  })
})
