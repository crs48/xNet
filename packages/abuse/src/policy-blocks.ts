/**
 * Signed block policy lists for local, workspace, and hub moderation state.
 */

import type { PolicyScope } from './types'
import { base64ToBytes, bytesToBase64, sign, verify } from '@xnetjs/crypto'
import { parseDID } from '@xnetjs/identity'

export type PolicyBlockScope = Extract<PolicyScope, 'user' | 'workspace' | 'community' | 'hub'>

export type PolicyBlockSubjectType = 'did' | 'peerId' | 'domain' | 'url' | 'contentHash' | 'nodeId'

export type PolicyBlockAction = 'reject' | 'hide' | 'quarantine' | 'block-peer'

export type PolicyBlockEntry = {
  id?: string
  subject: string
  subjectType: PolicyBlockSubjectType
  action: PolicyBlockAction
  reason: string
  evidenceRefs?: readonly string[]
  createdAt: number
  expiresAt?: number
  autoBlock?: boolean
}

export type UnsignedPolicyBlockList = {
  v: 1
  kind: 'xnet.policy.block-list'
  id: string
  title?: string
  scope: PolicyBlockScope
  issuerDID: string
  createdAt: number
  updatedAt: number
  entries: readonly PolicyBlockEntry[]
}

export type PolicyBlockListSignature = {
  alg: 'Ed25519'
  value: string
}

export type SignedPolicyBlockList = UnsignedPolicyBlockList & {
  signature: PolicyBlockListSignature
}

export type PolicyBlockListVerificationResult = {
  valid: boolean
  errors: readonly string[]
}

export type PolicyBlockAuditEntry = PolicyBlockEntry & {
  active: boolean
  expired: boolean
}

export type PolicyBlockOverrideScope = Extract<PolicyBlockScope, 'user' | 'workspace'>

export type PolicyBlockOverrideEntry = {
  id?: string
  subject: string
  subjectType: PolicyBlockSubjectType
  scope: PolicyBlockOverrideScope
  reason: string
  evidenceRefs?: readonly string[]
  createdAt: number
  expiresAt?: number
}

export type ResolvedPolicyBlockEntry = PolicyBlockEntry & {
  listId: string
  listScope: PolicyBlockScope
  issuerDID: string
  overridden: boolean
  overrideRefs: readonly string[]
}

export type PolicyBlockSubscriptionResolutionInput = {
  lists: readonly (SignedPolicyBlockList | UnsignedPolicyBlockList)[]
  localOverrides?: readonly PolicyBlockOverrideEntry[]
  now?: number
}

export type PolicyBlockSubscriptionResolution = {
  enforcedEntries: readonly ResolvedPolicyBlockEntry[]
  overriddenEntries: readonly ResolvedPolicyBlockEntry[]
  activeOverrides: readonly PolicyBlockOverrideEntry[]
}

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }

const encoder = new TextEncoder()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const toJsonValue = (value: unknown): JsonValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue)
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => typeof entryValue !== 'undefined')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entryValue]) => [key, toJsonValue(entryValue)])
    )
  }

  return String(value)
}

export const canonicalizePolicyBlockList = (list: UnsignedPolicyBlockList): string =>
  JSON.stringify(toJsonValue(list))

export const policyBlockListSigningBytes = (list: UnsignedPolicyBlockList): Uint8Array =>
  encoder.encode(canonicalizePolicyBlockList(list))

export const isSignedPolicyBlockList = (list: unknown): list is SignedPolicyBlockList =>
  isRecord(list) &&
  list.v === 1 &&
  list.kind === 'xnet.policy.block-list' &&
  isRecord(list.signature) &&
  list.signature.alg === 'Ed25519' &&
  typeof list.signature.value === 'string'

export const createPolicyBlockList = (
  input: Omit<UnsignedPolicyBlockList, 'v' | 'kind' | 'createdAt' | 'updatedAt'> & {
    createdAt?: number
    updatedAt?: number
  }
): UnsignedPolicyBlockList => {
  const now = Date.now()
  return {
    v: 1,
    kind: 'xnet.policy.block-list',
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? input.createdAt ?? now,
    id: input.id,
    title: input.title,
    scope: input.scope,
    issuerDID: input.issuerDID,
    entries: input.entries
  }
}

export const signPolicyBlockList = (
  list: UnsignedPolicyBlockList,
  signingKey: Uint8Array
): SignedPolicyBlockList => ({
  ...list,
  signature: {
    alg: 'Ed25519',
    value: bytesToBase64(sign(policyBlockListSigningBytes(list), signingKey))
  }
})

