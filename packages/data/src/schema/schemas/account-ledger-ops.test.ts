import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_RECORD_SCHEMA_IRI,
  DEVICE_RECORD_SCHEMA_IRI,
  REVOCATION_RECORD_SCHEMA_IRI,
  accountRecordId,
  deviceRecordId,
  isDeviceAuthorized,
  revocationRecordId,
  type DeviceLike,
  type RevocationLike
} from './account-ledger'
import {
  accountState,
  admitDeviceRecord,
  createAccountRecord,
  nextEpoch,
  revokeDeviceRecord
} from './account-ledger-ops'

const ACCOUNT = 'xnet:account:alice'
const LAPTOP = 'did:key:zLaptop'
const PHONE = 'did:key:zPhone'

describe('createAccountRecord', () => {
  it('builds an AccountRecord intent at epoch 0 with controllers', () => {
    const intent = createAccountRecord({
      accountId: ACCOUNT,
      controllers: [LAPTOP],
      label: 'Alice'
    })
    expect(intent.id).toBe(accountRecordId(ACCOUNT))
    expect(intent.schemaId).toBe(ACCOUNT_RECORD_SCHEMA_IRI)
    expect(intent.properties).toMatchObject({ accountId: ACCOUNT, controllers: [LAPTOP], epoch: 0 })
  })
})

describe('admitDeviceRecord', () => {
  it('builds an active DeviceRecord upserted by account+device', () => {
    const intent = admitDeviceRecord({
      accountId: ACCOUNT,
      deviceDid: PHONE,
      addedBy: LAPTOP,
      epoch: 0,
      nowMs: 1000,
      rpId: 'xnet.fyi'
    })
    expect(intent.id).toBe(deviceRecordId(ACCOUNT, PHONE))
    expect(intent.schemaId).toBe(DEVICE_RECORD_SCHEMA_IRI)
    expect(intent.properties).toMatchObject({
      account: ACCOUNT,
      deviceDid: PHONE,
      status: 'active',
      addedBy: LAPTOP,
      epoch: 0,
      rpId: 'xnet.fyi'
    })
    // Re-admitting the same device upserts (same id), doesn't duplicate.
    expect(
      admitDeviceRecord({
        accountId: ACCOUNT,
        deviceDid: PHONE,
        addedBy: LAPTOP,
        epoch: 1,
        nowMs: 2
      }).id
    ).toBe(intent.id)
  })
})

describe('revokeDeviceRecord', () => {
  it('builds a RevocationRecord and bumps the epoch', () => {
    const { revocation, nextEpoch: epoch } = revokeDeviceRecord({
      accountId: ACCOUNT,
      deviceDid: PHONE,
      signedBy: LAPTOP,
      currentEpoch: 3,
      reason: 'lost',
      nowMs: 5000
    })
    expect(epoch).toBe(4)
    expect(revocation.id).toBe(revocationRecordId(ACCOUNT, PHONE))
    expect(revocation.schemaId).toBe(REVOCATION_RECORD_SCHEMA_IRI)
    expect(revocation.properties).toMatchObject({
      account: ACCOUNT,
      subjectKind: 'device',
      subject: PHONE,
      signedBy: LAPTOP,
      epoch: 4,
      reason: 'lost'
    })
  })

  it('nextEpoch increments monotonically', () => {
    expect(nextEpoch(0)).toBe(1)
    expect(nextEpoch(41)).toBe(42)
  })
})

describe('accountState', () => {
  const devices: DeviceLike[] = [
    { account: ACCOUNT, deviceDid: LAPTOP, status: 'active' },
    { account: ACCOUNT, deviceDid: PHONE, status: 'active' }
  ]

  it('reports the current epoch and active devices', () => {
    const state = accountState({
      account: { accountId: ACCOUNT, epoch: 2 },
      devices,
      revocations: []
    })
    expect(state.epoch).toBe(2)
    expect(state.activeDevices.map((d) => d.deviceDid).sort()).toEqual([LAPTOP, PHONE].sort())
  })

  it('drops a revoked device and the round-trips with isDeviceAuthorized', () => {
    const revocations: RevocationLike[] = [{ subject: PHONE, subjectKind: 'device' }]
    const state = accountState({ account: { accountId: ACCOUNT, epoch: 3 }, devices, revocations })
    expect(state.activeDevices.map((d) => d.deviceDid)).toEqual([LAPTOP])
    expect(state.revoked.has(PHONE)).toBe(true)
    expect(isDeviceAuthorized(ACCOUNT, PHONE, devices, revocations)).toBe(false)
    expect(isDeviceAuthorized(ACCOUNT, LAPTOP, devices, revocations)).toBe(true)
  })

  it('defaults epoch to 0 when there is no account record yet', () => {
    expect(accountState({ devices: [], revocations: [] }).epoch).toBe(0)
  })
})
