/**
 * Moderation and abuse mitigation schemas for reports, labels, notes, and review state.
 */

import type { InferNode } from '../types'
import type { RoleResolver } from '@xnetjs/core'
import { allow, role } from '../../auth'
import { defineSchema } from '../define'
import {
  checkbox,
  created,
  createdBy,
  date,
  multiSelect,
  number,
  person,
  relation,
  select,
  text,
  updated,
  url
} from '../properties'

// ─── Shared Options ─────────────────────────────────────────────────────────

type ModerationAuthorizationOptions = {
  roles?: Record<string, RoleResolver>
  read?: readonly string[]
  write?: readonly string[]
  delete?: readonly string[]
  share?: readonly string[]
  admin?: readonly string[]
  publicProps?: readonly string[]
}

const withOperators = (roles: readonly string[] = []): string[] => [
  ...new Set(['owner', 'operator', ...roles])
]

const withOwners = (roles: readonly string[] = []): string[] => [...new Set(['owner', ...roles])]

const createModerationAuthorization = (options: ModerationAuthorizationOptions = {}) =>
  ({
    roles: {
      owner: role.creator(),
      operator: role.property('operators'),
      ...options.roles
    },
    actions: {
      read: allow(...withOperators(options.read)),
      write: allow(...withOperators(options.write)),
      delete: allow(...withOwners(options.delete)),
      share: allow(...withOperators(options.share)),
      admin: allow(...withOwners(options.admin))
    },
    ...(options.publicProps !== undefined ? { publicProps: [...options.publicProps] } : {})
  }) as const

const reportAuthorization = createModerationAuthorization({
  roles: {
    reporter: role.property('reporter'),
    reviewer: role.property('reviewers')
  },
  read: ['reporter', 'reviewer'],
  write: ['reviewer'],
  share: ['reviewer'],
  admin: ['reviewer']
})

const labelAuthorization = createModerationAuthorization({
  roles: {
    labeler: role.property('labelers'),
    reviewer: role.property('reviewers'),
    source: role.property('sourceDID')
  },
  read: ['labeler', 'reviewer', 'source'],
  write: ['labeler', 'reviewer', 'source'],
  share: ['reviewer']
})

const policyListAuthorization = createModerationAuthorization({
  roles: {
    publisher: role.property('publisher'),
    policyPublisher: role.property('publishers'),
    labeler: role.property('labelers'),
    reviewer: role.property('reviewers')
  },
  read: ['publisher', 'policyPublisher', 'labeler', 'reviewer'],
  write: ['publisher', 'policyPublisher'],
  share: ['publisher', 'policyPublisher'],
  admin: ['publisher', 'policyPublisher']
})

const subscriptionAuthorization = createModerationAuthorization({
  roles: {
    subscriber: role.property('subscriber')
  },
  read: ['subscriber'],
  write: ['subscriber']
})

const publicInteractionPolicyAuthorization = createModerationAuthorization({
  roles: {
    maintainer: role.property('maintainers'),
    moderator: role.property('moderators'),
    policyPublisher: role.property('policyPublishers'),
    targetOwner: role.relation('target', 'owner'),
    targetAdmin: role.relation('target', 'admin')
  },
  read: ['maintainer', 'moderator', 'policyPublisher', 'targetOwner', 'targetAdmin'],
  write: ['maintainer', 'moderator', 'targetOwner', 'targetAdmin'],
  share: ['maintainer', 'policyPublisher', 'targetOwner', 'targetAdmin'],
  admin: ['maintainer', 'targetOwner', 'targetAdmin'],
  publicProps: [
    'target',
    'targetSchema',
    'scope',
    'commentMode',
    'replyMode',
    'reactionMode',
    'quoteMode',
    'mentionMode',
    'communityNoteMode',
    'messageMode',
    'crawlMode',
    'indexMode',
    'defaultVisibility',
    'firstContactMode',
    'moderationMode',
    'slowModeSeconds',
    'maxRootCommentsPerHour',
    'maxRepliesPerHour',
    'maxReactionsPerHour',
    'maxMentionsPerComment',
    'minimumAccountAgeHours',
    'minimumReputation',
    'trustThreshold',
    'quarantineConfidenceThreshold',
    'hideConfidenceThreshold',
    'requiresVerifiedIdentity',
    'acceptsPolicySubscriptions',
    'policyLists',
    'updatedAt'
  ]
})

