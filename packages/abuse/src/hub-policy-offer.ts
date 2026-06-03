/**
 * Signed hub policy and service offer documents.
 */

import type { AbuseReach, AbuseReviewQueue, AbuseVisibility } from './types'
import { base64ToBytes, bytesToBase64, sign, verify } from '@xnetjs/crypto'
import { parseDID } from '@xnetjs/identity'

// ─── Types ─────────────────────────────────────────────────

export type HubPolicyServiceKind =
  | 'sync-relay'
  | 'node-relay'
  | 'public-write'
  | 'crawl'
  | 'federation-query'
  | 'labeler'
  | 'ai-review'
  | 'appeal'

export type HubPolicySettlementMode = 'free' | 'paid' | 'sponsored' | 'reciprocal' | 'mixed'

export type HubModerationMode =
  | 'off'
  | 'local-deterministic'
  | 'labeler-assisted'
  | 'ai-assisted'
  | 'human-reviewed'
  | 'hybrid'

export type HubPolicyAIReviewSettings = {
  localModelsEnabled: boolean
  cloudModelsEnabled: boolean
  rawContentToCloudAllowed: boolean
  maxCloudReviewMicroUsdPerDay?: number
  defaultReviewQueue?: AbuseReviewQueue
}

export type HubPolicyLabelSettings = {
  trustedLabelerDIDs: readonly string[]
  subscribedPolicyListIds: readonly string[]
  maxLabelsPerSubject?: number
  allowLabelNegation: boolean
}

export type HubPolicyModerationSettings = {
  mode: HubModerationMode
  requireSignedWrites: boolean
  rejectUnsignedFederation: boolean
  quarantineFirstContact: boolean
  allowLocalOverride: boolean
  publishLabelExplanations: boolean
  defaultVisibility: AbuseVisibility
  defaultReach: AbuseReach
  aiReview: HubPolicyAIReviewSettings
  labels: HubPolicyLabelSettings
}

export type HubPolicyBudgetHint = {
  name: string
  workType: 'public-write' | 'crawl' | 'federation-query' | 'cloud-review' | 'labeling'
  scope: string
  unitsPerWindow: number
  windowMs: number
}

export type HubPolicyServiceOfferEntry = {
  service: HubPolicyServiceKind
  enabled: boolean
  endpoint?: string
  authenticated: boolean
  settlement: HubPolicySettlementMode
  costMicroUsdPerUnit?: number
  reciprocalCreditRatio?: number
  sponsoredBy?: string
}

export type UnsignedHubPolicyServiceOffer = {
  v: 1
  kind: 'xnet.hub.policy-service-offer'
  id: string
  hubDID: string
  issuerDID: string
  title?: string
  createdAt: number
  updatedAt: number
  expiresAt?: number
  moderation: HubPolicyModerationSettings
  services: readonly HubPolicyServiceOfferEntry[]
  budgetHints: readonly HubPolicyBudgetHint[]
  policyRefs: readonly string[]
}

export type HubPolicyServiceOfferSignature = {
  alg: 'Ed25519'
  value: string
}

export type SignedHubPolicyServiceOffer = UnsignedHubPolicyServiceOffer & {
  signature: HubPolicyServiceOfferSignature
}

export type HubPolicyServiceOfferVerificationResult = {
  valid: boolean
  errors: readonly string[]
}

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }

// ─── Public API ────────────────────────────────────────────

const encoder = new TextEncoder()

const DEFAULT_AI_REVIEW_SETTINGS: HubPolicyAIReviewSettings = {
  localModelsEnabled: true,
  cloudModelsEnabled: false,
  rawContentToCloudAllowed: false
}

const DEFAULT_LABEL_SETTINGS: HubPolicyLabelSettings = {
  trustedLabelerDIDs: [],
  subscribedPolicyListIds: [],
  allowLabelNegation: true
}

const DEFAULT_MODERATION_SETTINGS: HubPolicyModerationSettings = {
  mode: 'local-deterministic',
  requireSignedWrites: true,
  rejectUnsignedFederation: true,
  quarantineFirstContact: true,
  allowLocalOverride: true,
  publishLabelExplanations: true,
  defaultVisibility: 'warn',
  defaultReach: 'demote',
  aiReview: DEFAULT_AI_REVIEW_SETTINGS,
  labels: DEFAULT_LABEL_SETTINGS
}

export const createHubPolicyServiceOffer = (
  input: Omit<
    UnsignedHubPolicyServiceOffer,
    'v' | 'kind' | 'createdAt' | 'updatedAt' | 'moderation' | 'budgetHints' | 'policyRefs'
  > & {
    createdAt?: number
    updatedAt?: number
    moderation?: Partial<HubPolicyModerationSettings> & {
      aiReview?: Partial<HubPolicyAIReviewSettings>
      labels?: Partial<HubPolicyLabelSettings>
    }
    budgetHints?: readonly HubPolicyBudgetHint[]
    policyRefs?: readonly string[]
  }
): UnsignedHubPolicyServiceOffer => {
  const now = Date.now()
  const createdAt = input.createdAt ?? now
  const moderation = mergeModerationSettings(input.moderation)

  return {
    v: 1,
    kind: 'xnet.hub.policy-service-offer',
    id: input.id,
    hubDID: input.hubDID,
    issuerDID: input.issuerDID,
    title: input.title,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
    expiresAt: input.expiresAt,
    moderation,
    services: input.services,
    budgetHints: input.budgetHints ?? [],
    policyRefs: input.policyRefs ?? []
  }
}

