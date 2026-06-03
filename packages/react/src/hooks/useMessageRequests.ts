/**
 * Message request and first-contact quarantine helpers.
 */

import type { FirstContactMode, PublicInteractionPolicySnapshot } from './useModeratedComments'
import type { NodeChangeEvent, NodeState } from '@xnetjs/data'
import { MessageRequestSchema } from '@xnetjs/data'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { evaluateInteractionPermission, selectPublicInteractionMode } from './useModeratedComments'
import { useNodeStore } from './useNodeStore'

// ─── Types ──────────────────────────────────────────────────────────────────

export type MessageRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'quarantined'
  | 'blocked'
  | 'expired'

export type FirstContactAdmission = 'allow' | 'message-request' | 'quarantine' | 'review' | 'block'

export type FirstContactVisibility = 'inbox' | 'requests' | 'quarantine' | 'hidden'

export type MessageRequestNode = {
  id: string
  conversationKey: string
  sender: string
  recipient: string
  target?: string
  targetSchema?: string
  firstMessageRef?: string
  firstMessagePreview?: string
  status: MessageRequestStatus
  admission: FirstContactAdmission
  reasonCodes: string[]
  confidence?: number
  policy?: string
  policyMode?: FirstContactMode
  quarantineUntil?: number
  expiresAt?: number
  respondedAt?: number
  respondedBy?: string
  reviewers: string[]
  notes?: string
  createdAt: number
  createdBy: string
}

export type FirstContactDecisionInput = {
  senderDID?: string
  recipientDID?: string
  policy?: PublicInteractionPolicySnapshot | null
  existingRequests?: readonly MessageRequestNode[]
  isAuthenticated?: boolean
  isVerified?: boolean
  now?: number
}

export type FirstContactDecision = {
  admission: FirstContactAdmission
  status: MessageRequestStatus
  visibility: FirstContactVisibility
  notifyRecipient: boolean
  requiresReview: boolean
  shouldCreateRequest: boolean
  reasons: string[]
  reasonCodes: string[]
  confidence: number
  quarantineUntil?: number
}

export type CreateMessageRequestOptions = {
  senderDID: string
  recipientDID: string
  target?: string
  targetSchema?: string
  firstMessageRef?: string
  firstMessagePreview?: string
  expiresAt?: number
  reviewers?: readonly string[]
  notes?: string
}

export type MessageRequestProperties = {
  conversationKey: string
  sender: string
  recipient: string
  target?: string
  targetSchema?: string
  firstMessageRef?: string
  firstMessagePreview?: string
  status: MessageRequestStatus
  admission: FirstContactAdmission
  reasonCodes: string[]
  confidence: number
  policy?: string
  policyMode?: FirstContactMode
  quarantineUntil?: number
  expiresAt?: number
  reviewers: string[]
  notes?: string
}

export type UseMessageRequestsOptions = {
  recipientDID?: string
  senderDID?: string
  policy?: PublicInteractionPolicySnapshot | null
  isAuthenticated?: boolean
  isVerified?: boolean
  includeResolved?: boolean
}

export type UseMessageRequestsResult = {
  requests: MessageRequestNode[]
  pendingRequests: MessageRequestNode[]
  quarantinedRequests: MessageRequestNode[]
  acceptedRequests: MessageRequestNode[]
  blockedRequests: MessageRequestNode[]
  loading: boolean
  error: Error | null
  evaluateFirstContact: (input: FirstContactDecisionInput) => FirstContactDecision
  createMessageRequest: (options: CreateMessageRequestOptions) => Promise<string | null>
  acceptRequest: (requestId: string, responderDID?: string) => Promise<void>
  declineRequest: (requestId: string, responderDID?: string) => Promise<void>
  quarantineRequest: (requestId: string, responderDID?: string) => Promise<void>
  blockRequest: (requestId: string, responderDID?: string) => Promise<void>
  reload: () => Promise<void>
}

// ─── Constants ──────────────────────────────────────────────────────────────

const REQUEST_STATUSES: readonly MessageRequestStatus[] = [
  'pending',
  'accepted',
  'declined',
  'quarantined',
  'blocked',
  'expired'
]

