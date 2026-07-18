/**
 * Account-ledger write enforcement rules (0149/0243, wired by 0337).
 */
import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_RECORD_SCHEMA_IRI,
  DEVICE_RECORD_SCHEMA_IRI,
  RECOVERY_RECORD_SCHEMA_IRI,
  REVOCATION_RECORD_SCHEMA_IRI
} from './account-ledger'
import {
  evaluateLedgerWrite,
  foldAccountRecord,
  ledgerAccountId,
  ledgerWriteKind,
  type LedgerEnforcementState
} from './account-ledger-enforce'

const ACCOUNT = 'xnet:account:abc'
const ALICE = 'did:key:alice'
const BOB = 'did:key:bob'
const MALLORY = 'did:key:mallory'

const known: LedgerEnforcementState = {
  account: { accountId: ACCOUNT, controllers: [ALICE, BOB], epoch: 2 },
  authorRevoked: false
}
const unknown: LedgerEnforcementState = { account: null, authorRevoked: false }

describe('ledgerWriteKind / ledgerAccountId', () => {
  it('maps ledger schema IRIs and ignores everything else', () => {
    expect(ledgerWriteKind(ACCOUNT_RECORD_SCHEMA_IRI)).toBe('account')
    expect(ledgerWriteKind(DEVICE_RECORD_SCHEMA_IRI)).toBe('device')
    expect(ledgerWriteKind(RECOVERY_RECORD_SCHEMA_IRI)).toBe('recovery')
    expect(ledgerWriteKind(REVOCATION_RECORD_SCHEMA_IRI)).toBe('revocation')
    expect(ledgerWriteKind('xnet://xnet.fyi/Task@1.0.0')).toBeNull()
    expect(ledgerWriteKind(undefined)).toBeNull()
  })

  it('reads accountId on the root and account elsewhere', () => {
    expect(ledgerAccountId('account', { accountId: ACCOUNT })).toBe(ACCOUNT)
    expect(ledgerAccountId('device', { account: ACCOUNT })).toBe(ACCOUNT)
    expect(ledgerAccountId('device', {})).toBeNull()
  })
})

describe('account records', () => {
  it('allows genesis whose author is a controller', () => {
    const decision = evaluateLedgerWrite({
      schemaId: ACCOUNT_RECORD_SCHEMA_IRI,
      authorDid: ALICE,
      properties: { accountId: ACCOUNT, controllers: [ALICE], epoch: 0 },
      state: unknown
    })
    expect(decision).toEqual({ allowed: true, genesis: true })
  })

  it('rejects genesis that excludes its author from the controllers', () => {
    const decision = evaluateLedgerWrite({
      schemaId: ACCOUNT_RECORD_SCHEMA_IRI,
      authorDid: MALLORY,
      properties: { accountId: ACCOUNT, controllers: [ALICE], epoch: 0 },
      state: unknown
    })
    expect(decision.allowed).toBe(false)
  })

  it('rejects an update from a non-controller', () => {
    const decision = evaluateLedgerWrite({
      schemaId: ACCOUNT_RECORD_SCHEMA_IRI,
      authorDid: MALLORY,
      properties: { accountId: ACCOUNT, controllers: [MALLORY], epoch: 2 },
      state: known
    })
    expect(decision.allowed).toBe(false)
  })

  it('rejects an update from a revoked controller', () => {
    const decision = evaluateLedgerWrite({
      schemaId: ACCOUNT_RECORD_SCHEMA_IRI,
      authorDid: BOB,
      properties: { accountId: ACCOUNT, controllers: [BOB], epoch: 2 },
      state: { ...known, authorRevoked: true }
    })
    expect(decision.allowed).toBe(false)
  })

  it('rejects epoch regression', () => {
    const decision = evaluateLedgerWrite({
      schemaId: ACCOUNT_RECORD_SCHEMA_IRI,
      authorDid: ALICE,
      properties: { accountId: ACCOUNT, controllers: [ALICE, BOB], epoch: 1 },
      state: known
    })
    expect(decision.allowed).toBe(false)
  })

  it('rejects an empty controller list', () => {
    const decision = evaluateLedgerWrite({
      schemaId: ACCOUNT_RECORD_SCHEMA_IRI,
      authorDid: ALICE,
      properties: { accountId: ACCOUNT, controllers: [], epoch: 2 },
      state: known
    })
    expect(decision.allowed).toBe(false)
  })
})

