/**
 * Moderation and abuse mitigation schemas for reports, labels, notes, and review state.
 */

import type { InferNode } from '../types'
import { allow, role } from '../../auth'
import { defineSchema } from '../define'
import {
  checkbox,
  created,
  createdBy,
  date,
  number,
  person,
  relation,
  select,
  text,
  updated,
  url
} from '../properties'

// ─── Shared Options ─────────────────────────────────────────────────────────

const moderationAuthorization = {
  roles: {
    owner: role.creator(),
    operator: role.property('operators')
  },
  actions: {
    read: allow('owner', 'operator'),
    write: allow('owner', 'operator'),
    delete: allow('owner'),
    share: allow('owner', 'operator'),
    admin: allow('owner')
  }
} as const

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
  { id: 'safe', name: 'Safe', color: 'green' }
] as const

const signalSources = [
  { id: 'user', name: 'User', color: 'blue' },
  { id: 'local-ai', name: 'Local AI', color: 'green' },
  { id: 'cloud-ai', name: 'Cloud AI', color: 'purple' },
  { id: 'community-note', name: 'Community Note', color: 'yellow' },
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
    ...commonModerationMetadata
  },
  authorization: moderationAuthorization
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
    ...commonModerationMetadata
  },
  authorization: moderationAuthorization
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
    appealContact: text({ maxLength: 500 }),
    signedEnvelope: text({}),
    ...commonModerationMetadata
  },
  authorization: moderationAuthorization
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
  authorization: moderationAuthorization
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
    ...commonModerationMetadata
  },
  authorization: moderationAuthorization
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
    ...commonModerationMetadata
  },
  authorization: moderationAuthorization
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
    ...commonModerationMetadata
  },
  authorization: moderationAuthorization
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
    ...commonModerationMetadata
  },
  authorization: moderationAuthorization
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
    ...commonModerationMetadata
  },
  authorization: moderationAuthorization
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
    ...commonModerationMetadata
  },
  authorization: moderationAuthorization
})

// ─── Types ──────────────────────────────────────────────────────────────────

export type AbuseReport = InferNode<(typeof AbuseReportSchema)['_properties']>
export type ModerationLabel = InferNode<(typeof ModerationLabelSchema)['_properties']>
export type PolicyList = InferNode<(typeof PolicyListSchema)['_properties']>
export type PolicySubscription = InferNode<(typeof PolicySubscriptionSchema)['_properties']>
export type CommunityNote = InferNode<(typeof CommunityNoteSchema)['_properties']>
export type NoteRating = InferNode<(typeof NoteRatingSchema)['_properties']>
export type QualitySignal = InferNode<(typeof QualitySignalSchema)['_properties']>
export type ContentProvenance = InferNode<(typeof ContentProvenanceSchema)['_properties']>
export type Appeal = InferNode<(typeof AppealSchema)['_properties']>
export type ReviewTask = InferNode<(typeof ReviewTaskSchema)['_properties']>
