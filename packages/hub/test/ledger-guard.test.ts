/**
 * Account-ledger enforcement at the relay (0149/0243, wired by 0337): the hub
 * refuses ledger records not signed by an active controller of the account.
 */
import type { AuthContext } from '../src/auth/ucan'
import type { SerializedNodeChange } from '../src/storage/interface'
import type { DID } from '@xnetjs/core'
import { bytesToBase64, generateSigningKeyPair } from '@xnetjs/crypto'
import {
  ACCOUNT_RECORD_SCHEMA_IRI,
  DEVICE_RECORD_SCHEMA_IRI,
  REVOCATION_RECORD_SCHEMA_IRI,
  accountRecordId,
  deviceRecordId,
  revocationRecordId
} from '@xnetjs/data'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { createChangeId, createUnsignedChange, signChange } from '@xnetjs/sync'
import { describe, expect, it } from 'vitest'
import { NodeRelayService } from '../src/services/node-relay'
import { createMemoryStorage } from '../src/storage/memory'

const ROOM = 'author-room'
const ACCOUNT = 'xnet:account:test'

const alice = (() => {
  const { privateKey } = generateSigningKeyPair()
  return { privateKey, identity: identityFromPrivateKey(privateKey) }
})()
const mallory = (() => {
  const { privateKey } = generateSigningKeyPair()
  return { privateKey, identity: identityFromPrivateKey(privateKey) }
})()

let lamport = 0
const signedChange = (
  author: typeof alice,
  nodeId: string,
  schemaId: string,
  properties: Record<string, unknown>
): SerializedNodeChange => {
  lamport += 1
  const payload = { nodeId, schemaId, properties }
  const unsigned = createUnsignedChange({
    id: createChangeId(),
    type: 'node-change',
    payload,
    parentHash: null,
    authorDID: author.identity.did as DID,
    wallTime: 1_700_000_000_000 + lamport,
    lamport
  })
  const signed = signChange(unsigned, author.privateKey)
  return {
    id: signed.id,
    type: signed.type,
    hash: signed.hash,
    room: ROOM,
    nodeId,
    schemaId,
    lamportTime: signed.lamport,
    lamportAuthor: signed.authorDID,
    authorDid: signed.authorDID,
    wallTime: signed.wallTime,
    parentHash: signed.parentHash,
    payload: signed.payload,
    signatureB64: bytesToBase64(signed.signature),
    protocolVersion: signed.protocolVersion
  }
}

const msg = (change: SerializedNodeChange) => ({ type: 'node-change', room: ROOM, change }) as const

const allow = { did: 'did:key:any', can: () => true } as unknown as AuthContext

