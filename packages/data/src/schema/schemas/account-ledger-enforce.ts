/**
 * Account-ledger write enforcement (explorations 0149/0243 follow-up, wired by 0337).
 *
 * The ledger records (`AccountRecord`/`DeviceRecord`/`RecoveryRecord`/
 * `RevocationRecord`) are only meaningful if not anyone can write them. This is
 * the pure decision both verifiers share:
 *
 * - the **hub** evaluates every relayed ledger change before appending it
 *   (`LedgerGuard` in `@xnetjs/hub`), and
 * - the **client** evaluates every remote ledger change before applying it
 *   (`NodeStore.applyRemoteChange`),
 *
 * each hydrating `LedgerEnforcementState` from its own storage. The rules:
 * only an *active controller* (listed on the account record, not revoked) may
 * write ledger records; account genesis must include its author as a
 * controller; epochs may only move forward, and a revocation must bump the
 * epoch by exactly one so stale authorizations are detectable.
 */

import {
  ACCOUNT_RECORD_SCHEMA_IRI,
  DEVICE_RECORD_SCHEMA_IRI,
  RECOVERY_RECORD_SCHEMA_IRI,
  REVOCATION_RECORD_SCHEMA_IRI
} from './account-ledger'

export type LedgerWriteKind = 'account' | 'device' | 'recovery' | 'revocation'

/** Map a schema IRI to the ledger record kind it writes, or null for non-ledger schemas. */
export function ledgerWriteKind(schemaId: string | undefined): LedgerWriteKind | null {
  switch (schemaId) {
    case ACCOUNT_RECORD_SCHEMA_IRI:
      return 'account'
    case DEVICE_RECORD_SCHEMA_IRI:
      return 'device'
    case RECOVERY_RECORD_SCHEMA_IRI:
      return 'recovery'
    case REVOCATION_RECORD_SCHEMA_IRI:
      return 'revocation'
    default:
      return null
  }
}

/** The account this ledger record belongs to (accountId on the root, account elsewhere). */
export function ledgerAccountId(
  kind: LedgerWriteKind,
  properties: Record<string, unknown>
): string | null {
  const value = kind === 'account' ? properties.accountId : properties.account
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** What a verifier knows about an account when evaluating a write. */
export interface LedgerEnforcementState {
  /** Latest account record, or null when this verifier has never seen the account. */
  account: { accountId: string; controllers: readonly string[]; epoch: number } | null
  /** Whether the writing author has a revocation record under this account. */
  authorRevoked: boolean
}

export type LedgerWriteDecision = { allowed: true; genesis?: boolean } | LedgerWriteDenied

export type LedgerWriteDenied = {
  allowed: false
  reason: string
}

const deny = (reason: string): LedgerWriteDenied => ({ allowed: false, reason })

const controllersOf = (properties: Record<string, unknown>): string[] | null => {
  const raw = properties.controllers
  if (!Array.isArray(raw)) return null
  const dids = raw.filter((entry): entry is string => typeof entry === 'string')
  return dids.length === raw.length ? dids : null
}

const epochOf = (properties: Record<string, unknown>): number | null => {
  const raw = properties.epoch
  if (raw === undefined || raw === null) return null
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : Number.NaN
}

const isActiveController = (authorDid: string, state: LedgerEnforcementState): boolean =>
  !state.authorRevoked && (state.account?.controllers.includes(authorDid) ?? false)

/**
 * Decide whether `authorDid` may write this ledger record given what the
 * verifier currently knows. Pure — hydration is the caller's job.
 */
export function evaluateLedgerWrite(input: {
  schemaId: string | undefined
  authorDid: string
  properties: Record<string, unknown>
  state: LedgerEnforcementState
}): LedgerWriteDecision {
  const kind = ledgerWriteKind(input.schemaId)
  if (!kind) return { allowed: true }

  const accountId = ledgerAccountId(kind, input.properties)
  if (!accountId) return deny(`Ledger ${kind} record is missing its account reference`)

  const { state } = input

  if (kind === 'account') {
    const controllers = controllersOf(input.properties)
    if (!controllers || controllers.length === 0) {
      return deny('Account record must list at least one controller DID')
    }
    const epoch = epochOf(input.properties) ?? 0
    if (Number.isNaN(epoch)) return deny('Account record epoch must be a number')

    if (!state.account) {
      // Genesis: the author founds the account and must be one of its controllers.
      if (!controllers.includes(input.authorDid)) {
        return deny('Account genesis must include its author among the controllers')
      }
      return { allowed: true, genesis: true }
    }
    if (state.account.accountId !== accountId) {
      return deny('Account record accountId cannot change')
    }
    if (!isActiveController(input.authorDid, state)) {
      return deny('Only an active controller may update the account record')
    }
    if (epoch < state.account.epoch) {
      return deny(
        `Account epoch may not move backwards (${epoch} < ${state.account.epoch})`
      )
    }
    return { allowed: true }
  }

  // device / recovery / revocation all require a known account + active controller.
  if (!state.account) {
    return deny(`Ledger ${kind} record references unknown account ${accountId}`)
  }
  if (state.account.accountId !== accountId) {
    return deny('Ledger record account does not match the verifier state')
  }
  if (!isActiveController(input.authorDid, state)) {
    return deny(`Only an active controller may write ${kind} records for this account`)
  }

  if (kind === 'device') {
    const epoch = epochOf(input.properties)
    if (epoch === null || Number.isNaN(epoch) || epoch !== state.account.epoch) {
      return deny(
        `Device admission must carry the current account epoch ${state.account.epoch}`
      )
    }
    const deviceDid = input.properties.deviceDid
    if (typeof deviceDid !== 'string' || deviceDid.length === 0) {
      return deny('Device record must name the admitted device DID')
    }
    return { allowed: true }
  }

  if (kind === 'revocation') {
    // A revocation and its account-record epoch bump are two writes that may
    // arrive in either order: accept the revocation carrying the next epoch
    // (revocation first) or the now-current epoch (account bump landed first).
    const epoch = epochOf(input.properties)
    const validEpoch =
      epoch !== null &&
      !Number.isNaN(epoch) &&
      (epoch === state.account.epoch + 1 || epoch === state.account.epoch)
    if (!validEpoch) {
      return deny(
        `Revocation must carry epoch ${state.account.epoch} or ${state.account.epoch + 1}`
      )
    }
    const subject = input.properties.subject
    if (typeof subject !== 'string' || subject.length === 0) {
      return deny('Revocation must name its subject')
    }
    return { allowed: true }
  }

  // recovery: controller check above is the whole rule (records carry only
  // public commitments, never secrets).
  return { allowed: true }
}

/**
 * Fold an accepted account-record write into verifier state (device/recovery
 * records don't alter controller state; revocations are folded by re-checking
 * `authorRevoked` at hydration time).
 */
export function foldAccountRecord(
  properties: Record<string, unknown>
): LedgerEnforcementState['account'] {
  const accountId = ledgerAccountId('account', properties)
  const controllers = controllersOf(properties) ?? []
  const epoch = epochOf(properties)
  return {
    accountId: accountId ?? '',
    controllers,
    epoch: typeof epoch === 'number' && !Number.isNaN(epoch) ? epoch : 0
  }
}
