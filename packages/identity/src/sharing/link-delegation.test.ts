/**
 * Link-keypair delegation chains (B2 of exploration 0169) and
 * revocation-store persistence.
 */

import { describe, expect, it } from 'vitest'
import { generateIdentity } from '../did'
import {
  claimLinkDelegation,
  createLinkDelegation,
  createShareLinkKeypair,
  decodeLinkSecret,
  encodeLinkSecret,
  verifyLinkClaim
} from './link-delegation'
import {
  createRevocation,
  deserializeRevocation,
  RevocationStore,
  serializeRevocation,
  type Revocation,
  type RevocationPersistence
} from './index'

const RESOURCE = 'xnet://did:key:zOwner/page/doc-1'

describe('link delegation chains', () => {
  it('round-trips the link secret through fragment encoding', () => {
    const link = createShareLinkKeypair()
    const secret = encodeLinkSecret(link.signingKey)
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeLinkSecret(secret)).toEqual(link.signingKey)
  })

  it('verifies a full owner → link → recipient chain', () => {
    const owner = generateIdentity()
    const recipient = generateIdentity()
    const link = createShareLinkKeypair()

    const delegation = createLinkDelegation(owner.identity.did, owner.privateKey, link, {
      resource: RESOURCE,
      permission: 'write'
    })
    expect(delegation.linkDid).toBe(link.did)

    const chain = claimLinkDelegation(
      delegation,
      encodeLinkSecret(link.signingKey),
      recipient.identity.did
    )

    const verified = verifyLinkClaim(chain)
    expect(verified.valid).toBe(true)
    expect(verified.owner).toBe(owner.identity.did)
    expect(verified.recipient).toBe(recipient.identity.did)
    expect(verified.capabilities).toContainEqual({ with: RESOURCE, can: 'xnet/write' })
  })

  it('rejects claims signed with the wrong link secret', () => {
    const owner = generateIdentity()
    const recipient = generateIdentity()
    const link = createShareLinkKeypair()
    const otherLink = createShareLinkKeypair()

    const delegation = createLinkDelegation(owner.identity.did, owner.privateKey, link, {
      resource: RESOURCE,
      permission: 'read'
    })

    expect(() =>
      claimLinkDelegation(delegation, otherLink.signingKey, recipient.identity.did)
    ).toThrow(/does not match the delegation audience/)
  })

  it('caps the sub-delegation expiry at the owner delegation expiry', () => {
    const owner = generateIdentity()
    const recipient = generateIdentity()
    const link = createShareLinkKeypair()

    const delegation = createLinkDelegation(owner.identity.did, owner.privateKey, link, {
      resource: RESOURCE,
      permission: 'read',
      expiresIn: 60_000
    })

    const chain = claimLinkDelegation(delegation, link.signingKey, recipient.identity.did, {
      expiresIn: 365 * 24 * 60 * 60 * 1000
    })

    const verified = verifyLinkClaim(chain)
    expect(verified.valid).toBe(true)
  })

  it('rejects chains missing the owner proof', () => {
    const recipient = generateIdentity()
    const link = createShareLinkKeypair()

    // A bare link → recipient token without the owner delegation proof
    const delegation = createLinkDelegation(link.did, link.signingKey, link, {
      resource: RESOURCE,
      permission: 'read'
    })
    const verified = verifyLinkClaim(delegation.token)
    expect(verified.valid).toBe(false)
    expect(verified.error).toMatch(/missing the owner delegation proof/)
    expect(recipient.identity.did).toBeTruthy()
  })
})

describe('revocation store persistence', () => {
  const makeMemoryPersistence = (): RevocationPersistence & { saved: Revocation[] } => {
    const saved: Revocation[] = []
    return {
      saved,
      load: () => saved.map((entry) => deserializeRevocation(serializeRevocation(entry))),
      save: (revocation) => {
        saved.push(revocation)
      }
    }
  }

  it('persists revocations and hydrates them after a restart', async () => {
    const owner = generateIdentity()
    const link = createShareLinkKeypair()
    const delegation = createLinkDelegation(owner.identity.did, owner.privateKey, link, {
      resource: RESOURCE,
      permission: 'read'
    })

    const persistence = makeMemoryPersistence()
    const store = new RevocationStore(persistence)
    const revocation = createRevocation(owner.identity.did, owner.privateKey, delegation.token)
    store.revoke(revocation, delegation.token)
    expect(persistence.saved).toHaveLength(1)

    const restarted = new RevocationStore(persistence)
    expect(restarted.isRevoked(revocation.tokenHash)).toBe(false)
    const loaded = await restarted.hydrate()
    expect(loaded).toBe(1)
    expect(restarted.isRevoked(revocation.tokenHash)).toBe(true)
  })

  it('skips tampered entries on hydrate', async () => {
    const owner = generateIdentity()
    const link = createShareLinkKeypair()
    const delegation = createLinkDelegation(owner.identity.did, owner.privateKey, link, {
      resource: RESOURCE,
      permission: 'read'
    })

    const revocation = createRevocation(owner.identity.did, owner.privateKey, delegation.token)
    const tampered = { ...revocation, revokedAt: revocation.revokedAt + 1 }

    const store = new RevocationStore({
      load: () => [tampered],
      save: () => {}
    })
    expect(await store.hydrate()).toBe(0)
    expect(store.isRevoked(revocation.tokenHash)).toBe(false)
  })

  it('round-trips revocations through JSON serialization', () => {
    const owner = generateIdentity()
    const link = createShareLinkKeypair()
    const delegation = createLinkDelegation(owner.identity.did, owner.privateKey, link, {
      resource: RESOURCE,
      permission: 'read'
    })
    const revocation = createRevocation(owner.identity.did, owner.privateKey, delegation.token)

    const json = JSON.stringify(serializeRevocation(revocation))
    const restored = deserializeRevocation(JSON.parse(json))
    expect(restored).toEqual(revocation)
  })
})