const messageRequestAuthorization = createModerationAuthorization({
  roles: {
    sender: role.property('sender'),
    recipient: role.property('recipient'),
    reviewer: role.property('reviewers')
  },
  read: ['sender', 'recipient', 'reviewer'],
  write: ['sender', 'recipient', 'reviewer'],
  share: ['recipient', 'reviewer'],
  admin: ['recipient', 'reviewer']
})

const communityNoteAuthorization = createModerationAuthorization({
  roles: {
    author: role.property('author'),
    reviewer: role.property('reviewers')
  },
  read: ['author', 'reviewer'],
  write: ['author', 'reviewer'],
  share: ['author', 'reviewer']
})

const noteRatingAuthorization = createModerationAuthorization({
  roles: {
    rater: role.property('rater'),
    reviewer: role.property('reviewers')
  },
  read: ['rater', 'reviewer'],
  write: ['rater', 'reviewer']
})

const signalAuthorization = createModerationAuthorization({
  roles: {
    source: role.property('sourceDID'),
    reviewer: role.property('reviewers')
  },
  read: ['source', 'reviewer'],
  write: ['source', 'reviewer'],
  share: ['reviewer']
})

const provenanceAuthorization = createModerationAuthorization({
  roles: {
    source: role.property('sourceDID'),
    reviewer: role.property('reviewers')
  },
  read: ['source', 'reviewer'],
  write: ['source', 'reviewer'],
  share: ['reviewer']
})

const appealAuthorization = createModerationAuthorization({
  roles: {
    appellant: role.property('appellant'),
    reviewer: role.property('reviewers')
  },
  read: ['appellant', 'reviewer'],
  write: ['appellant', 'reviewer'],
  share: ['reviewer'],
  admin: ['reviewer']
})

const reviewTaskAuthorization = createModerationAuthorization({
  roles: {
    reviewer: role.property('reviewers'),
    assignee: role.property('assignedTo'),
    resolver: role.property('resolvedBy')
  },
  read: ['reviewer', 'assignee', 'resolver'],
  write: ['reviewer', 'assignee', 'resolver'],
  share: ['reviewer'],
  admin: ['reviewer']
})

const commonModerationMetadata = {
  operators: person({ multiple: true }),
  createdAt: created(),
  createdBy: createdBy(),
  updatedAt: updated()
} as const

const policyScopes = [
  { id: 'user', name: 'User', color: 'gray' },
  { id: 'workspace', name: 'Workspace', color: 'blue' },
  { id: 'community', name: 'Community', color: 'green' },
  { id: 'hub', name: 'Hub', color: 'purple' },
  { id: 'appView', name: 'App View', color: 'orange' },
  { id: 'protocol', name: 'Protocol', color: 'red' }
] as const

const labelValues = [
  { id: 'spam', name: 'Spam', color: 'red' },
  { id: 'scam', name: 'Scam', color: 'red' },
  { id: 'malware', name: 'Malware', color: 'red' },
  { id: 'impersonation', name: 'Impersonation', color: 'orange' },
  { id: 'harassment', name: 'Harassment', color: 'orange' },
  { id: 'slop', name: 'AI Slop', color: 'yellow' },
  { id: 'inaccurate', name: 'Inaccurate', color: 'yellow' },
  { id: 'unsupported', name: 'Unsupported', color: 'yellow' },
  { id: 'stale', name: 'Stale', color: 'gray' },
  { id: 'synthetic', name: 'Synthetic', color: 'blue' },
  // Sensitivity labels (exploration 0175) — aligned to the ATProto/Bluesky
  // moderation lexicon so third-party labelers interoperate. These are a
  // per-viewer filtering concern, not a platform-hide concern.
  { id: 'sexual', name: 'Sexually suggestive', color: 'pink' },
  { id: 'nudity', name: 'Non-sexual nudity', color: 'pink' },
  { id: 'porn', name: 'Explicit / pornographic', color: 'red' },
  { id: 'graphic-media', name: 'Graphic / violent', color: 'orange' },
  { id: 'safe', name: 'Safe', color: 'green' }
] as const

