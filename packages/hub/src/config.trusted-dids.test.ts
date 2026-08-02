/**
 * Admission control on a managed hub (exploration 0436 G3).
 *
 * The defect: `checkTrustedRoots` applies a policy only when `config.trustedDids`
 * is a non-empty list, and nothing ever set it — so a self-issued UCAN from a key
 * generated seconds ago was accepted on a hub somebody else was paying for. The
 * control plane now projects a tenant's roster into `HUB_TRUSTED_DIDS`; these
 * tests prove the hub actually reads it, and that a self-hosted hub is unchanged.
 */

import { createUCAN, generateIdentity } from '@xnetjs/identity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { authenticateHttpRequest } from './auth/ucan'
import { resolveConfig } from './config'
import { DEFAULT_CONFIG } from './types'

const ENV_KEYS = ['HUB_TRUSTED_DIDS']
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('resolveTrustedDids', () => {
  // The anti-lock-in invariant: a self-hosted hub sets nothing and behaves
  // exactly as it did before this feature existed.
  it('leaves the policy absent when nothing configures one', () => {
    delete process.env.HUB_TRUSTED_DIDS
    expect(resolveConfig({}).trustedDids).toBeUndefined()
  })

  it('reads a comma-separated policy from the environment', () => {
    process.env.HUB_TRUSTED_DIDS = 'did:key:a, did:key:b'
    expect(resolveConfig({}).trustedDids).toEqual(['did:key:a', 'did:key:b'])
  })

  // An operator who sets an EMPTY value has misconfigured something. Locking
  // every user out of their own hub is a worse answer than the open default they
  // already had — and it is the failure `trustedDidsEnv` refuses to produce.
  it('treats an empty value as absent, never as "trust nobody"', () => {
    process.env.HUB_TRUSTED_DIDS = ''
    expect(resolveConfig({}).trustedDids).toBeUndefined()
    process.env.HUB_TRUSTED_DIDS = ' , , '
    expect(resolveConfig({}).trustedDids).toBeUndefined()
  })

  it('lets an explicit option win, so a self-hoster can set one by hand', () => {
    process.env.HUB_TRUSTED_DIDS = 'did:key:env'
    expect(resolveConfig({ trustedDids: ['did:key:cli'] }).trustedDids).toEqual(['did:key:cli'])
  })
})

describe('a self-issued UCAN against a managed hub', () => {
  const hubDid = 'did:key:zHub'

  const tokenFor = (id: ReturnType<typeof generateIdentity>) =>
    createUCAN({
      issuer: id.identity.did,
      issuerKey: id.privateKey,
      audience: hubDid,
      capabilities: [{ with: '*', can: '*' }]
    })

  const authWith = (trustedDids: string[] | undefined, token: string) =>
    authenticateHttpRequest(`Bearer ${token}`, {
      ...DEFAULT_CONFIG,
      auth: true,
      ...(trustedDids ? { trustedDids } : {})
    })

  it('is REJECTED when the DID is not on the roster', () => {
    const owner = generateIdentity()
    const stranger = generateIdentity()
    expect(authWith([owner.identity.did], tokenFor(stranger))).toBeNull()
  })

  it('is ACCEPTED once that DID is added to the roster', () => {
    const owner = generateIdentity()
    const joiner = generateIdentity()
    const token = tokenFor(joiner)
    expect(authWith([owner.identity.did], token)).toBeNull()
    expect(authWith([owner.identity.did, joiner.identity.did], token)?.did).toBe(
      joiner.identity.did
    )
  })

  // The negative control for the whole file: with no policy the SAME stranger
  // token authenticates. That is the pre-0436 behaviour, and it is what a
  // self-hosted hub must keep — a green run above is only meaningful because
  // this one shows the harness can observe the open case.
  it('is accepted with no policy at all — unchanged for self-host', () => {
    const stranger = generateIdentity()
    expect(authWith(undefined, tokenFor(stranger))?.did).toBe(stranger.identity.did)
  })
})
