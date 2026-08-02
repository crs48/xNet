/**
 * Tenant membership end to end (exploration 0436 G3/G4/G5).
 *
 * Drives the real HTTP surface with real Ed25519 identities, because the two
 * things worth proving are ordering properties the unit tests cannot see:
 * an invited member joins the roster WITHOUT rebinding the tenant onto their
 * key, and the trusted-root policy the hub receives always contains everybody
 * who is supposed to be able to connect — including right after a recovery.
 */

import { MemoryBillingIdentityProvider } from '@xnetjs/cloud/identity'
import { MemoryProvisioner } from '@xnetjs/cloud/provisioner'
import { createDIDFromEd25519PublicKey, generateSigningKeyPair, hybridSign } from '@xnetjs/crypto'
import { describe, expect, it, vi } from 'vitest'
import { FakeTenantBillingGateway } from './billing-gateway'
import { MemoryDeviceGrantStore, type CodeGenerator } from './device-grant'
import { buildControlPlane } from './index'
import { MemoryTenantStore } from './registry'
import { createControlPlaneApp } from './server'

function seqCodes(): CodeGenerator {
  let n = 0
  return { deviceCode: () => `DEVICE_${n++}`, userCode: () => `ABCD-${1000 + n}` }
}

function makeIdentity() {
  const { publicKey, privateKey } = generateSigningKeyPair()
  const did = createDIDFromEd25519PublicKey(publicKey)
  const sign = (nonce: string): string => {
    const sig = hybridSign(new TextEncoder().encode(nonce), { ed25519: privateKey }, 0)
    return Buffer.from(sig.ed25519 as Uint8Array).toString('base64url')
  }
  return { did, sign }
}

function membersApp() {
  const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
  billing.seed({ id: 'user_a', email: 'a@example.com', emailVerified: true }, 'code_a')
  const provisioner = new MemoryProvisioner()
  const setEnv = vi.spyOn(provisioner, 'setEnv')
  const { controlPlane } = buildControlPlane({ billing, provisioner })
  const app = createControlPlaneApp({
    controlPlane,
    billing,
    payments: new FakeTenantBillingGateway(),
    deviceGrants: new MemoryDeviceGrantStore(seqCodes()),
    sessionSecret: 'sess-secret',
    baseUrl: ''
  })
  return { app, controlPlane, setEnv }
}

type App = ReturnType<typeof membersApp>['app']

async function signIn(app: App): Promise<string> {
  const res = await app.request('/auth/callback?code=code_a')
  return (res.headers.get('set-cookie') ?? '').split(';')[0]
}

async function provisionFor(app: App, plan = 'team'): Promise<void> {
  await app.request('/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'checkout.completed', customerRef: 'user_a', plan })
  })
}

/** Run the full claim handshake for `id`, leaving it as the tenant's owner. */
async function claimAs(app: App, cookie: string, id: ReturnType<typeof makeIdentity>) {
  const start = (await (
    await app.request('/device/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ did: id.did })
    })
  ).json()) as { deviceCode: string; userCode: string; nonce: string }
  await app.request('/claim', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: `userCode=${encodeURIComponent(start.userCode)}`
  })
  await app.request('/device/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      deviceCode: start.deviceCode,
      challenge: { did: id.did, nonce: start.nonce, signature: id.sign(start.nonce) }
    })
  })
  return start
}

/** Start a grant for a would-be member and have the owner invite them. */
async function invite(app: App, cookie: string, did: string, role = 'member') {
  const start = (await (
    await app.request('/device/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ did })
    })
  ).json()) as { deviceCode: string; userCode: string; nonce: string }
  const res = await app.request('/account/members/invite', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: `userCode=${encodeURIComponent(start.userCode)}&role=${role}`
  })
  return { res, start }
}

const membersOf = async (app: App, cookie: string) =>
  (await (await app.request('/account/members', { headers: { cookie } })).json()) as {
    members: { did: string; role: string }[]
    seatsUsed: number
    seats: number
  }