const signalSources = [
  { id: 'user', name: 'User', color: 'blue' },
  { id: 'local-ai', name: 'Local AI', color: 'green' },
  { id: 'cloud-ai', name: 'Cloud AI', color: 'purple' },
  { id: 'community-note', name: 'Community Note', color: 'yellow' },
  { id: 'labeler', name: 'Labeler', color: 'teal' },
  { id: 'policy-list', name: 'Policy List', color: 'orange' },
  { id: 'hub', name: 'Hub', color: 'red' },
  { id: 'crawler', name: 'Crawler', color: 'gray' }
] as const

const reviewQueues = [
  { id: 'safety', name: 'Safety', color: 'red' },
  { id: 'quality', name: 'Quality', color: 'yellow' },
  { id: 'appeal', name: 'Appeal', color: 'blue' },
  { id: 'operator', name: 'Operator', color: 'purple' }
] as const

const reviewStatuses = [
  { id: 'open', name: 'Open', color: 'blue' },
  { id: 'in-progress', name: 'In Progress', color: 'yellow' },
  { id: 'resolved', name: 'Resolved', color: 'green' },
  { id: 'escalated', name: 'Escalated', color: 'orange' },
  { id: 'closed', name: 'Closed', color: 'gray' }
] as const

const interactionModes = [
  { id: 'open', name: 'Open', color: 'green' },
  { id: 'authenticated', name: 'Authenticated', color: 'blue' },
  { id: 'trusted', name: 'Trusted', color: 'purple' },
  { id: 'reviewed', name: 'Reviewed', color: 'yellow' },
  { id: 'closed', name: 'Closed', color: 'red' }
] as const

const firstContactModes = [
  { id: 'allow', name: 'Allow', color: 'green' },
  { id: 'slow-mode', name: 'Slow Mode', color: 'blue' },
  { id: 'quarantine', name: 'Quarantine', color: 'purple' },
  { id: 'review', name: 'Review', color: 'yellow' },
  { id: 'block', name: 'Block', color: 'red' }
] as const

const moderationModes = [
  { id: 'off', name: 'Off', color: 'gray' },
  { id: 'label-only', name: 'Label Only', color: 'blue' },
  { id: 'post-review', name: 'Post Review', color: 'yellow' },
  { id: 'pre-filter', name: 'Pre Filter', color: 'orange' },
  { id: 'pre-review', name: 'Pre Review', color: 'red' }
] as const

const defaultVisibilityModes = [
  { id: 'visible', name: 'Visible', color: 'green' },
  { id: 'collapsed', name: 'Collapsed', color: 'yellow' },
  { id: 'quarantined', name: 'Quarantined', color: 'purple' },
  { id: 'hidden', name: 'Hidden', color: 'red' }
] as const

const messageRequestStatuses = [
  { id: 'pending', name: 'Pending', color: 'yellow' },
  { id: 'accepted', name: 'Accepted', color: 'green' },
  { id: 'declined', name: 'Declined', color: 'gray' },
  { id: 'quarantined', name: 'Quarantined', color: 'purple' },
  { id: 'blocked', name: 'Blocked', color: 'red' },
  { id: 'expired', name: 'Expired', color: 'gray' }
] as const

const firstContactAdmissionModes = [
  { id: 'allow', name: 'Allow', color: 'green' },
  { id: 'message-request', name: 'Message Request', color: 'blue' },
  { id: 'quarantine', name: 'Quarantine', color: 'purple' },
  { id: 'review', name: 'Review', color: 'yellow' },
  { id: 'block', name: 'Block', color: 'red' }
] as const

