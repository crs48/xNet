/**
 * Camera bubble compositing (exploration 0414, phase 4).
 *
 * The camera is recorded to its own track, so where the bubble sits is a
 * *playback* property computed here and applied by the player or the exporter.
 * Moving it costs a field write, not a re-render — which is the whole reason
 * the tracks were kept separate at record time (0414 §Key Findings 2).
 */

import type { CameraLayout } from '@xnetjs/data'
import { DEFAULT_CAMERA_LAYOUT } from '@xnetjs/data'

/** A rectangle in the screen track's pixel space. */
export interface BubbleRect {
  x: number
  y: number
  width: number
  height: number
  /** Corner radius in pixels — half the width for a circle. */
  radius: number
}

export interface StageSize {
  width: number
  height: number
}

/** Margin from the stage edge, as a fraction of the stage width. */
const MARGIN_RATIO = 0.025

/** Bubble size is clamped: too small is unreadable, too big buries the demo. */
const MIN_SIZE = 0.05
const MAX_SIZE = 0.5

/**
 * Where the bubble is drawn on a stage of the given size.
 *
 * The bubble is square (cameras are cropped to it), so `size` is a fraction of
 * the stage *width* and the height follows — a wide stage does not stretch it.
 */
export function bubbleRect(
  stage: StageSize,
  layout: CameraLayout = DEFAULT_CAMERA_LAYOUT
): BubbleRect {
  const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, layout.size))
  const side = Math.round(stage.width * size)
  const margin = Math.round(stage.width * MARGIN_RATIO)

  const left = margin
  const right = stage.width - side - margin
  const top = margin
  const bottom = stage.height - side - margin

  const position = {
    'bottom-left': { x: left, y: bottom },
    'bottom-right': { x: right, y: bottom },
    'top-left': { x: left, y: top },
    'top-right': { x: right, y: top }
  }[layout.corner]

  const radius = layout.shape === 'circle' ? side / 2 : layout.shape === 'rounded' ? side * 0.12 : 0

  return { x: position.x, y: position.y, width: side, height: side, radius }
}

/** Whether the bubble is hidden at this source offset. */
export function isCameraHidden(sourceMs: number, layout?: CameraLayout): boolean {
  return (layout?.hiddenSpans ?? []).some(
    (span) => sourceMs >= span.startMs && sourceMs < span.endMs
  )
}

/** CSS for the player's bubble element — the browser does the compositing. */
export function bubbleStyle(
  stage: StageSize,
  layout: CameraLayout = DEFAULT_CAMERA_LAYOUT
): Record<string, string> {
  const rect = bubbleRect(stage, layout)
  return {
    position: 'absolute',
    left: `${(rect.x / stage.width) * 100}%`,
    top: `${(rect.y / stage.height) * 100}%`,
    width: `${(rect.width / stage.width) * 100}%`,
    aspectRatio: '1 / 1',
    borderRadius: layout.shape === 'circle' ? '50%' : `${(rect.radius / rect.width) * 100}%`,
    objectFit: 'cover',
    overflow: 'hidden'
  }
}