describe('tenant membership', () => {
  it('adds an invited DID to the roster without rebinding the tenant', async () => {
    const { app, controlPlane } = membersApp()
    await provisionFor(app)
    const cookie = await signIn(app)
    const owner = makeIdentity()
    const colleague = makeIdentity()
    await claimAs(app, cookie, owner)

    const { res } = await invite(app, cookie, colleague.did)
    expect(res.status).toBe(200)

    const view = await membersOf(app, cookie)
    expect(view.members.map((m) => m.did)).toEqual([owner.did, colleague.did])
    expect(view.seatsUsed).toBe(2)

    // The load-bearing part: the tenant's OWN bound identity is untouched.
    // Binding here would hand the whole hub to the invitee.
    const tenant = await controlPlane.getTenantForBilling('user_a')
    expect(tenant?.did).toBe(owner.did)
  })

  it('pushes the roster to the hub as HUB_TRUSTED_DIDS, never empty', async () => {
    const { app, setEnv } = membersApp()
    await provisionFor(app)
    const cookie = await signIn(app)
    const owner = makeIdentity()
    const colleague = makeIdentity()
    await claimAs(app, cookie, owner)
    await invite(app, cookie, colleague.did)

    const envs = setEnv.mock.calls.map((call) => call[1])
    const last = envs.at(-1) ?? {}
    expect(last.HUB_TRUSTED_DIDS).toBe(`${owner.did},${colleague.did}`)
    // No push may ever carry an empty policy — `checkTrustedRoots` reads absent
    // and empty identically, so that hub would be open while looking configured.
    for (const env of envs) expect(env.HUB_TRUSTED_DIDS).not.toBe('')
  })

  it('refuses a 4th member on a 3-seat plan and keeps the 3 who are there', async () => {
    const { app } = membersApp()
    await provisionFor(app, 'team') // seats: 3
    const cookie = await signIn(app)
    await claimAs(app, cookie, makeIdentity())
    await invite(app, cookie, makeIdentity().did)
    await invite(app, cookie, makeIdentity().did)

    const before = await membersOf(app, cookie)
    expect(before.seatsUsed).toBe(3)

    const { res } = await invite(app, cookie, makeIdentity().did)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'seats-exhausted', used: 3, seats: 3 })

    const after = await membersOf(app, cookie)
    expect(after.members).toHaveLength(3)
    expect(after.members.map((m) => m.did)).toEqual(before.members.map((m) => m.did))
  })

  it('admits a guest at a full seat count, uncounted', async () => {
    const { app } = membersApp()
    await provisionFor(app, 'team')
    const cookie = await signIn(app)
    await claimAs(app, cookie, makeIdentity())
    await invite(app, cookie, makeIdentity().did)
    await invite(app, cookie, makeIdentity().did)

    const { res } = await invite(app, cookie, makeIdentity().did, 'guest')
    expect(res.status).toBe(200)
    const view = await membersOf(app, cookie)
    expect(view.members).toHaveLength(4)
    expect(view.seatsUsed).toBe(3)
  })

  it('a refused invite leaves no redeemable code behind', async () => {
    const { app } = membersApp()
    await provisionFor(app, 'team')
    const cookie = await signIn(app)
    await claimAs(app, cookie, makeIdentity())
    await invite(app, cookie, makeIdentity().did)
    await invite(app, cookie, makeIdentity().did)

    const intruder = makeIdentity()
    const { res, start } = await invite(app, cookie, intruder.did)
    expect(res.status).toBe(409)
    // The grant was never approved, so polling stays pending rather than
    // completing on the strength of an invitation that was refused.
    const poll = await app.request('/device/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceCode: start.deviceCode,
        challenge: {
          did: intruder.did,
          nonce: start.nonce,
          signature: intruder.sign(start.nonce)
        }
      })
    })
    expect(await poll.json()).toEqual({ status: 'pending' })
  })

  it('removes a member and narrows the policy, but never the last owner', async () => {
    const { app, setEnv } = membersApp()
    await provisionFor(app)
    const cookie = await signIn(app)
    const owner = makeIdentity()
    const colleague = makeIdentity()
    await claimAs(app, cookie, owner)
    await invite(app, cookie, colleague.did)

    const removed = await app.request('/account/members/remove', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: `did=${encodeURIComponent(colleague.did)}`
    })
    expect(removed.status).toBe(200)
    expect((setEnv.mock.calls.at(-1)?.[1] ?? {}).HUB_TRUSTED_DIDS).toBe(owner.did)

    const lastOwner = await app.request('/account/members/remove', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: `did=${encodeURIComponent(owner.did)}`
    })
    expect(lastOwner.status).toBe(400)
    expect(await lastOwner.json()).toEqual({ error: 'last-owner' })
  })

  // The ordering hazard the exploration flagged: `recoverAccount` clears the
  // bound DID, and with a trusted-root policy in force the recovering device is
  // not yet trusted. The policy must be pushed as part of the re-claim, before
  // the caller is told to connect.
  it('re-claims after recovery with the new DID already in the policy', async () => {
    const { app, setEnv } = membersApp()
    await provisionFor(app)
    const cookie = await signIn(app)
    await claimAs(app, cookie, makeIdentity())

    await app.request('/account/recover', { method: 'POST', headers: { cookie } })

    const replacement = makeIdentity()
    await claimAs(app, cookie, replacement)

    const last = setEnv.mock.calls.at(-1)?.[1] ?? {}
    expect(last.HUB_TRUSTED_DIDS).toContain(replacement.did)
    const view = await membersOf(app, cookie)
    expect(view.members.some((m) => m.did === replacement.did)).toBe(true)
  })

  // A record written before `members` existed must still admit its owner. This
  // goes through the tenant STORE directly, because the only way to produce the
  // pre-0436 shape is to write it — which is exactly what a live fleet has.
  it('projects a legacy record as its owner rather than an empty policy', async () => {
    const tenants = new MemoryTenantStore()
    const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
    billing.seed({ id: 'user_a', email: 'a@example.com', emailVerified: true }, 'code_a')
    const provisioner = new MemoryProvisioner()
    const setEnv = vi.spyOn(provisioner, 'setEnv')
    const { controlPlane } = buildControlPlane({ billing, provisioner, tenants })
    const app = createControlPlaneApp({
      controlPlane,
      billing,
      payments: new FakeTenantBillingGateway(),
      deviceGrants: new MemoryDeviceGrantStore(seqCodes()),
      sessionSecret: 'sess-secret',
      baseUrl: ''
    })
    await provisionFor(app)
    const cookie = await signIn(app)
    const owner = makeIdentity()
    await claimAs(app, cookie, owner)

    const tenant = (await controlPlane.getTenantForBilling('user_a'))!
    const { members: _dropped, ...legacy } = tenant
    await tenants.put(legacy)

    setEnv.mockClear()
    await controlPlane.setWritesEnabled(legacy.tenantId, false)
    expect((setEnv.mock.calls.at(-1)?.[1] ?? {}).HUB_TRUSTED_DIDS).toBe(owner.did)
  })
})