const firstContactReasonCodes = [
  { id: 'first-contact', name: 'First Contact', color: 'blue' },
  { id: 'trusted-sender', name: 'Trusted Sender', color: 'green' },
  { id: 'known-contact', name: 'Known Contact', color: 'green' },
  { id: 'sender-muted', name: 'Sender Muted', color: 'yellow' },
  { id: 'sender-blocked', name: 'Sender Blocked', color: 'red' },
  { id: 'review-required', name: 'Review Required', color: 'orange' },
  { id: 'verified-identity-required', name: 'Verified Identity Required', color: 'purple' },
  { id: 'policy-allow', name: 'Policy Allow', color: 'green' },
  { id: 'policy-slow-mode', name: 'Policy Slow Mode', color: 'blue' },
  { id: 'policy-quarantine', name: 'Policy Quarantine', color: 'purple' },
  { id: 'policy-review', name: 'Policy Review', color: 'yellow' },
  { id: 'policy-block', name: 'Policy Block', color: 'red' }
] as const

// ─── Schemas ────────────────────────────────────────────────────────────────

export const AbuseReportSchema = defineSchema({
  name: 'AbuseReport',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    target: relation({ required: true }),
    targetSchema: text({}),
    reporter: person({ required: true }),
    category: select({
      options: labelValues,
      required: true
    }),
    reason: text({ required: true, maxLength: 4000 }),
    evidenceRefs: text({}),
    observedAt: date({ includeTime: true }),
    status: select({
      options: [
        { id: 'open', name: 'Open', color: 'blue' },
        { id: 'triaged', name: 'Triaged', color: 'yellow' },
        { id: 'accepted', name: 'Accepted', color: 'green' },
        { id: 'rejected', name: 'Rejected', color: 'gray' },
        { id: 'duplicate', name: 'Duplicate', color: 'gray' }
      ] as const,
      default: 'open'
    }),
    reviewedBy: person({}),
    reviewedAt: date({ includeTime: true }),
    resolution: text({ maxLength: 4000 }),
    reviewers: person({ multiple: true }),
    ...commonModerationMetadata
  },
  authorization: reportAuthorization
})

export const ModerationLabelSchema = defineSchema({
  name: 'ModerationLabel',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    target: relation({ required: true }),
    targetSchema: text({}),
    value: select({
      options: labelValues,
      required: true
    }),
    sourceDID: person({ required: true }),
    sourceType: select({
      options: signalSources,
      required: true
    }),
    confidence: number({ required: true, min: 0, max: 1 }),
    sourceWeight: number({ required: true, min: 0, max: 10 }),
    evidenceRefs: text({}),
    expiresAt: date({ includeTime: true }),
    negates: relation({}),
    policyList: relation({}),
    modelProvider: text({ maxLength: 200 }),
    modelName: text({ maxLength: 200 }),
    modelVersion: text({ maxLength: 200 }),
    signedEnvelope: text({}),
    labelers: person({ multiple: true }),
    reviewers: person({ multiple: true }),
    ...commonModerationMetadata
  },
  authorization: labelAuthorization
})

export const PolicyListSchema = defineSchema({
  name: 'PolicyList',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    title: text({ required: true, maxLength: 500 }),
    description: text({ maxLength: 4000 }),
    publisher: person({ required: true }),
    scope: select({
      options: policyScopes,
      required: true
    }),
    defaultAction: select({
      options: [
        { id: 'allow', name: 'Allow', color: 'green' },
        { id: 'warn', name: 'Warn', color: 'yellow' },
        { id: 'demote', name: 'Demote', color: 'orange' },
        { id: 'hide', name: 'Hide', color: 'red' },
        { id: 'quarantine', name: 'Quarantine', color: 'purple' },
        { id: 'block-peer', name: 'Block Peer', color: 'red' }
      ] as const,
      default: 'warn'
    }),
    entries: text({ required: true }),
    labelers: person({ multiple: true }),
    reviewers: person({ multiple: true }),
    publishers: person({ multiple: true }),
    appealContact: text({ maxLength: 500 }),
    signedEnvelope: text({}),
    ...commonModerationMetadata
  },
  authorization: policyListAuthorization
})

