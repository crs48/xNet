import { MemoryBillingIdentityProvider } from '@xnetjs/cloud/identity'
import { createDIDFromEd25519PublicKey, generateSigningKeyPair, hybridSign } from '@xnetjs/crypto'
import { describe, expect, it } from 'vitest'
import { FakeTenantBillingGateway } from './billing-gateway'
import { MemoryDeviceGrantStore, isExpired, type CodeGenerator } from './device-grant'
import { createControlPlaneApp } from './server'
import { buildControlPlane } from './index'

/** Deterministic but unique codes so a test can run several distinct device flows. */
function seqCodes(): CodeGenerator {
  let n = 0
  return {
    deviceCode: () => `DEVICE_${n++}`,
    userCode: () => `ABCD-${1000 + n}`
  }
}

/** A real passkey-style data identity: an Ed25519 key whose public half is the DID. */
function makeIdentity() {
  const { publicKey, privateKey } = generateSigningKeyPair()
  const did = createDIDFromEd25519PublicKey(publicKey)
  const sign = (nonce: string): string => {
    const sig = hybridSign(new TextEncoder().encode(nonce), { ed25519: privateKey }, 0)
    return Buffer.from(sig.ed25519 as Uint8Array).toString('base64url')
  }
  return { did, sign }
}

function claimApp(codes: CodeGenerator = seqCodes()) {
  const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
  billing.seed({ id: 'user_a', email: 'a@example.com', emailVerified: true }, 'code_a')
  // No verifyDid override — exercise the real Ed25519 challenge verifier (0243).
  const { controlPlane } = buildControlPlane({ billing })
  const app = createControlPlaneApp({
    controlPlane,
    billing,
    payments: new FakeTenantBillingGateway(),
    deviceGrants: new MemoryDeviceGrantStore(codes),
    sessionSecret: 'sess-secret',
    baseUrl: ''
  })
  return { app, controlPlane }
}

async function signIn(app: ReturnType<typeof claimApp>['app']): Promise<string> {
  const res = await app.request('/auth/callback?code=code_a')
  return (res.headers.get('set-cookie') ?? '').split(';')[0]
}

async function provisionFor(app: ReturnType<typeof claimApp>['app']): Promise<void> {
  await app.request('/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'checkout.completed', customerRef: 'user_a', plan: 'personal' })
  })
}

type Start = { deviceCode: string; userCode: string; nonce: string }

async function startClaim(app: ReturnType<typeof claimApp>['app'], did: string): Promise<Start> {
  const res = await app.request('/device/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ did })
  })
  expect(res.status).toBe(200)
  return (await res.json()) as Start
}

function tokenReq(
  app: ReturnType<typeof claimApp>['app'],
  deviceCode: string,
  challenge: { did: string; nonce: string; signature: string }
) {
  return app.request('/device/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceCode, challenge })
  })
}

async function approve(
  app: ReturnType<typeof claimApp>['app'],
  cookie: string,
  userCode: string
): Promise<void> {
  await app.request('/claim', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: `userCode=${encodeURIComponent(userCode)}`
  })
}

