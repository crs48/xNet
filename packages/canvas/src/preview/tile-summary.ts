/**
 * Preview metadata projection for Canvas v3 tile summaries.
 */

import type { CanvasPreviewModel, CanvasPreviewThumbnail } from './model'
import type { CanvasObjectRecord } from '@xnetjs/canvas-core'

export type CanvasPreviewTileSummaryMetadata = CanvasObjectRecord['preview']

export type CanvasPreviewTileSummaryUpdate = {
  objectId: string
  preview: CanvasPreviewTileSummaryMetadata
}

type CanvasPreviewThumbnailWithCacheKey = CanvasPreviewThumbnail & {
  cacheKey?: string
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function stringifySourceVersion(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return undefined
}

function getThumbnailHash(model: CanvasPreviewModel): string | undefined {
  const thumbnail = model.thumbnail as CanvasPreviewThumbnailWithCacheKey | undefined

  return (
    readString(thumbnail?.cacheKey) ??
    readString(thumbnail?.blobId) ??
    readString(model.sourceRef?.contentHash)
  )
}

export function createCanvasPreviewTileSummaryMetadata(
  model: CanvasPreviewModel
): CanvasPreviewTileSummaryMetadata {
  return {
    title: readString(model.summary.title) ?? readString(model.shell?.title),
    subtitle: readString(model.summary.subtitle) ?? readString(model.shell?.subtitle),
    sourceVersion: stringifySourceVersion(model.sourceRef?.version),
    thumbnailHash: getThumbnailHash(model)
  }
}

export function createCanvasPreviewTileSummaryUpdate(
  model: CanvasPreviewModel
): CanvasPreviewTileSummaryUpdate {
  return {
    objectId: model.objectId,
    preview: createCanvasPreviewTileSummaryMetadata(model)
  }
}

export function hasCanvasPreviewTileSummaryChanged(
  current: CanvasPreviewTileSummaryMetadata,
  next: CanvasPreviewTileSummaryMetadata
): boolean {
  return (
    current.title !== next.title ||
    current.subtitle !== next.subtitle ||
    current.sourceVersion !== next.sourceVersion ||
    current.thumbnailHash !== next.thumbnailHash
  )
}

export function applyCanvasPreviewTileSummaryUpdate(
  object: CanvasObjectRecord,
  update: CanvasPreviewTileSummaryUpdate
): CanvasObjectRecord {
  if (object.id !== update.objectId) {
    return object
  }

  if (!hasCanvasPreviewTileSummaryChanged(object.preview, update.preview)) {
    return object
  }

  return {
    ...object,
    preview: update.preview
  }
}