export const PolicySubscriptionSchema = defineSchema({
  name: 'PolicySubscription',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    policyList: relation({ required: true }),
    subscriber: person({ required: true }),
    scope: select({
      options: policyScopes,
      required: true
    }),
    trust: number({ required: true, min: 0, max: 1 }),
    maxLabelsPerHour: number({ min: 0, integer: true }),
    localOverride: checkbox({ default: true }),
    enabled: checkbox({ default: true }),
    expiresAt: date({ includeTime: true }),
    lastSyncedAt: date({ includeTime: true }),
    ...commonModerationMetadata
  },
  authorization: subscriptionAuthorization
})

export const PublicInteractionPolicySchema = defineSchema({
  name: 'PublicInteractionPolicy',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    target: relation({ required: true }),
    targetSchema: text({}),
    scope: select({
      options: policyScopes,
      required: true
    }),
    commentMode: select({
      options: interactionModes,
      default: 'authenticated'
    }),
    replyMode: select({
      options: interactionModes,
      default: 'authenticated'
    }),
    reactionMode: select({
      options: interactionModes,
      default: 'authenticated'
    }),
    quoteMode: select({
      options: interactionModes,
      default: 'trusted'
    }),
    mentionMode: select({
      options: interactionModes,
      default: 'trusted'
    }),
    communityNoteMode: select({
      options: interactionModes,
      default: 'reviewed'
    }),
    messageMode: select({
      options: interactionModes,
      default: 'authenticated'
    }),
    crawlMode: select({
      options: interactionModes,
      default: 'closed'
    }),
    indexMode: select({
      options: interactionModes,
      default: 'reviewed'
    }),
    defaultVisibility: select({
      options: defaultVisibilityModes,
      default: 'visible'
    }),
    firstContactMode: select({
      options: firstContactModes,
      default: 'slow-mode'
    }),
    moderationMode: select({
      options: moderationModes,
      default: 'post-review'
    }),
    slowModeSeconds: number({ min: 0, integer: true }),
    maxRootCommentsPerHour: number({ min: 0, integer: true }),
    maxRepliesPerHour: number({ min: 0, integer: true }),
    maxReactionsPerHour: number({ min: 0, integer: true }),
    maxMentionsPerComment: number({ min: 0, integer: true }),
    minimumAccountAgeHours: number({ min: 0, integer: true }),
    minimumReputation: number({ min: 0 }),
    trustThreshold: number({ min: 0, max: 1 }),
    quarantineConfidenceThreshold: number({ min: 0, max: 1 }),
    hideConfidenceThreshold: number({ min: 0, max: 1 }),
    requiresVerifiedIdentity: checkbox({ default: false }),
    acceptsPolicySubscriptions: checkbox({ default: true }),
    policyLists: relation({ multiple: true }),
    activeLabels: multiSelect({
      options: labelValues
    }),
    maintainers: person({ multiple: true }),
    moderators: person({ multiple: true }),
    policyPublishers: person({ multiple: true }),
    trustedDIDs: person({ multiple: true }),
    mutedDIDs: person({ multiple: true }),
    blockedDIDs: person({ multiple: true }),
    rationale: text({ maxLength: 4000 }),
    ...commonModerationMetadata
  },
  authorization: publicInteractionPolicyAuthorization
})

