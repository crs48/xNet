import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_RECORD_SCHEMA_IRI,
  AccountRecordSchema,
  DEVICE_RECORD_SCHEMA_IRI,
  DeviceRecordSchema,
  REVOCATION_RECORD_SCHEMA_IRI,
  type DeviceLike,
  type RevocationLike,
  accountRecordId,
  deviceRecipientExpander,
  deviceRecordId,
  isDeviceAuthorized,
  resolveActiveDevices,
  revocationRecordId,
  revokedSubjects
} from './account-ledger'

const ACCOUNT = 'xnet:account:alice'
const LAPTOP = 'did:key:zLaptop'
const PHONE = 'did:key:zPhone'

const devices: DeviceLike[] = [
  { account: ACCOUNT, deviceDid: LAPTOP, status: 'active' },
  { account: ACCOUNT, deviceDid: PHONE, status: 'active' }
]

describe('account-ledger schemas', () => {
  it('defines the four records with stable IRIs', () => {
    expect(AccountRecordSchema._schemaId).toBe(ACCOUNT_RECORD_SCHEMA_IRI)
    expect(DeviceRecordSchema._schemaId).toBe(DEVICE_RECORD_SCHEMA_IRI)
    expect(ACCOUNT_RECORD_SCHEMA_IRI).toBe('xnet://xnet.fyi/AccountRecord@1.0.0')
    expect(REVOCATION_RECORD_SCHEMA_IRI).toBe('xnet://xnet.fyi/RevocationRecord@1.0.0')
  })

  it('builds deterministic, collision-resistant ids', () => {
    expect(accountRecordId(ACCOUNT)).toBe('account:xnet:account:alice')
    expect(deviceRecordId(ACCOUNT, LAPTOP)).toBe(`device:${ACCOUNT}:${LAPTOP}`)
    expect(revocationRecordId(ACCOUNT, PHONE)).toBe(`revocation:${ACCOUNT}:${PHONE}`)
    // Different subjects → different ids (upsert, don't collide).
    expect(deviceRecordId(ACCOUNT, LAPTOP)).not.toBe(deviceRecordId(ACCOUNT, PHONE))
  })
})

describe('resolveActiveDevices', () => {
  it('returns all active devices when nothing is revoked', () => {
    expect(resolveActiveDevices(devices, [])).toHaveLength(2)
  })

  it('drops a device revoked via a RevocationRecord', () => {
    const revocations: RevocationLike[] = [{ subject: PHONE, subjectKind: 'device' }]
    const active = resolveActiveDevices(devices, revocations)
    expect(active.map((d) => d.deviceDid)).toEqual([LAPTOP])
  })

  it('drops a device whose own status is revoked', () => {
    const withRevokedStatus: DeviceLike[] = [
      { account: ACCOUNT, deviceDid: LAPTOP, status: 'active' },
      { account: ACCOUNT, deviceDid: PHONE, status: 'revoked' }
    ]
    expect(resolveActiveDevices(withRevokedStatus, []).map((d) => d.deviceDid)).toEqual([LAPTOP])
  })
})

describe('isDeviceAuthorized', () => {
  it('authorizes an active admitted device', () => {
    expect(isDeviceAuthorized(ACCOUNT, LAPTOP, devices, [])).toBe(true)
  })

  it('refuses a revoked device even if a stale record still says active', () => {
    const revocations: RevocationLike[] = [{ subject: LAPTOP }]
    expect(isDeviceAuthorized(ACCOUNT, LAPTOP, devices, revocations)).toBe(false)
  })

  it('refuses a device that belongs to a different account', () => {
    expect(isDeviceAuthorized('xnet:account:mallory', LAPTOP, devices, [])).toBe(false)
  })

  it('refuses an unknown device', () => {
    expect(isDeviceAuthorized(ACCOUNT, 'did:key:zUnknown', devices, [])).toBe(false)
  })

  it('revokedSubjects collects every revoked subject', () => {
    const set = revokedSubjects([{ subject: LAPTOP }, { subject: PHONE }])
    expect(set.has(LAPTOP)).toBe(true)
    expect(set.has(PHONE)).toBe(true)
    expect(set.size).toBe(2)
  })
})

describe('deviceRecipientExpander (content-key re-wrap)', () => {
  const devices: DeviceLike[] = [
    { account: ACCOUNT, deviceDid: LAPTOP, status: 'active' },
    { account: ACCOUNT, deviceDid: PHONE, status: 'active' }
  ]

  it('expands a device to all active devices of its account', () => {
    const expand = deviceRecipientExpander(devices, [])
    expect(new Set(expand(LAPTOP))).toEqual(new Set([LAPTOP, PHONE]))
  })

  it('excludes a revoked sibling from the expansion', () => {
    const expand = deviceRecipientExpander(devices, [{ subject: PHONE, subjectKind: 'device' }])
    expect(expand(LAPTOP)).toEqual([LAPTOP])
  })

  it('expands an unknown / unrelated DID to just itself (no cross-account leak)', () => {
    const expand = deviceRecipientExpander(devices, [])
    expect(expand('did:key:zStranger')).toEqual(['did:key:zStranger'])
  })

  it('keeps a revoked device able to read its own content (union with self)', () => {
    const expand = deviceRecipientExpander(devices, [{ subject: PHONE, subjectKind: 'device' }])
    // PHONE itself still maps to its account but its only active sibling is LAPTOP.
    expect(new Set(expand(PHONE))).toEqual(new Set([PHONE, LAPTOP]))
  })
})
