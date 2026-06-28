/**
 * Account/device ledger — the data-plane half of exploration 0149, layered under the
 * 0243 two-identity model.
 *
 * A *stable account subject* (`xnet:account:…`) owns a signed, append-only set of
 * records: which devices may act as the account, which recovery methods exist, and
 * which keys have been revoked. The cloud billing binding can then pin to the account
 * root instead of a single device DID, so adding a device or recovering after a lost
 * passkey becomes a ledger edit rather than a full re-bind.
 *
 * These are the record *schemas* plus the pure "is this device currently authorized?"
 * resolution. Signing/epoch enforcement (the hub rejecting writes not signed by an
 * active controller) and the cloud binding migration are follow-ups; the records are
 * deliberately portable (account referenced by id, not a relation) so they can mirror
 * across hubs.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { created, createdBy, json, number, person, select, text } from '../properties'

const NS = 'xnet://xnet.fyi/'

export const ACCOUNT_RECORD_SCHEMA_IRI = 'xnet://xnet.fyi/AccountRecord@1.0.0'
export const DEVICE_RECORD_SCHEMA_IRI = 'xnet://xnet.fyi/DeviceRecord@1.0.0'
export const RECOVERY_RECORD_SCHEMA_IRI = 'xnet://xnet.fyi/RecoveryRecord@1.0.0'
export const REVOCATION_RECORD_SCHEMA_IRI = 'xnet://xnet.fyi/RevocationRecord@1.0.0'

const ledgerStatus = () =>
  select({
    options: [
      { id: 'active', name: 'Active', color: 'green' },
      { id: 'revoked', name: 'Revoked', color: 'red' }
    ] as const,
    required: true,
    default: 'active'
  })

/** The stable account root that owns the ledger. */
export const AccountRecordSchema = defineSchema({
  name: 'AccountRecord',
  namespace: NS,
  properties: {
    /** Stable subject, e.g. `xnet:account:<hash>`. Appears in grants + the cloud binding. */
    accountId: text({ required: true }),
    label: text({}),
    /** Device DIDs allowed to sign ledger changes (admit/revoke). JSON array of DIDs. */
    controllers: json({}),
    /** Monotonic epoch, bumped on every revocation so stale authorizations are detectable. */
    epoch: number({}),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined
})

/** A device admitted to act as the account. */
export const DeviceRecordSchema = defineSchema({
  name: 'DeviceRecord',
  namespace: NS,
  properties: {
    /** The owning account subject (id, for portability across hub mirrors). */
    account: text({ required: true }),
    /** The device's data identity (`did:key`). */
    deviceDid: person({ required: true }),
    label: text({}),
    /** WebAuthn relying-party id the gating passkey is scoped to. */
    rpId: text({}),
    /** Hash of the WebAuthn credential id (never the credential itself). */
    credentialIdHash: text({}),
    /** Capability hints (JSON), e.g. which scopes this device may exercise. */
    capabilities: json({}),
    status: ledgerStatus(),
    /** The controller DID that admitted this device. */
    addedBy: person({}),
    addedAt: number({}),
    lastSeenAt: number({}),
    /** Epoch at which this device was admitted. */
    epoch: number({}),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined
})

/** A recovery method registered for the account (commitment only — never the secret). */
export const RecoveryRecordSchema = defineSchema({
  name: 'RecoveryRecord',
  namespace: NS,
  properties: {
    account: text({ required: true }),
    method: select({
      options: [
        { id: 'phrase', name: 'Recovery phrase', color: 'blue' },
        { id: 'social', name: 'Social recovery', color: 'purple' },
        { id: 'hardware', name: 'Hardware key', color: 'gray' },
        { id: 'admin', name: 'Enterprise admin', color: 'yellow' },
        { id: 'backup-passkey', name: 'Backup passkey', color: 'green' }
      ] as const,
      required: true,
      default: 'phrase'
    }),
    label: text({}),
    /** Public commitment to the recovery key (e.g. the recovery DID), not the secret. */
    publicKeyHash: text({}),
    status: ledgerStatus(),
    addedBy: person({}),
    addedAt: number({}),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined
})

/** A signed revocation of a device or recovery method; bumps the account epoch. */
export const RevocationRecordSchema = defineSchema({
  name: 'RevocationRecord',
  namespace: NS,
  properties: {
    account: text({ required: true }),
    subjectKind: select({
      options: [
        { id: 'device', name: 'Device', color: 'blue' },
        { id: 'recovery', name: 'Recovery method', color: 'purple' }
      ] as const,
      required: true,
      default: 'device'
    }),
    /** The revoked subject: a device DID or a recovery record id. */
    subject: text({ required: true }),
    reason: text({}),
    effectiveAt: number({}),
    /** Epoch this revocation takes effect at. */
    epoch: number({}),
    /** The controller DID that signed the revocation. */
    signedBy: person({}),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined
})

export type AccountRecord = InferNode<(typeof AccountRecordSchema)['_properties']>
export type DeviceRecord = InferNode<(typeof DeviceRecordSchema)['_properties']>
export type RecoveryRecord = InferNode<(typeof RecoveryRecordSchema)['_properties']>
export type RevocationRecord = InferNode<(typeof RevocationRecordSchema)['_properties']>

// ─── Deterministic ids (upsert, don't duplicate) ─────────────────────────────

export function accountRecordId(accountId: string): string {
  return `account:${accountId}`
}
export function deviceRecordId(accountId: string, deviceDid: string): string {
  return `device:${accountId}:${deviceDid}`
}
export function recoveryRecordId(accountId: string, recoveryKey: string): string {
  return `recovery:${accountId}:${recoveryKey}`
}
export function revocationRecordId(accountId: string, subject: string): string {
  return `revocation:${accountId}:${subject}`
}

// ─── Pure resolution: which devices are currently authorized? ─────────────────

/** Minimal shapes so callers can pass node `.properties` or plain test objects. */
export interface DeviceLike {
  account: string
  deviceDid: string
  status?: string
}
export interface RevocationLike {
  subject: string
  subjectKind?: string
}

/** Set of revoked subjects (device DIDs / recovery ids) for quick membership tests. */
export function revokedSubjects(revocations: readonly RevocationLike[]): Set<string> {
  return new Set(revocations.map((r) => r.subject))
}

/** Devices for an account that are `active` and not revoked. */
export function resolveActiveDevices<T extends DeviceLike>(
  devices: readonly T[],
  revocations: readonly RevocationLike[]
): T[] {
  const revoked = revokedSubjects(revocations)
  return devices.filter((d) => d.status !== 'revoked' && !revoked.has(d.deviceDid))
}

/**
 * Whether `deviceDid` is currently authorized to act as `accountId`: an active device
 * record for that account exists and has not been revoked. This is the check the hub
 * (and any verifier) runs before accepting a device's signature for an account.
 */
export function isDeviceAuthorized(
  accountId: string,
  deviceDid: string,
  devices: readonly DeviceLike[],
  revocations: readonly RevocationLike[]
): boolean {
  const revoked = revokedSubjects(revocations)
  if (revoked.has(deviceDid)) return false
  return devices.some(
    (d) => d.account === accountId && d.deviceDid === deviceDid && d.status !== 'revoked'
  )
}
