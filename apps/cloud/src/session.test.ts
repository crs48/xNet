import { describe, expect, it } from 'vitest'
import { readSession, sealSession } from './session'

const SECRET = 'test-session-secret'

describe('session sealing', () => {
  it('round-trips a sealed session', () => {
    const token = sealSession(SECRET, {
      billingUserId: 'user_a',
      email: 'a@x.io',
      issuedAtMs: 1000
    })
    const data = readSession(SECRET, token, { nowMs: 2000 })
    expect(data).toMatchObject({ billingUserId: 'user_a', email: 'a@x.io' })
  })

  it('rejects a token signed with a different secret', () => {
    const token = sealSession('other-secret', { billingUserId: 'user_a', issuedAtMs: 1000 })
    expect(readSession(SECRET, token, { nowMs: 2000 })).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const token = sealSession(SECRET, { billingUserId: 'user_a', issuedAtMs: 1000 })
    const [, sig] = token.split('.')
    const forged = `${Buffer.from(JSON.stringify({ billingUserId: 'admin', issuedAtMs: 1000 })).toString('base64url')}.${sig}`
    expect(readSession(SECRET, forged, { nowMs: 2000 })).toBeNull()
  })

  it('rejects an expired session', () => {
    const token = sealSession(SECRET, { billingUserId: 'user_a', issuedAtMs: 0 })
    expect(readSession(SECRET, token, { nowMs: 8 * 24 * 60 * 60 * 1000 })).toBeNull()
  })

  it('returns null for missing / malformed tokens', () => {
    expect(readSession(SECRET, undefined)).toBeNull()
    expect(readSession(SECRET, 'no-dot')).toBeNull()
    expect(readSession(SECRET, '.sigonly')).toBeNull()
  })
})
