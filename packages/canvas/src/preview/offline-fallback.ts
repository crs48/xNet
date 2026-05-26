/**
 * Offline fallback behavior for Canvas preview models.
 */

import type { CanvasPreviewAction, CanvasPreviewModel, CanvasPreviewTier } from './model'
import { createCanvasPreviewModel } from './model'

export type CanvasPreviewOfflineFallbackReason =
  | 'network-unavailable'
  | 'provider-unreachable'
  | 'metadata-unavailable'
  | 'local-bytes-unavailable'
  | 'permission-needed'

export type CreateCanvasOfflinePreviewFallbackInput = {
  model: CanvasPreviewModel
  reason?: CanvasPreviewOfflineFallbackReason
  message?: string
  retryAction?: CanvasPreviewAction
}

const DEFAULT_OFFLINE_REASON: CanvasPreviewOfflineFallbackReason = 'network-unavailable'
const DEFAULT_OFFLINE_DESCRIPTION = 'Showing cached preview until the source reconnects.'
const DEFAULT_RETRY_ACTION: CanvasPreviewAction = {
  id: 'retry-preview',
  label: 'Retry',
  kind: 'retry'
}

function getOfflinePreferredTier(model: CanvasPreviewModel): CanvasPreviewTier {
  if (model.thumbnail) {
    return 'thumbnail'
  }

  if (model.shell) {
    return 'shell'
  }

  return 'summary'
}

function ensureRetryAction(
  actions: readonly CanvasPreviewAction[],
  retryAction: CanvasPreviewAction
): CanvasPreviewAction[] {
  if (actions.some((action) => action.kind === 'retry' || action.id === retryAction.id)) {
    return [...actions]
  }

  return [retryAction, ...actions]
}

export function createCanvasOfflinePreviewFallback({
  model,
  reason = DEFAULT_OFFLINE_REASON,
  message = DEFAULT_OFFLINE_DESCRIPTION,
  retryAction = DEFAULT_RETRY_ACTION
}: CreateCanvasOfflinePreviewFallbackInput): CanvasPreviewModel {
  return createCanvasPreviewModel({
    id: model.id,
    objectId: model.objectId,
    objectKind: model.objectKind,
    sourceRef: model.sourceRef,
    summary: {
      ...model.summary,
      subtitle: model.summary.subtitle ?? 'Offline',
      description: message,
      status: 'offline'
    },
    thumbnail: model.thumbnail,
    shell: {
      ...model.shell,
      title: model.shell?.title ?? model.summary.title,
      subtitle: model.shell?.subtitle ?? model.summary.subtitle,
      metadata: {
        ...model.shell?.metadata,
        offline: true,
        offlineReason: reason
      }
    },
    preferredTier: getOfflinePreferredTier(model),
    anchors: model.anchors,
    actions: ensureRetryAction(model.actions, retryAction)
  })
}

export function isCanvasOfflinePreviewFallback(model: CanvasPreviewModel): boolean {
  return model.summary.status === 'offline' && model.live === undefined
}