export const canonicalizeHubPolicyServiceOffer = (offer: UnsignedHubPolicyServiceOffer): string =>
  JSON.stringify(toJsonValue(offer))

export const hubPolicyServiceOfferSigningBytes = (
  offer: UnsignedHubPolicyServiceOffer
): Uint8Array => encoder.encode(canonicalizeHubPolicyServiceOffer(offer))

export const signHubPolicyServiceOffer = (
  offer: UnsignedHubPolicyServiceOffer,
  signingKey: Uint8Array
): SignedHubPolicyServiceOffer => ({
  ...offer,
  signature: {
    alg: 'Ed25519',
    value: bytesToBase64(sign(hubPolicyServiceOfferSigningBytes(offer), signingKey))
  }
})

export const unsignedHubPolicyServiceOffer = (
  offer: SignedHubPolicyServiceOffer | UnsignedHubPolicyServiceOffer
): UnsignedHubPolicyServiceOffer => ({
  v: offer.v,
  kind: offer.kind,
  id: offer.id,
  hubDID: offer.hubDID,
  issuerDID: offer.issuerDID,
  title: offer.title,
  createdAt: offer.createdAt,
  updatedAt: offer.updatedAt,
  expiresAt: offer.expiresAt,
  moderation: offer.moderation,
  services: offer.services,
  budgetHints: offer.budgetHints,
  policyRefs: offer.policyRefs
})

export const isSignedHubPolicyServiceOffer = (
  offer: unknown
): offer is SignedHubPolicyServiceOffer =>
  isRecord(offer) &&
  offer.v === 1 &&
  offer.kind === 'xnet.hub.policy-service-offer' &&
  isRecord(offer.signature) &&
  offer.signature.alg === 'Ed25519' &&
  typeof offer.signature.value === 'string'

export const validateHubPolicyServiceOffer = (
  offer: UnsignedHubPolicyServiceOffer,
  now = Date.now()
): HubPolicyServiceOfferVerificationResult => {
  const errors = [
    ...requiredString('id', offer.id),
    ...requiredString('hubDID', offer.hubDID),
    ...requiredString('issuerDID', offer.issuerDID),
    ...validateTimestamps(offer, now),
    ...validateModerationSettings(offer.moderation),
    ...(offer.services.length === 0 ? ['services-required'] : []),
    ...offer.budgetHints.flatMap(validateBudgetHint)
  ]

  return { valid: errors.length === 0, errors }
}

export const verifySignedHubPolicyServiceOffer = (
  offer: SignedHubPolicyServiceOffer,
  now = Date.now()
): HubPolicyServiceOfferVerificationResult => {
  const unsigned = unsignedHubPolicyServiceOffer(offer)
  const errors = [...validateHubPolicyServiceOffer(unsigned, now).errors]

  try {
    const publicKey = parseDID(offer.issuerDID)
    const signature = base64ToBytes(offer.signature.value)
    const valid = verify(hubPolicyServiceOfferSigningBytes(unsigned), signature, publicKey)
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

export const activeHubPolicyServices = (
  offer: SignedHubPolicyServiceOffer | UnsignedHubPolicyServiceOffer
): readonly HubPolicyServiceOfferEntry[] => offer.services.filter((service) => service.enabled)

// ─── Helpers ───────────────────────────────────────────────

function mergeModerationSettings(
  settings:
    | (Partial<HubPolicyModerationSettings> & {
        aiReview?: Partial<HubPolicyAIReviewSettings>
        labels?: Partial<HubPolicyLabelSettings>
      })
    | undefined
): HubPolicyModerationSettings {
  return {
    ...DEFAULT_MODERATION_SETTINGS,
    ...settings,
    aiReview: {
      ...DEFAULT_AI_REVIEW_SETTINGS,
      ...settings?.aiReview
    },
    labels: {
      ...DEFAULT_LABEL_SETTINGS,
      ...settings?.labels
    }
  }
}

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

function requiredString(field: string, value: string): readonly string[] {
  return value.trim().length === 0 ? [`${field}-required`] : []
}

function validateTimestamps(offer: UnsignedHubPolicyServiceOffer, now: number): readonly string[] {
  return [
    offer.updatedAt < offer.createdAt ? 'updated-before-created' : null,
    typeof offer.expiresAt === 'number' && offer.expiresAt <= now ? 'expired' : null,
    typeof offer.expiresAt === 'number' && offer.expiresAt <= offer.createdAt
      ? 'expires-before-created'
      : null
  ].filter((error): error is string => error !== null)
}

function validateModerationSettings(settings: HubPolicyModerationSettings): readonly string[] {
  return [
    settings.aiReview.rawContentToCloudAllowed && !settings.aiReview.cloudModelsEnabled
      ? 'raw-cloud-review-without-cloud-models'
      : null,
    settings.labels.maxLabelsPerSubject !== undefined && settings.labels.maxLabelsPerSubject <= 0
      ? 'max-labels-per-subject-invalid'
      : null
  ].filter((error): error is string => error !== null)
}

function validateBudgetHint(hint: HubPolicyBudgetHint): readonly string[] {
  return [
    hint.name.trim().length === 0 ? 'budget-name-required' : null,
    hint.scope.trim().length === 0 ? 'budget-scope-required' : null,
    hint.unitsPerWindow <= 0 ? 'budget-units-invalid' : null,
    hint.windowMs <= 0 ? 'budget-window-invalid' : null
  ].filter((error): error is string => error !== null)
}
