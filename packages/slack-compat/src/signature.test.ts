import { describe, it, expect } from 'vitest'
import { signSlackRequest, verifySlackSignature, DEFAULT_TOLERANCE_SECONDS } from './signature'

const SECRET = 'shhh-signing-secret'
const BODY = 'token=abc&command=%2Fdeploy&text=web'
const TS = 1700000000

function validSignature(): Promise<string> {
  return signSlackRequest({ signingSecret: SECRET, timestamp: TS, rawBody: BODY })
}

describe('signSlackRequest', () => {
  it('produces a stable v0= signature for the same inputs', async () => {
    const a = await signSlackRequest({ signingSecret: SECRET, timestamp: TS, rawBody: BODY })
    const b = await signSlackRequest({ signingSecret: SECRET, timestamp: TS, rawBody: BODY })
    expect(a).toBe(b)
    expect(a.startsWith('v0=')).toBe(true)
  })

  it('changes when the body changes', async () => {
    const a = await signSlackRequest({ signingSecret: SECRET, timestamp: TS, rawBody: BODY })
    const b = await signSlackRequest({ signingSecret: SECRET, timestamp: TS, rawBody: `${BODY}x` })
    expect(a).not.toBe(b)
  })
})

describe('verifySlackSignature', () => {
  it('accepts a correctly signed, fresh request', async () => {
    expect(
      await verifySlackSignature({
        signingSecret: SECRET,
        timestamp: String(TS),
        signature: await validSignature(),
        rawBody: BODY,
        nowSeconds: TS + 10
      })
    ).toBe(true)
  })

  it('rejects a tampered body', async () => {
    expect(
      await verifySlackSignature({
        signingSecret: SECRET,
        timestamp: String(TS),
        signature: await validSignature(),
        rawBody: `${BODY}&evil=1`,
        nowSeconds: TS
      })
    ).toBe(false)
  })

  it('rejects the wrong secret', async () => {
    expect(
      await verifySlackSignature({
        signingSecret: 'other-secret',
        timestamp: String(TS),
        signature: await validSignature(),
        rawBody: BODY,
        nowSeconds: TS
      })
    ).toBe(false)
  })

  it('rejects a stale timestamp (replay protection)', async () => {
    expect(
      await verifySlackSignature({
        signingSecret: SECRET,
        timestamp: String(TS),
        signature: await validSignature(),
        rawBody: BODY,
        nowSeconds: TS + DEFAULT_TOLERANCE_SECONDS + 1
      })
    ).toBe(false)
  })

  it('rejects missing secret, timestamp, or signature', async () => {
    const base = {
      timestamp: String(TS),
      signature: await validSignature(),
      rawBody: BODY,
      nowSeconds: TS
    }
    expect(await verifySlackSignature({ ...base, signingSecret: undefined })).toBe(false)
    expect(
      await verifySlackSignature({ ...base, signingSecret: SECRET, timestamp: undefined })
    ).toBe(false)
    expect(
      await verifySlackSignature({ ...base, signingSecret: SECRET, signature: undefined })
    ).toBe(false)
  })

  it('rejects a non-numeric timestamp', async () => {
    expect(
      await verifySlackSignature({
        signingSecret: SECRET,
        timestamp: 'not-a-number',
        signature: await validSignature(),
        rawBody: BODY,
        nowSeconds: TS
      })
    ).toBe(false)
  })
})