export const MessageRequestSchema = defineSchema({
  name: 'MessageRequest',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    conversationKey: text({ required: true, maxLength: 500 }),
    sender: person({ required: true }),
    recipient: person({ required: true }),
    target: relation({}),
    targetSchema: text({}),
    firstMessageRef: relation({}),
    firstMessagePreview: text({ maxLength: 1000 }),
    status: select({
      options: messageRequestStatuses,
      default: 'pending'
    }),
    admission: select({
      options: firstContactAdmissionModes,
      default: 'message-request'
    }),
    reasonCodes: multiSelect({
      options: firstContactReasonCodes
    }),
    confidence: number({ min: 0, max: 1 }),
    policy: relation({}),
    policyMode: select({
      options: firstContactModes
    }),
    quarantineUntil: date({ includeTime: true }),
    expiresAt: date({ includeTime: true }),
    respondedAt: date({ includeTime: true }),
    respondedBy: person({}),
    reviewers: person({ multiple: true }),
    notes: text({ maxLength: 4000 }),
    signedEnvelope: text({}),
    ...commonModerationMetadata
  },
  authorization: messageRequestAuthorization
})

export const CommunityNoteSchema = defineSchema({
  name: 'CommunityNote',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    target: relation({ required: true }),
    targetSchema: text({}),
    author: person({ required: true }),
    body: text({ required: true, maxLength: 10000 }),
    claim: text({ maxLength: 1000 }),
    citations: text({}),
    status: select({
      options: [
        { id: 'draft', name: 'Draft', color: 'gray' },
        { id: 'published', name: 'Published', color: 'green' },
        { id: 'hidden', name: 'Hidden', color: 'red' },
        { id: 'retracted', name: 'Retracted', color: 'orange' }
      ] as const,
      default: 'draft'
    }),
    ratingSummary: text({}),
    reviewers: person({ multiple: true }),
    ...commonModerationMetadata
  },
  authorization: communityNoteAuthorization
})

export const NoteRatingSchema = defineSchema({
  name: 'NoteRating',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    note: relation({ required: true }),
    rater: person({ required: true }),
    helpfulness: select({
      options: [
        { id: 'helpful', name: 'Helpful', color: 'green' },
        { id: 'not-helpful', name: 'Not Helpful', color: 'red' },
        { id: 'needs-source', name: 'Needs Source', color: 'yellow' },
        { id: 'irrelevant', name: 'Irrelevant', color: 'gray' }
      ] as const,
      required: true
    }),
    perspective: text({ maxLength: 500 }),
    confidence: number({ required: true, min: 0, max: 1 }),
    reason: text({ maxLength: 2000 }),
    reviewers: person({ multiple: true }),
    ...commonModerationMetadata
  },
  authorization: noteRatingAuthorization
})

export const QualitySignalSchema = defineSchema({
  name: 'QualitySignal',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    target: relation({ required: true }),
    sourceDID: person({ required: true }),
    sourceType: select({
      options: signalSources,
      required: true
    }),
    signal: select({
      options: [
        { id: 'duplicate', name: 'Duplicate', color: 'gray' },
        { id: 'slop', name: 'AI Slop', color: 'yellow' },
        { id: 'citation-coverage', name: 'Citation Coverage', color: 'blue' },
        { id: 'provenance', name: 'Provenance', color: 'green' },
        { id: 'claim-mismatch', name: 'Claim Mismatch', color: 'orange' },
        { id: 'freshness', name: 'Freshness', color: 'purple' }
      ] as const,
      required: true
    }),
    score: number({ required: true, min: 0, max: 1 }),
    confidence: number({ required: true, min: 0, max: 1 }),
    evidenceRefs: text({}),
    modelProvider: text({ maxLength: 200 }),
    modelName: text({ maxLength: 200 }),
    modelVersion: text({ maxLength: 200 }),
    expiresAt: date({ includeTime: true }),
    reviewers: person({ multiple: true }),
    ...commonModerationMetadata
  },
  authorization: signalAuthorization
})

