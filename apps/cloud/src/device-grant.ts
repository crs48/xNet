/**
 * xNet Cloud — device-grant "claim your hub" flow (RFC 8628 shaped).
 *
 * The non-custodial app must NOT embed WorkOS. Instead it creates its passkey DID
 * locally and gets *claimed* by the already-authenticated dashboard (exploration
 * 0192): the app shows a short `userCode`, the user approves it in the dashboard
 * (proving the billing identity), and the app polls with a signed DID challenge
 * (proving the data identity). The control plane then runs the dual-proof bind.
 *
 * In-memory store to start (same Phase 0/1 stance as the tenant registry); the
 * code generator is injectable so tests are deterministic.
 */

import { randomInt } from 'node:crypto'

export interface DeviceGrant {
  /** Long opaque code the app polls with (kept secret to the app). */
  deviceCode: string
  /** Short human-readable code the user types into the dashboard (e.g. `ABCD-7K2P`). */
  userCode: string
  /** The data DID the app intends to bind. */
  did: string
  status: 'pending' | 'approved' | 'claimed'
  /** WorkOS billing user that approved this device (set on approval). */
  approvedBy?: string
  createdAtMs: number
}

/** How long a device code is valid before the user must restart (10 minutes). */
export const DEVICE_GRANT_TTL_MS = 10 * 60 * 1000

export interface CodeGenerator {
  deviceCode(): string
  userCode(): string
}

// Crockford-ish alphabet: no 0/O/1/I/L/U to avoid ambiguity and accidental words.
const USER_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

export const cryptoCodes: CodeGenerator = {
  deviceCode() {
    let s = ''
    for (let i = 0; i < 40; i++) s += USER_ALPHABET[randomInt(USER_ALPHABET.length)]
    return s
  },
  userCode() {
    const pick = (): string => USER_ALPHABET[randomInt(USER_ALPHABET.length)]
    return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`
  }
}

export interface DeviceGrantStore {
  start(did: string, nowMs: number): DeviceGrant
  getByDeviceCode(deviceCode: string): DeviceGrant | null
  getByUserCode(userCode: string): DeviceGrant | null
  /** Mark a device approved by a billing identity. Returns the grant, or null if unknown. */
  approve(userCode: string, billingUserId: string): DeviceGrant | null
  markClaimed(deviceCode: string): void
}

export class MemoryDeviceGrantStore implements DeviceGrantStore {
  private readonly byDevice = new Map<string, DeviceGrant>()
  private readonly byUser = new Map<string, string>() // userCode -> deviceCode

  constructor(private readonly codes: CodeGenerator = cryptoCodes) {}

  start(did: string, nowMs: number): DeviceGrant {
    const grant: DeviceGrant = {
      deviceCode: this.codes.deviceCode(),
      userCode: this.codes.userCode(),
      did,
      status: 'pending',
      createdAtMs: nowMs
    }
    this.byDevice.set(grant.deviceCode, grant)
    this.byUser.set(grant.userCode, grant.deviceCode)
    return { ...grant }
  }

  getByDeviceCode(deviceCode: string): DeviceGrant | null {
    const g = this.byDevice.get(deviceCode)
    return g ? { ...g } : null
  }

  getByUserCode(userCode: string): DeviceGrant | null {
    const code = this.byUser.get(userCode.trim().toUpperCase())
    return code ? this.getByDeviceCode(code) : null
  }

  approve(userCode: string, billingUserId: string): DeviceGrant | null {
    const code = this.byUser.get(userCode.trim().toUpperCase())
    if (!code) return null
    const g = this.byDevice.get(code)
    if (!g) return null
    g.status = 'approved'
    g.approvedBy = billingUserId
    return { ...g }
  }

  markClaimed(deviceCode: string): void {
    const g = this.byDevice.get(deviceCode)
    if (g) g.status = 'claimed'
  }
}

/** True when a grant has aged past its TTL and must be restarted. */
export function isExpired(grant: DeviceGrant, nowMs: number): boolean {
  return nowMs - grant.createdAtMs > DEVICE_GRANT_TTL_MS
}