describe('device-grant claim flow', () => {
  it('binds the DID after the user signs the server nonce and approves the code', async () => {
    const { app, controlPlane } = claimApp()
    await provisionFor(app)
    const cookie = await signIn(app)
    const id = makeIdentity()

    const { deviceCode, userCode, nonce } = await startClaim(app, id.did)
    expect(typeof nonce).toBe('string')
    expect(nonce.length).toBeGreaterThan(0)
    const challenge = { did: id.did, nonce, signature: id.sign(nonce) }

    // While pending the nonce is NOT consumed (the app polls repeatedly).
    const pending = await tokenReq(app, deviceCode, challenge)
    expect(await pending.json()).toEqual({ status: 'pending' })

    await approve(app, cookie, userCode)

    const done = await tokenReq(app, deviceCode, challenge)
    const result = (await done.json()) as { status: string; hubUrl: string }
    expect(result.status).toBe('complete')
    expect(result.hubUrl).toContain('hub')

    const tenant = await controlPlane.getTenant('t_user_a')
    expect(tenant?.did).toBe(id.did)
  })

  it('rejects a replayed challenge — the nonce is single-use', async () => {
    const { app } = claimApp()
    await provisionFor(app)
    const cookie = await signIn(app)
    const id = makeIdentity()

    const { deviceCode, userCode, nonce } = await startClaim(app, id.did)
    const challenge = { did: id.did, nonce, signature: id.sign(nonce) }
    await approve(app, cookie, userCode)

    const first = await tokenReq(app, deviceCode, challenge)
    expect((await first.json()).status).toBe('complete')

    // Replaying the exact same signed challenge fails: the nonce was consumed.
    const replay = await tokenReq(app, deviceCode, challenge)
    expect(replay.status).toBe(400)
    expect((await replay.json()).error).toBe('invalid_nonce')
  })

  it('rejects a challenge signed by a different key (wrong DID control)', async () => {
    const { app } = claimApp()
    await provisionFor(app)
    const cookie = await signIn(app)
    const id = makeIdentity()
    const attacker = makeIdentity()

    const { deviceCode, userCode, nonce } = await startClaim(app, id.did)
    await approve(app, cookie, userCode)

    // Claims id.did but signs with the attacker's key → signature fails to verify.
    const forged = { did: id.did, nonce, signature: attacker.sign(nonce) }
    const res = await tokenReq(app, deviceCode, forged)
    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain('DID challenge failed')
  })

  it('rejects a nonce minted for a different device flow (no cross-flow swap)', async () => {
    const { app } = claimApp()
    await provisionFor(app)
    const cookie = await signIn(app)
    const id = makeIdentity()

    const flowA = await startClaim(app, id.did)
    const flowB = await startClaim(app, id.did)
    await approve(app, cookie, flowB.userCode)

    // Validly sign flow A's nonce, but submit it against flow B → bound to the wrong flow.
    const swapped = { did: id.did, nonce: flowA.nonce, signature: id.sign(flowA.nonce) }
    const res = await tokenReq(app, flowB.deviceCode, swapped)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_nonce')
  })

  it('rejects a malformed signature', async () => {
    const { app } = claimApp()
    await provisionFor(app)
    const cookie = await signIn(app)
    const id = makeIdentity()

    const { deviceCode, userCode, nonce } = await startClaim(app, id.did)
    await approve(app, cookie, userCode)

    const res = await tokenReq(app, deviceCode, { did: id.did, nonce, signature: 'not-a-sig' })
    expect(res.status).toBe(422)
  })

  it('rejects a polled DID that differs from the one shown', async () => {
    const { app } = claimApp()
    await provisionFor(app)
    const id = makeIdentity()
    const { deviceCode, nonce } = await startClaim(app, id.did)
    const res = await tokenReq(app, deviceCode, {
      did: 'did:key:z6MkMallory',
      nonce,
      signature: id.sign(nonce)
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('did_mismatch')
  })

  it('rejects an unknown device code', async () => {
    const { app } = claimApp()
    const id = makeIdentity()
    const res = await tokenReq(app, 'nope', {
      did: id.did,
      nonce: 'n',
      signature: id.sign('n')
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_grant')
  })

  it('requires a session to approve a device', async () => {
    const { app } = claimApp()
    const res = await app.request('/claim', { method: 'POST', body: 'userCode=ABCD-7K2P' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/auth/start')
  })

  it('reports an unknown user code on the claim page', async () => {
    const { app } = claimApp()
    const cookie = await signIn(app)
    const res = await app.request('/claim', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'userCode=ZZZZ-ZZZZ'
    })
    expect(await res.text()).toContain('Code not found')
  })

  it('expires a grant past its TTL', () => {
    const store = new MemoryDeviceGrantStore(seqCodes())
    const grant = store.start('did:key:alice', 0)
    expect(isExpired(grant, 5 * 60 * 1000)).toBe(false)
    expect(isExpired(grant, 11 * 60 * 1000)).toBe(true)
  })
})

describe('account recovery (billing-only)', () => {
  it('requires a session to view the recovery page', async () => {
    const { app } = claimApp()
    const res = await app.request('/account/recover')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/auth/start')
  })

  it('warns that data is not recovered on the confirmation page', async () => {
    const { app } = claimApp()
    const cookie = await signIn(app)
    const res = await app.request('/account/recover', { headers: { cookie } })
    const html = await res.text()
    expect(html).toContain('Recover your account')
    expect(html).toContain('not') // "does not restore your existing encrypted data"
    expect(html.toLowerCase()).toContain('encrypted data')
  })

  it('reports nothing to recover when no hub is bound yet', async () => {
    const { app } = claimApp()
    const cookie = await signIn(app)
    const res = await app.request('/account/recover', { method: 'POST', headers: { cookie } })
    expect(await res.text()).toContain('Nothing to recover')
  })

  it('recovers a claimed account and clears the bound DID', async () => {
    const { app, controlPlane } = claimApp()
    await provisionFor(app)
    const cookie = await signIn(app)
    const id = makeIdentity()

    // Bind a data identity through the full claim flow first.
    const { deviceCode, userCode, nonce } = await startClaim(app, id.did)
    await approve(app, cookie, userCode)
    await tokenReq(app, deviceCode, { did: id.did, nonce, signature: id.sign(nonce) })
    expect((await controlPlane.getTenant('t_user_a'))?.did).toBe(id.did)

    // Now recover: the account + hub survive, the data DID is cleared.
    const res = await app.request('/account/recover', { method: 'POST', headers: { cookie } })
    expect(await res.text()).toContain('Account recovered')
    const tenant = await controlPlane.getTenant('t_user_a')
    expect(tenant?.did).toBe('')
    expect(tenant?.hubUrl).toContain('hub')
  })
})