export const ContentProvenanceSchema = defineSchema({
  name: 'ContentProvenance',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    target: relation({ required: true }),
    sourceUrl: url({}),
    sourceDID: person({}),
    sourceType: select({
      options: [
        { id: 'human', name: 'Human', color: 'green' },
        { id: 'ai', name: 'AI', color: 'purple' },
        { id: 'mixed', name: 'Mixed', color: 'yellow' },
        { id: 'crawl', name: 'Crawl', color: 'blue' },
        { id: 'import', name: 'Import', color: 'gray' },
        { id: 'syndicated', name: 'Syndicated', color: 'orange' }
      ] as const,
      required: true
    }),
    aiGenerated: checkbox({ default: false }),
    modelProvider: text({ maxLength: 200 }),
    modelName: text({ maxLength: 200 }),
    modelVersion: text({ maxLength: 200 }),
    toolchain: text({}),
    credentials: text({}),
    c2paManifest: text({}),
    capturedAt: date({ includeTime: true }),
    license: text({ maxLength: 500 }),
    reviewers: person({ multiple: true }),
    ...commonModerationMetadata
  },
  authorization: provenanceAuthorization
})

export const AppealSchema = defineSchema({
  name: 'Appeal',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    target: relation({ required: true }),
    decision: relation({}),
    appellant: person({ required: true }),
    status: select({
      options: [
        { id: 'open', name: 'Open', color: 'blue' },
        { id: 'accepted', name: 'Accepted', color: 'green' },
        { id: 'rejected', name: 'Rejected', color: 'red' },
        { id: 'needs-info', name: 'Needs Info', color: 'yellow' }
      ] as const,
      default: 'open'
    }),
    reason: text({ required: true, maxLength: 4000 }),
    evidenceRefs: text({}),
    reviewer: person({}),
    reviewedAt: date({ includeTime: true }),
    resolution: text({ maxLength: 4000 }),
    reviewers: person({ multiple: true }),
    ...commonModerationMetadata
  },
  authorization: appealAuthorization
})

export const ReviewTaskSchema = defineSchema({
  name: 'ReviewTask',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    target: relation({ required: true }),
    decision: relation({}),
    queue: select({
      options: reviewQueues,
      required: true
    }),
    priority: number({ required: true, min: 0, max: 100, integer: true }),
    status: select({
      options: reviewStatuses,
      default: 'open'
    }),
    assignedTo: person({}),
    dueAt: date({ includeTime: true }),
    reasonCodes: text({}),
    decisionSnapshot: text({}),
    resolvedBy: person({}),
    resolvedAt: date({ includeTime: true }),
    resolution: text({ maxLength: 4000 }),
    reviewers: person({ multiple: true }),
    ...commonModerationMetadata
  },
  authorization: reviewTaskAuthorization
})

// ─── Types ──────────────────────────────────────────────────────────────────

export type AbuseReport = InferNode<(typeof AbuseReportSchema)['_properties']>
export type ModerationLabel = InferNode<(typeof ModerationLabelSchema)['_properties']>
export type PolicyList = InferNode<(typeof PolicyListSchema)['_properties']>
export type PolicySubscription = InferNode<(typeof PolicySubscriptionSchema)['_properties']>
export type PublicInteractionPolicy = InferNode<
  (typeof PublicInteractionPolicySchema)['_properties']
>
export type MessageRequest = InferNode<(typeof MessageRequestSchema)['_properties']>
export type CommunityNote = InferNode<(typeof CommunityNoteSchema)['_properties']>
export type NoteRating = InferNode<(typeof NoteRatingSchema)['_properties']>
export type QualitySignal = InferNode<(typeof QualitySignalSchema)['_properties']>
export type ContentProvenance = InferNode<(typeof ContentProvenanceSchema)['_properties']>
export type Appeal = InferNode<(typeof AppealSchema)['_properties']>
export type ReviewTask = InferNode<(typeof ReviewTaskSchema)['_properties']>

/**
 * Deterministic node id for the target-scoped PublicInteractionPolicy, so a
 * hub can resolve "what may strangers do to this node?" with one O(1) meta
 * read instead of a reverse property index, and re-publishing the policy
 * upserts instead of duplicating (the `spaceMembershipId` convention;
 * explorations 0378/0383 W2). One policy node per target.
 */
export function publicInteractionPolicyId(targetId: string): string {
  return `pipolicy:${targetId}`
}
