import { MemoryBillingIdentityProvider } from '@xnetjs/cloud/identity'
import { describe, expect, it } from 'vitest'
import { FakeTenantBillingGateway } from './billing-gateway'
import { MemoryDeviceGrantStore, isExpired, type CodeGenerator } from './device-grant'
import { createControlPlaneApp } from './server'
import { buildControlPlane } from './index'

/** Deterministic codes so the test can drive both sides of the grant. */
const fixedCodes: CodeGenerator = {
  deviceCode: () => 'DEVICE_CODE_FIXED',
  userCode: () => 'ABCD-7K2P'
}

function claimApp() {
  const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
  billing.seed({ id: 'user_a', email: 'a@example.com', emailVerified: true }, 'code_a')
  const { controlPlane } = buildControlPlane({ billing })
  const app = createControlPlaneApp({
    controlPlane,
    billing,
    payments: new FakeTenantBillingGateway(),
    deviceGrants: new MemoryDeviceGrantStore(fixedCodes),
    sessionSecret: 'sess-secret',
    baseUrl: ''
  })
  return { app, controlPlane }
}

async function signIn(app: ReturnType<typeof claimApp>['app']): Promise<string> {
  const res = await app.request('/auth/callback?code=code_a')
  return (res.headers.get('set-cookie') ?? '').split(';')[0]
}

const CHALLENGE = { did: 'did:key:alice', nonce: 'n1', signature: 'sig1' }

async function provisionFor(app: ReturnType<typeof claimApp>['app']): Promise<void> {
  await app.request('/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'checkout.completed', customerRef: 'user_a', plan: 'personal' })
  })
}

describe('device-grant claim flow', () => {
  it('binds the DID after the user approves the device code', async () => {
    const { app, controlPlane } = claimApp()
    await provisionFor(app)
    const cookie = await signIn(app)

    // App starts a grant with its local DID.
    const start = await app.request('/device/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ did: CHALLENGE.did })
    })
    expect(start.status).toBe(200)
    const { deviceCode, userCode } = (await start.json()) as {
      deviceCode: string
      userCode: string
    }
    expect(userCode).toBe('ABCD-7K2P')

    // While pending, polling returns pending (no binding yet).
    const pending = await app.request('/device/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceCode, challenge: CHALLENGE })
    })
    expect(await pending.json()).toEqual({ status: 'pending' })

    // The signed-in user approves the code in the dashboard.
    const approve = await app.request('/claim', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: `userCode=${encodeURIComponent(userCode)}`
    })
    expect(approve.status).toBe(200)
    expect(await approve.text()).toContain('Device approved')

    // The next poll completes: the DID is bound and the hub URL returned.
    const done = await app.request('/device/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceCode, challenge: CHALLENGE })
    })
    const result = (await done.json()) as { status: string; hubUrl: string }
    expect(result.status).toBe('complete')
    expect(result.hubUrl).toContain('hub')

    const tenant = await controlPlane.getTenant('t_user_a')
    expect(tenant?.did).toBe('did:key:alice')
  })

  it('rejects a polled DID that differs from the one shown', async () => {
    const { app } = claimApp()
    await provisionFor(app)
    const start = await app.request('/device/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ did: 'did:key:alice' })
    })
    const { deviceCode } = (await start.json()) as { deviceCode: string }
    const res = await app.request('/device/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceCode, challenge: { ...CHALLENGE, did: 'did:key:mallory' } })
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('did_mismatch')
  })

  it('rejects an unknown device code', async () => {
    const { app } = claimApp()
    const res = await app.request('/device/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceCode: 'nope', challenge: CHALLENGE })
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
    const store = new MemoryDeviceGrantStore(fixedCodes)
    const grant = store.start('did:key:alice', 0)
    expect(isExpired(grant, 5 * 60 * 1000)).toBe(false)
    expect(isExpired(grant, 11 * 60 * 1000)).toBe(true)
  })
})