const ADMISSIONS: readonly FirstContactAdmission[] = [
  'allow',
  'message-request',
  'quarantine',
  'review',
  'block'
]

const ACTIVE_REQUEST_STATUSES: readonly MessageRequestStatus[] = ['pending', 'quarantined']

// ─── Pure Helpers ───────────────────────────────────────────────────────────

export function createConversationKey(senderDID: string, recipientDID: string): string {
  return [senderDID, recipientDID].sort().join('::')
}

export function summarizeMessageRequest(
  node: NodeState,
  now: number = Date.now()
): MessageRequestNode | null {
  const conversationKey = asString(node.properties.conversationKey)
  const sender = asString(node.properties.sender)
  const recipient = asString(node.properties.recipient)

  if (!conversationKey || !sender || !recipient) return null

  const expiresAt = asNumber(node.properties.expiresAt)
  const rawStatus = asRequestStatus(node.properties.status) ?? 'pending'
  const status =
    expiresAt !== undefined && expiresAt <= now && ACTIVE_REQUEST_STATUSES.includes(rawStatus)
      ? 'expired'
      : rawStatus

  return {
    id: node.id,
    conversationKey,
    sender,
    recipient,
    target: asString(node.properties.target),
    targetSchema: asString(node.properties.targetSchema),
    firstMessageRef: asString(node.properties.firstMessageRef),
    firstMessagePreview: asString(node.properties.firstMessagePreview),
    status,
    admission: asAdmission(node.properties.admission) ?? 'message-request',
    reasonCodes: asStringArray(node.properties.reasonCodes),
    confidence: asNumber(node.properties.confidence),
    policy: asString(node.properties.policy),
    policyMode: asFirstContactMode(node.properties.policyMode),
    quarantineUntil: asNumber(node.properties.quarantineUntil),
    expiresAt,
    respondedAt: asNumber(node.properties.respondedAt),
    respondedBy: asString(node.properties.respondedBy),
    reviewers: asStringArray(node.properties.reviewers),
    notes: asString(node.properties.notes),
    createdAt: node.createdAt,
    createdBy: node.createdBy
  }
}

export function findLatestMessageRequest(
  requests: readonly MessageRequestNode[],
  senderDID: string,
  recipientDID: string
): MessageRequestNode | null {
  const conversationKey = createConversationKey(senderDID, recipientDID)
  return (
    requests
      .filter((request) => request.conversationKey === conversationKey)
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  )
}

export function hasAcceptedContact(
  requests: readonly MessageRequestNode[],
  senderDID: string,
  recipientDID: string
): boolean {
  return findLatestMessageRequest(requests, senderDID, recipientDID)?.status === 'accepted'
}

export function evaluateFirstContactDecision({
  senderDID,
  recipientDID,
  policy,
  existingRequests = [],
  isAuthenticated,
  isVerified = false,
  now = Date.now()
}: FirstContactDecisionInput): FirstContactDecision {
  if (!senderDID || !recipientDID) {
    return createFirstContactDecision('block', ['missing-participants'], 1)
  }

  if (senderDID === recipientDID) {
    return createFirstContactDecision('allow', ['self-message'], 1)
  }

  const latest = findLatestMessageRequest(existingRequests, senderDID, recipientDID)
  if (latest?.status === 'accepted') {
    return createFirstContactDecision('allow', ['known-contact'], 1)
  }

  if (policy?.blockedDIDs.includes(senderDID) || latest?.status === 'blocked') {
    return createFirstContactDecision('block', ['sender-blocked'], 1)
  }

  if (policy?.mutedDIDs.includes(senderDID)) {
    return createFirstContactDecision('quarantine', ['sender-muted'], 0.9)
  }

  if ((policy?.requiresVerifiedIdentity ?? false) && (!isAuthenticated || !isVerified)) {
    return createFirstContactDecision('review', ['verified-identity-required'], 0.8)
  }

  const messagePermission = evaluateInteractionPermission(
    selectPublicInteractionMode(policy ?? null, 'message'),
    policy ?? null,
    {
      viewerDID: senderDID,
      isAuthenticated: isAuthenticated ?? Boolean(senderDID),
      isVerified
    }
  )

  if (!messagePermission.allowed) {
    return createFirstContactDecision(
      'block',
      ['message-policy-denied', ...messagePermission.reasons],
      0.95
    )
  }

  if (messagePermission.requiresReview) {
    return createFirstContactDecision('review', ['message-review-required'], 0.75)
  }

  if (policy?.trustedDIDs.includes(senderDID)) {
    return createFirstContactDecision('allow', ['trusted-sender'], 0.95)
  }

  const mode = policy?.firstContactMode ?? 'slow-mode'
  const reasons = ['first-contact', `policy-${mode}`]

  if (mode === 'allow') return createFirstContactDecision('allow', reasons, 0.8)
  if (mode === 'block') return createFirstContactDecision('block', reasons, 0.95)
  if (mode === 'review') return createFirstContactDecision('review', reasons, 0.75)
  if (mode === 'quarantine') return createFirstContactDecision('quarantine', reasons, 0.85)

  return createFirstContactDecision('message-request', reasons, 0.6, {
    quarantineUntil:
      policy?.slowModeSeconds !== undefined ? now + policy.slowModeSeconds * 1000 : undefined
  })
}