describe('relay ledger guard', () => {
  it('accepts genesis, controller writes; rejects non-controller writes', async () => {
    const storage = createMemoryStorage()
    const relay = new NodeRelayService(storage, {}, {})

    // Genesis by Alice, listing herself as controller: accepted.
    const genesis = signedChange(alice, accountRecordId(ACCOUNT), ACCOUNT_RECORD_SCHEMA_IRI, {
      accountId: ACCOUNT,
      controllers: [alice.identity.did],
      epoch: 0
    })
    await expect(relay.handleNodeChange(msg(genesis), allow)).resolves.toBe(true)

    // Alice admits a device at the current epoch: accepted.
    const admit = signedChange(
      alice,
      deviceRecordId(ACCOUNT, 'did:key:new-device'),
      DEVICE_RECORD_SCHEMA_IRI,
      { account: ACCOUNT, deviceDid: 'did:key:new-device', status: 'active', epoch: 0 }
    )
    await expect(relay.handleNodeChange(msg(admit), allow)).resolves.toBe(true)

    // Mallory (signing as herself — signature is valid) tries to admit her own
    // device to Alice's account: rejected, she is no controller.
    const hijack = signedChange(
      mallory,
      deviceRecordId(ACCOUNT, mallory.identity.did),
      DEVICE_RECORD_SCHEMA_IRI,
      { account: ACCOUNT, deviceDid: mallory.identity.did, status: 'active', epoch: 0 }
    )
    await expect(relay.handleNodeChange(msg(hijack), allow)).rejects.toMatchObject({
      code: 'LEDGER_UNAUTHORIZED'
    })
    expect(await storage.hasNodeChange(hijack.hash)).toBe(false)

    // Mallory cannot take over the account record either.
    const takeover = signedChange(mallory, accountRecordId(ACCOUNT), ACCOUNT_RECORD_SCHEMA_IRI, {
      accountId: ACCOUNT,
      controllers: [mallory.identity.did],
      epoch: 1
    })
    await expect(relay.handleNodeChange(msg(takeover), allow)).rejects.toMatchObject({
      code: 'LEDGER_UNAUTHORIZED'
    })
  })

  it('rejects genesis whose author is not among the controllers', async () => {
    const storage = createMemoryStorage()
    const relay = new NodeRelayService(storage, {}, {})
    const bogus = signedChange(
      mallory,
      accountRecordId('xnet:account:x'),
      ACCOUNT_RECORD_SCHEMA_IRI,
      {
        accountId: 'xnet:account:x',
        controllers: [alice.identity.did],
        epoch: 0
      }
    )
    await expect(relay.handleNodeChange(msg(bogus), allow)).rejects.toMatchObject({
      code: 'LEDGER_UNAUTHORIZED'
    })
  })

  it('a revoked controller loses write access; epoch regression is rejected', async () => {
    const storage = createMemoryStorage()
    const relay = new NodeRelayService(storage, {}, {})
    const bobKeys = generateSigningKeyPair()
    const bob = {
      privateKey: bobKeys.privateKey,
      identity: identityFromPrivateKey(bobKeys.privateKey)
    }

    const genesis = signedChange(alice, accountRecordId(ACCOUNT), ACCOUNT_RECORD_SCHEMA_IRI, {
      accountId: ACCOUNT,
      controllers: [alice.identity.did, bob.identity.did],
      epoch: 0
    })
    await expect(relay.handleNodeChange(msg(genesis), allow)).resolves.toBe(true)

    // Alice revokes Bob (epoch bumps to 1).
    const revoke = signedChange(
      alice,
      revocationRecordId(ACCOUNT, bob.identity.did),
      REVOCATION_RECORD_SCHEMA_IRI,
      { account: ACCOUNT, subjectKind: 'device', subject: bob.identity.did, epoch: 1 }
    )
    await expect(relay.handleNodeChange(msg(revoke), allow)).resolves.toBe(true)

    // Bob (revoked) can no longer write ledger records.
    const bobWrite = signedChange(
      bob,
      deviceRecordId(ACCOUNT, 'did:key:bobs-new-box'),
      DEVICE_RECORD_SCHEMA_IRI,
      { account: ACCOUNT, deviceDid: 'did:key:bobs-new-box', status: 'active', epoch: 0 }
    )
    await expect(relay.handleNodeChange(msg(bobWrite), allow)).rejects.toMatchObject({
      code: 'LEDGER_UNAUTHORIZED'
    })

    // Account epoch bump to 1 (matching the revocation) is accepted...
    const bump = signedChange(alice, accountRecordId(ACCOUNT), ACCOUNT_RECORD_SCHEMA_IRI, {
      accountId: ACCOUNT,
      controllers: [alice.identity.did],
      epoch: 1
    })
    await expect(relay.handleNodeChange(msg(bump), allow)).resolves.toBe(true)

    // ...but a later attempt to wind the epoch back is not.
    const rollback = signedChange(alice, accountRecordId(ACCOUNT), ACCOUNT_RECORD_SCHEMA_IRI, {
      accountId: ACCOUNT,
      controllers: [alice.identity.did],
      epoch: 0
    })
    await expect(relay.handleNodeChange(msg(rollback), allow)).rejects.toMatchObject({
      code: 'LEDGER_UNAUTHORIZED'
    })
  })
})
