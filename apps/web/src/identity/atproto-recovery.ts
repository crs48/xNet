/**
 * apps/web — "Recover with Bluesky" client orchestration (0322/0338/0389).
 *
 * The enrollment side seals the recovery backup key under a PIN and stores the
 * blob at the hub under an ATProto anchor (see `RecoveryAnchorRow` in
 * settings). This is the other half: driving the *release*, which since 0389
 * requires proving live control of the ATProto account, not just knowing its
 * DID.
 *
 * The dance, and why each step is here:
 *
 *  1. **request a challenge** — the hub mints a single-use nonce bound to the
 *     xNet DID being recovered;
 *  2. **write the challenge record** — the recovering user, authenticated to
 *     their PDS by the OAuth ceremony, `putRecord`s the nonce into their own
 *     repo. Only the account holder can do this, so the record is the proof;
 *  3. **release** — the hub reads the record back from the DID document's PDS
 *     and, if it matches, returns the sealed blob;
 *  4. **unseal** — the caller applies the PIN locally (`openEscrow`); the hub
 *     never sees the PIN or the opened secret.
 *
 * This module does steps 1–3 and returns the sealed bytes. Unsealing stays with
 * the caller so the PIN never crosses a module boundary it doesn't need to.
 */

/** What the recovering user must write, returned by the hub's /challenge. */
export interface RecoveryChallenge {
  nonce: string
  expiresAt: number
  collection: string
  rkey: string
}

/** A session that can write a record to the user's own PDS repo. */
export interface AtprotoWriteSession {
  did: string
  putRecord(input: {
    collection: string
    rkey: string
    record: Record<string, unknown>
  }): Promise<void>
}

/** Injected so the flow is testable without a live hub or PDS. */
export interface RecoveryTransport {
  fetchImpl?: typeof fetch
  /** Wall clock, injectable for tests. */
  now?: () => number
}

/**
 * The record body the user writes. Mirrors the hub's expectation
 * (`fyi.xnet.identity.challenge`): the nonce, the DID being recovered, and a
 * client timestamp the hub bounds for freshness.
 */
export function buildChallengeRecord(
  challenge: RecoveryChallenge,
  xnetDid: string,
  now: number
): Record<string, unknown> {
  return {
    $type: challenge.collection,
    nonce: challenge.nonce,
    xnetDid,
    createdAt: new Date(now).toISOString()
  }
}

export class RecoveryError extends Error {
  constructor(
    message: string,
    readonly step: 'challenge' | 'write' | 'release'
  ) {
    super(message)
    this.name = 'RecoveryError'
  }
}

/**
 * Run steps 1–3 and return the sealed escrow blob (base64url), ready for the
 * caller to `openEscrow(..., pin)`.
 *
 * @param hubHttpUrl  the hub holding the escrow (HTTPS base URL)
 * @param xnetDid     the xNet identity being recovered
 * @param session     an authenticated PDS write session for the ATProto account
 */
export async function recoverWithAtproto(
  hubHttpUrl: string,
  xnetDid: string,
  session: AtprotoWriteSession,
  transport: RecoveryTransport = {}
): Promise<string> {
  const doFetch = transport.fetchImpl ?? fetch
  const now = transport.now ?? Date.now
  const base = hubHttpUrl.replace(/\/+$/, '')

  // 1 — challenge
  const challengeRes = await doFetch(`${base}/recovery-anchor/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ xnetDid })
  })
  if (!challengeRes.ok) {
    throw new RecoveryError(`Hub refused a challenge (${challengeRes.status})`, 'challenge')
  }
  const challenge = (await challengeRes.json()) as RecoveryChallenge

  // 2 — write the proof into the user's own repo
  try {
    await session.putRecord({
      collection: challenge.collection,
      rkey: challenge.rkey,
      record: buildChallengeRecord(challenge, xnetDid, now())
    })
  } catch (err) {
    throw new RecoveryError(
      `Could not write the challenge record: ${err instanceof Error ? err.message : String(err)}`,
      'write'
    )
  }

  // 3 — release (the hub reads the record back from the canonical PDS)
  const releaseRes = await doFetch(`${base}/recovery-anchor/release`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ xnetDid, code: challenge.nonce })
  })
  if (releaseRes.status === 404) {
    throw new RecoveryError('No escrow is enrolled for this identity', 'release')
  }
  if (!releaseRes.ok) {
    const detail = await releaseRes
      .json()
      .then((b: { reason?: string }) => b.reason)
      .catch(() => undefined)
    throw new RecoveryError(`Recovery was refused${detail ? `: ${detail}` : ''}`, 'release')
  }
  const body = (await releaseRes.json()) as { sealedEscrowB64?: string }
  if (!body.sealedEscrowB64) {
    throw new RecoveryError('Hub returned no sealed escrow', 'release')
  }
  return body.sealedEscrowB64
}
