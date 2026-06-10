/**
 * Social import provenance schemas.
 */

import type { InferNode } from '@xnetjs/data'
import { checkbox, date, defineSchema, number, relation, select, text } from '@xnetjs/data'
import {
  SOCIAL_NAMESPACE,
  importJobPhases,
  importJobStatuses,
  importRunStatuses,
  privacyClasses,
  socialPlatforms,
  sourceRecordKinds
} from './constants'

export const SocialImportArchiveSchema = defineSchema({
  name: 'SocialImportArchive',
  namespace: SOCIAL_NAMESPACE,
  properties: {
    platform: select({ options: socialPlatforms, required: true, default: 'generic' }),
    archiveHash: text({ required: true, maxLength: 128 }),
    filename: text({ required: true, maxLength: 500 }),
    byteSize: number({ min: 0, integer: true }),
    entryCount: number({ min: 0, integer: true }),
    importedAt: date({ includeTime: true }),
    adapterId: text({ maxLength: 100 }),
    adapterVersion: text({ maxLength: 100 }),
    manifestJson: text({ maxLength: 50000 })
  },
  document: undefined
})

export const SocialImportRunSchema = defineSchema({
  name: 'SocialImportRun',
  namespace: SOCIAL_NAMESPACE,
  properties: {
    archive: relation({ required: true }),
    platform: select({ options: socialPlatforms, required: true, default: 'generic' }),
    adapterId: text({ required: true, maxLength: 100 }),
    adapterVersion: text({ required: true, maxLength: 100 }),
    status: select({ options: importRunStatuses, required: true, default: 'staged' }),
    startedAt: date({ required: true, includeTime: true }),
    completedAt: date({ includeTime: true }),
    selectedBucketsJson: text({ maxLength: 20000 }),
    summaryJson: text({ maxLength: 50000 }),
    warningCount: number({ min: 0, integer: true }),
    errorCount: number({ min: 0, integer: true })
  },
  document: undefined
})

/**
 * Operational import job state for local runners.
 *
 * This is intentionally separate from SocialImportRun, which represents the
 * durable import history exposed in the social graph. Import jobs are local
 * progress/checkpoint records used by Electron data-process and web worker
 * runners.
 */
export const SocialImportJobSchema = defineSchema({
  name: 'SocialImportJob',
  namespace: SOCIAL_NAMESPACE,
  properties: {
    jobId: text({ required: true, maxLength: 128 }),
    status: select({ options: importJobStatuses, required: true, default: 'queued' }),
    phase: select({ options: importJobPhases, required: true, default: 'probing' }),
    platform: select({ options: socialPlatforms, required: true, default: 'generic' }),
    archiveName: text({ required: true, maxLength: 500 }),
    archiveFingerprint: text({ maxLength: 512 }),
    adapterId: text({ maxLength: 100 }),
    adapterVersion: text({ maxLength: 100 }),
    totalRecords: number({ min: 0, integer: true }),
    processedRecords: number({ min: 0, integer: true }),
    created: number({ min: 0, integer: true }),
    updated: number({ min: 0, integer: true }),
    skipped: number({ min: 0, integer: true }),
    warnings: number({ min: 0, integer: true }),
    currentBucketId: text({ maxLength: 300 }),
    currentChunk: number({ min: 0, integer: true }),
    totalChunks: number({ min: 0, integer: true }),
    startedAt: date({ includeTime: true }),
    updatedAt: date({ required: true, includeTime: true }),
    completedAt: date({ includeTime: true }),
    error: text({ maxLength: 5000 }),
    metricsJson: text({ maxLength: 10000 }),
    checkpointJson: text({ maxLength: 50000 }),
    requestJson: text({ maxLength: 50000 })
  },
  document: undefined
})

export const SocialSourceRecordSchema = defineSchema({
  name: 'SocialSourceRecord',
  namespace: SOCIAL_NAMESPACE,
  properties: {
    archive: relation({ required: true }),
    importRun: relation({}),
    platform: select({ options: socialPlatforms, required: true, default: 'generic' }),
    sourcePath: text({ required: true, maxLength: 1000 }),
    sourceRecordId: text({ required: true, maxLength: 500 }),
    sourceRecordHash: text({ required: true, maxLength: 128 }),
    sourceRecordKind: select({ options: sourceRecordKinds, required: true, default: 'unknown' }),
    privacyClass: select({ options: privacyClasses, required: true, default: 'unknown' }),
    byteOffset: number({ min: 0, integer: true }),
    byteLength: number({ min: 0, integer: true }),
    ignored: checkbox({ default: false }),
    ignoredReason: text({ maxLength: 1000 }),
    warningsJson: text({ maxLength: 10000 }),
    shapeJson: text({ maxLength: 20000 })
  },
  document: undefined
})

export type SocialImportArchive = InferNode<(typeof SocialImportArchiveSchema)['_properties']>
export type SocialImportRun = InferNode<(typeof SocialImportRunSchema)['_properties']>
export type SocialImportJob = InferNode<(typeof SocialImportJobSchema)['_properties']>
export type SocialSourceRecord = InferNode<(typeof SocialSourceRecordSchema)['_properties']>