describe('device / recovery / revocation records', () => {
  it('allows a controller to admit a device at the current epoch', () => {
    const decision = evaluateLedgerWrite({
      schemaId: DEVICE_RECORD_SCHEMA_IRI,
      authorDid: ALICE,
      properties: { account: ACCOUNT, deviceDid: 'did:key:new', epoch: 2 },
      state: known
    })
    expect(decision.allowed).toBe(true)
  })

  it('rejects device admission at a stale epoch', () => {
    const decision = evaluateLedgerWrite({
      schemaId: DEVICE_RECORD_SCHEMA_IRI,
      authorDid: ALICE,
      properties: { account: ACCOUNT, deviceDid: 'did:key:new', epoch: 1 },
      state: known
    })
    expect(decision.allowed).toBe(false)
  })

  it('rejects device admission by a non-controller', () => {
    const decision = evaluateLedgerWrite({
      schemaId: DEVICE_RECORD_SCHEMA_IRI,
      authorDid: MALLORY,
      properties: { account: ACCOUNT, deviceDid: MALLORY, epoch: 2 },
      state: known
    })
    expect(decision.allowed).toBe(false)
  })

  it('rejects ledger records for an unknown account', () => {
    const decision = evaluateLedgerWrite({
      schemaId: DEVICE_RECORD_SCHEMA_IRI,
      authorDid: ALICE,
      properties: { account: ACCOUNT, deviceDid: 'did:key:new', epoch: 0 },
      state: unknown
    })
    expect(decision.allowed).toBe(false)
  })

  it('allows a controller to register a recovery method', () => {
    const decision = evaluateLedgerWrite({
      schemaId: RECOVERY_RECORD_SCHEMA_IRI,
      authorDid: BOB,
      properties: { account: ACCOUNT, method: 'phrase' },
      state: known
    })
    expect(decision.allowed).toBe(true)
  })

  it('requires revocations to bump (or match a just-bumped) epoch', () => {
    const base = {
      schemaId: REVOCATION_RECORD_SCHEMA_IRI,
      authorDid: ALICE,
      state: known
    }
    expect(
      evaluateLedgerWrite({
        ...base,
        properties: { account: ACCOUNT, subject: BOB, epoch: 3 }
      }).allowed
    ).toBe(true)
    // Account bump landed first: revocation carries the now-current epoch.
    expect(
      evaluateLedgerWrite({
        ...base,
        properties: { account: ACCOUNT, subject: BOB, epoch: 2 }
      }).allowed
    ).toBe(true)
    expect(
      evaluateLedgerWrite({
        ...base,
        properties: { account: ACCOUNT, subject: BOB, epoch: 5 }
      }).allowed
    ).toBe(false)
    expect(
      evaluateLedgerWrite({
        ...base,
        properties: { account: ACCOUNT, subject: BOB }
      }).allowed
    ).toBe(false)
  })

  it('non-ledger schemas always pass', () => {
    const decision = evaluateLedgerWrite({
      schemaId: 'xnet://xnet.fyi/Task@1.0.0',
      authorDid: MALLORY,
      properties: {},
      state: unknown
    })
    expect(decision.allowed).toBe(true)
  })
})

describe('foldAccountRecord', () => {
  it('extracts controllers and epoch with defaults', () => {
    expect(
      foldAccountRecord({ accountId: ACCOUNT, controllers: [ALICE], epoch: 3 })
    ).toEqual({ accountId: ACCOUNT, controllers: [ALICE], epoch: 3 })
    expect(foldAccountRecord({ accountId: ACCOUNT })).toEqual({
      accountId: ACCOUNT,
      controllers: [],
      epoch: 0
    })
  })
})
