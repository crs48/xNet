/**
 * xNet Cloud — the app side of the device-grant "claim your hub" flow (RFC 8628).
 *
 * The app creates its passkey DID locally, then:
 *   1. `startDeviceClaim` → gets a short `userCode` to show, a `deviceCode` to poll, and
 *      a server-issued `nonce` to sign with the DID key (exploration 0243).
 *   2. The user approves the `userCode` in the signed-in cloud dashboard.
 *   3. `pollDeviceClaim` → once approved, the control plane verifies the signed challenge
 *      and binds the DID (dual proof), returning the hub URL the caller persists via
 *      `setPersistedHubUrl`.
 *
 * The app never embeds WorkOS — it only ever talks to the control plane's device
 * endpoints (exploration 0192). `signChallenge` is injected so this stays pure and
 * testable without the real identity manager.
 */

export interface DeviceClaimStart {
  deviceCode: string
  userCode: string
  /** Server-issued, single-use nonce the app signs with its DID key (exploration 0243). */
  nonce: string
  verificationUri: string
  intervalSec: number
  expiresInSec: number
}

export interface DidChallenge {
  did: string
  nonce: string
  signature: string
}

export type DeviceClaimPoll =
  | { status: 'pending' }
  | { status: 'complete'; hubUrl: string }
  | { status: 'error'; error: string }

/** Begin a device claim for a locally-created DID. */
export async function startDeviceClaim(
  cloudOrigin: string,
  did: string,
  fetchImpl: typeof fetch = fetch
): Promise<DeviceClaimStart> {
  const res = await fetchImpl(`${cloudOrigin}/device/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ did })
  })
  if (!res.ok) throw new Error(`device/start failed: ${res.status}`)
  return (await res.json()) as DeviceClaimStart
}

/** Poll once for completion. Returns `pending` until the user approves the code. */
export async function pollDeviceClaim(
  cloudOrigin: string,
  deviceCode: string,
  challenge: DidChallenge,
  fetchImpl: typeof fetch = fetch
): Promise<DeviceClaimPoll> {
  const res = await fetchImpl(`${cloudOrigin}/device/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceCode, challenge })
  })
  const body = (await res.json().catch(() => ({}))) as Partial<DeviceClaimPoll> & { error?: string }
  if (!res.ok) return { status: 'error', error: body.error ?? `http_${res.status}` }
  if (body.status === 'complete' && typeof body.hubUrl === 'string') {
    return { status: 'complete', hubUrl: body.hubUrl }
  }
  return { status: 'pending' }
}
