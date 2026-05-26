/**
 * PDF annotation overlays stored separately from source PDF bytes.
 */

import { createCanvasPdfPageAnchorId } from './page-anchors'

export type CanvasPdfAnnotationKind =
  | 'highlight'
  | 'note'
  | 'callout'
  | 'arrow'
  | 'rectangle'
  | 'ellipse'
  | 'freehand'

export type CanvasPdfAnnotationRect = {
  xRatio: number
  yRatio: number
  widthRatio: number
  heightRatio: number
}

export type CanvasPdfAnnotationPoint = {
  xRatio: number
  yRatio: number
}

export type CanvasPdfAnnotationStyle = {
  stroke?: string
  fill?: string
  strokeWidth?: number
  opacity?: number
}

export type CanvasPdfAnnotationRecord = {
  id: string
  objectId: string
  pageNumber: number
  kind: CanvasPdfAnnotationKind
  anchorId: string
  rect?: CanvasPdfAnnotationRect
  points?: readonly CanvasPdfAnnotationPoint[]
  text?: string
  style?: CanvasPdfAnnotationStyle
  zIndex: number
  createdAt: string
  updatedAt: string
  createdBy?: string
}

export type CreateCanvasPdfAnnotationInput = {
  id: string
  objectId: string
  pageNumber: number
  kind: CanvasPdfAnnotationKind
  anchorId?: string
  rect?: CanvasPdfAnnotationRect
  points?: readonly CanvasPdfAnnotationPoint[]
  text?: string
  style?: CanvasPdfAnnotationStyle
  zIndex?: number
  createdAt?: string
  updatedAt?: string
  createdBy?: string
}

export type CanvasPdfAnnotationOverlay = {
  objectId: string
  sourceFingerprint?: string
  annotations: readonly CanvasPdfAnnotationRecord[]
}

export type CreateCanvasPdfAnnotationOverlayInput = {
  objectId: string
  sourceFingerprint?: string
  annotations?: readonly CanvasPdfAnnotationRecord[]
}

const SOURCE_BYTE_KEYS = new Set([
  'sourceBytes',
  'pdfBytes',
  'fileBytes',
  'blob',
  'sourceBlob',
  'arrayBuffer'
])

function clampRatio(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback
}

function normalizeRect(
  rect: CanvasPdfAnnotationRect | undefined
): CanvasPdfAnnotationRect | undefined {
  if (!rect) {
    return undefined
  }

  const xRatio = clampRatio(rect.xRatio)
  const yRatio = clampRatio(rect.yRatio)
  const widthRatio = Math.min(1 - xRatio, clampRatio(rect.widthRatio))
  const heightRatio = Math.min(1 - yRatio, clampRatio(rect.heightRatio))

  return { xRatio, yRatio, widthRatio, heightRatio }
}

function normalizePoints(
  points: readonly CanvasPdfAnnotationPoint[] | undefined
): readonly CanvasPdfAnnotationPoint[] | undefined {
  if (!points) {
    return undefined
  }

  return points.map((point) => ({
    xRatio: clampRatio(point.xRatio),
    yRatio: clampRatio(point.yRatio)
  }))
}

function getAnnotationAnchorRatios(input: {
  rect?: CanvasPdfAnnotationRect
  points?: readonly CanvasPdfAnnotationPoint[]
}): Pick<CanvasPdfAnnotationPoint, 'xRatio' | 'yRatio'> {
  if (input.rect) {
    return {
      xRatio: input.rect.xRatio + input.rect.widthRatio / 2,
      yRatio: input.rect.yRatio + input.rect.heightRatio / 2
    }
  }

  const [firstPoint] = input.points ?? []
  return firstPoint ?? { xRatio: 0.5, yRatio: 0.5 }
}

function compareAnnotations(
  left: CanvasPdfAnnotationRecord,
  right: CanvasPdfAnnotationRecord
): number {
  return (
    left.pageNumber - right.pageNumber ||
    left.zIndex - right.zIndex ||
    left.id.localeCompare(right.id)
  )
}

function getTimestamp(value: string | undefined): string {
  return value ?? new Date().toISOString()
}

export function createCanvasPdfAnnotation(
  input: CreateCanvasPdfAnnotationInput
): CanvasPdfAnnotationRecord {
  const rect = normalizeRect(input.rect)
  const points = normalizePoints(input.points)
  const anchorRatios = getAnnotationAnchorRatios({ rect, points })
  const createdAt = getTimestamp(input.createdAt)

  return {
    id: input.id,
    objectId: input.objectId,
    pageNumber: input.pageNumber,
    kind: input.kind,
    anchorId:
      input.anchorId ??
      createCanvasPdfPageAnchorId({
        objectId: input.objectId,
        pageNumber: input.pageNumber,
        xRatio: anchorRatios.xRatio,
        yRatio: anchorRatios.yRatio
      }),
    rect,
    points,
    text: input.text,
    style: input.style,
    zIndex: input.zIndex ?? 0,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
    createdBy: input.createdBy
  }
}

export function updateCanvasPdfAnnotation(
  annotation: CanvasPdfAnnotationRecord,
  patch: Partial<CreateCanvasPdfAnnotationInput>
): CanvasPdfAnnotationRecord {
  return createCanvasPdfAnnotation({
    ...annotation,
    ...patch,
    createdAt: annotation.createdAt,
    updatedAt: getTimestamp(patch.updatedAt)
  })
}

export function createCanvasPdfAnnotationOverlay(
  input: CreateCanvasPdfAnnotationOverlayInput
): CanvasPdfAnnotationOverlay {
  return {
    objectId: input.objectId,
    sourceFingerprint: input.sourceFingerprint,
    annotations: [...(input.annotations ?? [])]
      .filter((annotation) => annotation.objectId === input.objectId)
      .sort(compareAnnotations)
  }
}

export function getCanvasPdfAnnotationsForPage(
  overlay: CanvasPdfAnnotationOverlay,
  pageNumber: number
): readonly CanvasPdfAnnotationRecord[] {
  return overlay.annotations.filter((annotation) => annotation.pageNumber === pageNumber)
}

export function isCanvasPdfAnnotationSourceDetached(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return true
  }

  return Object.keys(value).every((key) => !SOURCE_BYTE_KEYS.has(key))
}
