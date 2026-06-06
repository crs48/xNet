/**
 * Social import provenance schemas.
 */

import type { InferNode } from '@xnetjs/data'
import { checkbox, date, defineSchema, number, relation, select, text } from '@xnetjs/data'
import {
  SOCIAL_NAMESPACE,
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
export type SocialSourceRecord = InferNode<(typeof SocialSourceRecordSchema)['_properties']>
