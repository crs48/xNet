/**
 * Account/device ledger operations (explorations 0149 + 0243, Phase 2).
 *
 * Pure builders that turn a ledger intent ("admit this device", "revoke that key")
 * into the deterministic node to upsert, plus `accountState` to resolve the current
 * epoch and active devices from a set of ledger records. The store/hub wiring (and the
 * controller-signature + content-key re-wrap that ride on admit/revoke) call these;
 * keeping them pure makes the rules unit-testable in isolation.
 */

import type { SchemaIRI } from '../node'
import {
  ACCOUNT_RECORD_SCHEMA_IRI,
  DEVICE_RECORD_SCHEMA_IRI,
  REVOCATION_RECORD_SCHEMA_IRI,
  accountRecordId,
  deviceRecordId,
  resolveActiveDevices,
  revocationRecordId,
  revokedSubjects,
  type DeviceLike,
  type RevocationLike
} from './account-ledger'

/** A node to upsert: deterministic id + schema + properties (system fields set by the store). */
export interface LedgerNodeIntent {
  id: string
  schemaId: SchemaIRI
  properties: Record<string, unknown>
}

/** Create the account root record. Epoch starts at 0. */
export function createAccountRecord(args: {
  accountId: string
  controllers: readonly string[]
  label?: string
  epoch?: number
}): LedgerNodeIntent {
  return {
    id: accountRecordId(args.accountId),
    schemaId: ACCOUNT_RECORD_SCHEMA_IRI as SchemaIRI,
    properties: {
      accountId: args.accountId,
      ...(args.label ? { label: args.label } : {}),
      controllers: [...args.controllers],
      epoch: args.epoch ?? 0
    }
  }
}

/** Admit a device to an account at the current epoch (upsert by account+device). */
export function admitDeviceRecord(args: {
  accountId: string
  deviceDid: string
  addedBy: string
  epoch: number
  nowMs: number
  label?: string
  rpId?: string
  credentialIdHash?: string
  capabilities?: unknown
}): LedgerNodeIntent {
  return {
    id: deviceRecordId(args.accountId, args.deviceDid),
    schemaId: DEVICE_RECORD_SCHEMA_IRI as SchemaIRI,
    properties: {
      account: args.accountId,
      deviceDid: args.deviceDid,
      status: 'active',
      addedBy: args.addedBy,
      addedAt: args.nowMs,
      lastSeenAt: args.nowMs,
      epoch: args.epoch,
      ...(args.label ? { label: args.label } : {}),
      ...(args.rpId ? { rpId: args.rpId } : {}),
      ...(args.credentialIdHash ? { credentialIdHash: args.credentialIdHash } : {}),
      ...(args.capabilities !== undefined ? { capabilities: args.capabilities } : {})
    }
  }
}

/** Next epoch after a revocation. Each revocation bumps the account epoch by one. */
export function nextEpoch(currentEpoch: number): number {
  return currentEpoch + 1
}

/**
 * Revoke a device or recovery method. Returns the `RevocationRecord` to upsert *and*
 * the account's new epoch (the caller bumps `AccountRecord.epoch` to match) so stale
 * authorizations at the old epoch are detectable.
 */
export function revokeSubjectRecord(args: {
  accountId: string
  subject: string
  subjectKind: 'device' | 'recovery'
  signedBy: string
  currentEpoch: number
  reason?: string
  nowMs: number
}): { revocation: LedgerNodeIntent; nextEpoch: number } {
  const epoch = nextEpoch(args.currentEpoch)
  return {
    nextEpoch: epoch,
    revocation: {
      id: revocationRecordId(args.accountId, args.subject),
      schemaId: REVOCATION_RECORD_SCHEMA_IRI as SchemaIRI,
      properties: {
        account: args.accountId,
        subjectKind: args.subjectKind,
        subject: args.subject,
        signedBy: args.signedBy,
        effectiveAt: args.nowMs,
        epoch,
        ...(args.reason ? { reason: args.reason } : {})
      }
    }
  }
}

/** Convenience: revoke a device by DID. */
export function revokeDeviceRecord(args: {
  accountId: string
  deviceDid: string
  signedBy: string
  currentEpoch: number
  reason?: string
  nowMs: number
}): { revocation: LedgerNodeIntent; nextEpoch: number } {
  return revokeSubjectRecord({ ...args, subject: args.deviceDid, subjectKind: 'device' })
}

/**
 * Resolve an account's current state from its ledger records: the current epoch and
 * the set of devices that may currently act as the account.
 */
export function accountState(input: {
  account?: { accountId: string; epoch?: number } | null
  devices: readonly DeviceLike[]
  revocations: readonly RevocationLike[]
}): { epoch: number; activeDevices: DeviceLike[]; revoked: ReadonlySet<string> } {
  return {
    epoch: input.account?.epoch ?? 0,
    activeDevices: resolveActiveDevices(input.devices, input.revocations),
    revoked: revokedSubjects(input.revocations)
  }
}
