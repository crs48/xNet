/**
 * Social import commit policy helpers.
 */

import type {
  NodeBatchIndexMode,
  NodeBatchNotificationMode,
  NodeBatchSyncMode,
  NodeBatchWritePolicy
} from '@xnetjs/data'

export type SocialImportSourceRecordMode = 'nodes' | 'sidecar' | 'skip'

export type SocialImportCommitPolicy = NodeBatchWritePolicy & {
  /**
   * Source records can be committed as first-class graph nodes, retained as
   * sidecar provenance, or skipped entirely for fastest imports.
   */
  sourceRecordMode: SocialImportSourceRecordMode
}

export type SocialImportCommitPolicyInput = Partial<{
  indexMode: NodeBatchIndexMode
  notificationMode: NodeBatchNotificationMode
  syncMode: NodeBatchSyncMode
  sourceRecordMode: SocialImportSourceRecordMode
  includeSourceRecords: boolean
}>

export const DEFAULT_SOCIAL_IMPORT_COMMIT_POLICY: SocialImportCommitPolicy = {
  indexMode: 'touched',
  notificationMode: 'batch',
  syncMode: 'defer',
  sourceRecordMode: 'sidecar'
}

export function resolveSocialImportCommitPolicy(
  input: SocialImportCommitPolicyInput = {}
): SocialImportCommitPolicy {
  return {
    indexMode: input.indexMode ?? DEFAULT_SOCIAL_IMPORT_COMMIT_POLICY.indexMode,
    notificationMode:
      input.notificationMode ?? DEFAULT_SOCIAL_IMPORT_COMMIT_POLICY.notificationMode,
    syncMode: input.syncMode ?? DEFAULT_SOCIAL_IMPORT_COMMIT_POLICY.syncMode,
    sourceRecordMode:
      input.sourceRecordMode ??
      (input.includeSourceRecords === true
        ? 'nodes'
        : DEFAULT_SOCIAL_IMPORT_COMMIT_POLICY.sourceRecordMode)
  }
}

export function shouldCommitSourceRecordNodes(policy: {
  sourceRecordMode: SocialImportSourceRecordMode
}): boolean {
  return policy.sourceRecordMode === 'nodes'
}

export function toNodeBatchWritePolicy(policy: SocialImportCommitPolicy): NodeBatchWritePolicy {
  return {
    indexMode: policy.indexMode,
    notificationMode: policy.notificationMode,
    syncMode: policy.syncMode
  }
}