export function createMessageRequestProperties(
  options: CreateMessageRequestOptions,
  decision: FirstContactDecision,
  policy?: PublicInteractionPolicySnapshot | null
): MessageRequestProperties {
  return {
    conversationKey: createConversationKey(options.senderDID, options.recipientDID),
    sender: options.senderDID,
    recipient: options.recipientDID,
    target: options.target,
    targetSchema: options.targetSchema,
    firstMessageRef: options.firstMessageRef,
    firstMessagePreview: truncatePreview(options.firstMessagePreview),
    status: decision.status,
    admission: decision.admission,
    reasonCodes: decision.reasonCodes,
    confidence: decision.confidence,
    policy: policy?.id,
    policyMode: policy?.firstContactMode,
    quarantineUntil: decision.quarantineUntil,
    expiresAt: options.expiresAt,
    reviewers: [...(options.reviewers ?? [])],
    notes: options.notes
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useMessageRequests({
  recipientDID,
  senderDID,
  policy,
  isAuthenticated,
  isVerified,
  includeResolved = false
}: UseMessageRequestsOptions = {}): UseMessageRequestsResult {
  const { store, isReady } = useNodeStore()
  const [requests, setRequests] = useState<MessageRequestNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadRequests = useCallback(async () => {
    if (!store || !isReady) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const nodes = await store.list({ schemaId: MessageRequestSchema._schemaId })
      const nextRequests = nodes
        .map((node) => summarizeMessageRequest(node))
        .filter((request): request is MessageRequestNode => {
          if (request === null) return false
          if (recipientDID && request.recipient !== recipientDID) return false
          if (senderDID && request.sender !== senderDID) return false
          if (!includeResolved && !ACTIVE_REQUEST_STATUSES.includes(request.status)) return false
          return true
        })
        .sort((a, b) => b.createdAt - a.createdAt)

      setRequests(nextRequests)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [store, isReady, recipientDID, senderDID, includeResolved])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  useEffect(() => {
    if (!store || !isReady) return

    const handleChange = (event: NodeChangeEvent) => {
      const schemaId = event.node?.schemaId ?? event.change?.payload?.schemaId
      if (schemaId === MessageRequestSchema._schemaId) {
        loadRequests()
      }
    }

    const unsubscribe = store.subscribe(handleChange)
    return () => unsubscribe()
  }, [store, isReady, loadRequests])

  const evaluateFirstContact = useCallback(
    (input: FirstContactDecisionInput) =>
      evaluateFirstContactDecision({
        policy,
        existingRequests: requests,
        isAuthenticated,
        isVerified,
        ...input
      }),
    [policy, requests, isAuthenticated, isVerified]
  )

  const createMessageRequest = useCallback(
    async (options: CreateMessageRequestOptions): Promise<string | null> => {
      if (!store || !isReady) return null

      const decision = evaluateFirstContact({
        senderDID: options.senderDID,
        recipientDID: options.recipientDID
      })

      if (!decision.shouldCreateRequest) return null

      try {
        const node = await store.create({
          schemaId: MessageRequestSchema._schemaId,
          properties: createMessageRequestProperties(options, decision, policy)
        })

        return node.id
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      }
    },
    [store, isReady, evaluateFirstContact, policy]
  )

  const setRequestStatus = useCallback(
    async (
      requestId: string,
      status: MessageRequestStatus,
      responderDID?: string
    ): Promise<void> => {
      if (!store || !isReady) return

      try {
        await store.update(requestId, {
          properties: {
            status,
            respondedAt: Date.now(),
            respondedBy: responderDID
          }
        })
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    },
    [store, isReady]
  )

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending'),
    [requests]
  )
  const quarantinedRequests = useMemo(
    () => requests.filter((request) => request.status === 'quarantined'),
    [requests]
  )
  const acceptedRequests = useMemo(
    () => requests.filter((request) => request.status === 'accepted'),
    [requests]
  )
  const blockedRequests = useMemo(
    () => requests.filter((request) => request.status === 'blocked'),
    [requests]
  )

  return {
    requests,
    pendingRequests,
    quarantinedRequests,
    acceptedRequests,
    blockedRequests,
    loading,
    error,
    evaluateFirstContact,
    createMessageRequest,
    acceptRequest: (requestId, responderDID) =>
      setRequestStatus(requestId, 'accepted', responderDID),
    declineRequest: (requestId, responderDID) =>
      setRequestStatus(requestId, 'declined', responderDID),
    quarantineRequest: (requestId, responderDID) =>
      setRequestStatus(requestId, 'quarantined', responderDID),
    blockRequest: (requestId, responderDID) => setRequestStatus(requestId, 'blocked', responderDID),
    reload: loadRequests
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function createFirstContactDecision(
  admission: FirstContactAdmission,
  reasons: readonly string[],
  confidence: number,
  options: { quarantineUntil?: number } = {}
): FirstContactDecision {
  return {
    admission,
    status: statusForAdmission(admission),
    visibility: visibilityForAdmission(admission),
    notifyRecipient: admission === 'message-request' || admission === 'review',
    requiresReview: admission === 'review' || admission === 'quarantine',
    shouldCreateRequest:
      admission === 'message-request' || admission === 'review' || admission === 'quarantine',
    reasons: [...reasons],
    reasonCodes: normalizeReasonCodes(reasons),
    confidence,
    quarantineUntil: options.quarantineUntil
  }
}

function statusForAdmission(admission: FirstContactAdmission): MessageRequestStatus {
  if (admission === 'allow') return 'accepted'
  if (admission === 'block') return 'blocked'
  if (admission === 'quarantine') return 'quarantined'
  return 'pending'
}

function visibilityForAdmission(admission: FirstContactAdmission): FirstContactVisibility {
  if (admission === 'allow') return 'inbox'
  if (admission === 'message-request' || admission === 'review') return 'requests'
  if (admission === 'quarantine') return 'quarantine'
  return 'hidden'
}

function normalizeReasonCodes(reasons: readonly string[]): string[] {
  return reasons.map((reason) => {
    if (reason === 'policy-slow-mode') return 'policy-slow-mode'
    if (reason.startsWith('policy-')) return reason
    return reason
  })
}

function truncatePreview(preview: string | undefined): string | undefined {
  if (preview === undefined) return undefined
  return preview.length > 1000 ? preview.slice(0, 1000) : preview
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function asRequestStatus(value: unknown): MessageRequestStatus | undefined {
  return isOneOf(value, REQUEST_STATUSES) ? value : undefined
}

function asAdmission(value: unknown): FirstContactAdmission | undefined {
  return isOneOf(value, ADMISSIONS) ? value : undefined
}

function asFirstContactMode(value: unknown): FirstContactMode | undefined {
  return isOneOf(value, ['allow', 'slow-mode', 'quarantine', 'review', 'block']) ? value : undefined
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}