export const unsignedPolicyBlockList = (
  list: SignedPolicyBlockList | UnsignedPolicyBlockList
): UnsignedPolicyBlockList => ({
  v: list.v,
  kind: list.kind,
  id: list.id,
  title: list.title,
  scope: list.scope,
  issuerDID: list.issuerDID,
  createdAt: list.createdAt,
  updatedAt: list.updatedAt,
  entries: list.entries
})

export const verifySignedPolicyBlockList = (
  list: SignedPolicyBlockList
): PolicyBlockListVerificationResult => {
  const errors: string[] = []

  try {
    const publicKey = parseDID(list.issuerDID)
    const signature = base64ToBytes(list.signature.value)
    const valid = verify(
      policyBlockListSigningBytes(unsignedPolicyBlockList(list)),
      signature,
      publicKey
    )
    if (!valid) {
      errors.push('invalid-signature')
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export const policyBlockEntryIsActive = (entry: PolicyBlockEntry, now = Date.now()): boolean =>
  typeof entry.expiresAt !== 'number' || entry.expiresAt > now

export const auditPolicyBlockEntries = (
  list: SignedPolicyBlockList | UnsignedPolicyBlockList,
  now = Date.now()
): readonly PolicyBlockAuditEntry[] =>
  list.entries.map((entry) => {
    const active = policyBlockEntryIsActive(entry, now)
    return {
      ...entry,
      active,
      expired: !active
    }
  })

export const findPolicyBlockAuditEntry = (
  list: SignedPolicyBlockList | UnsignedPolicyBlockList,
  subject: string,
  subjectType: PolicyBlockSubjectType,
  now = Date.now()
): PolicyBlockAuditEntry | null =>
  auditPolicyBlockEntries(list, now).find(
    (entry) => entry.subject === subject && entry.subjectType === subjectType
  ) ?? null

export const activePolicyBlockEntries = (
  list: SignedPolicyBlockList | UnsignedPolicyBlockList,
  now = Date.now()
): readonly PolicyBlockEntry[] =>
  list.entries.filter((entry) => policyBlockEntryIsActive(entry, now))

export const findPolicyBlockEntry = (
  list: SignedPolicyBlockList | UnsignedPolicyBlockList,
  subject: string,
  subjectType: PolicyBlockSubjectType,
  now = Date.now()
): PolicyBlockEntry | null =>
  activePolicyBlockEntries(list, now).find(
    (entry) => entry.subject === subject && entry.subjectType === subjectType
  ) ?? null

export const policyBlockOverrideEntryIsActive = (
  entry: PolicyBlockOverrideEntry,
  now = Date.now()
): boolean => typeof entry.expiresAt !== 'number' || entry.expiresAt > now

export const resolveSubscribedPolicyBlockLists = (
  input: PolicyBlockSubscriptionResolutionInput
): PolicyBlockSubscriptionResolution => {
  const now = input.now ?? Date.now()
  const activeOverrides = (input.localOverrides ?? []).filter((entry) =>
    policyBlockOverrideEntryIsActive(entry, now)
  )
  const resolvedEntries = input.lists.flatMap((list) =>
    activePolicyBlockEntries(list, now).map((entry) =>
      resolvePolicyBlockEntry(list, entry, activeOverrides)
    )
  )

  return {
    enforcedEntries: resolvedEntries.filter((entry) => !entry.overridden),
    overriddenEntries: resolvedEntries.filter((entry) => entry.overridden),
    activeOverrides
  }
}

function resolvePolicyBlockEntry(
  list: SignedPolicyBlockList | UnsignedPolicyBlockList,
  entry: PolicyBlockEntry,
  overrides: readonly PolicyBlockOverrideEntry[]
): ResolvedPolicyBlockEntry {
  const matchingOverrides = overrides.filter(
    (override) => override.subject === entry.subject && override.subjectType === entry.subjectType
  )

  return {
    ...entry,
    listId: list.id,
    listScope: list.scope,
    issuerDID: list.issuerDID,
    overridden: matchingOverrides.length > 0,
    overrideRefs: matchingOverrides.map(policyBlockOverrideRef)
  }
}

function policyBlockOverrideRef(entry: PolicyBlockOverrideEntry): string {
  return entry.id
    ? `policy-override:${entry.scope}:${entry.id}`
    : `policy-override:${entry.scope}:${entry.subjectType}:${entry.subject}`
}
