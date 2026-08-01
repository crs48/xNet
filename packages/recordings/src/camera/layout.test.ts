import type { CameraLayout } from '@xnetjs/data'
import { DEFAULT_CAMERA_LAYOUT } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { bubbleRect, bubbleStyle, isCameraHidden } from './layout'

const stage = { width: 1_920, height: 1_080 }

describe('bubbleRect', () => {
  it('places the default bubble in the bottom-left with a margin', () => {
    const rect = bubbleRect(stage)

    expect(rect.x).toBe(48)
    expect(rect.width).toBe(346)
    expect(rect.y).toBe(1_080 - 346 - 48)
  })

  it('is square regardless of stage aspect ratio', () => {
    const rect = bubbleRect({ width: 2_560, height: 1_080 })

    expect(rect.width).toBe(rect.height)
  })

  it('honours every corner', () => {
    const corners: Array<CameraLayout['corner']> = [
      'bottom-left',
      'bottom-right',
      'top-left',
      'top-right'
    ]
    const xs = corners.map((corner) => bubbleRect(stage, { ...DEFAULT_CAMERA_LAYOUT, corner }).x)

    expect(new Set(xs).size).toBe(2)
    expect(bubbleRect(stage, { ...DEFAULT_CAMERA_LAYOUT, corner: 'top-left' }).y).toBe(48)
  })

  it('clamps an absurd size instead of burying the recording', () => {
    expect(bubbleRect(stage, { ...DEFAULT_CAMERA_LAYOUT, size: 5 }).width).toBe(960)
    expect(bubbleRect(stage, { ...DEFAULT_CAMERA_LAYOUT, size: 0 }).width).toBe(96)
  })

  it('gives a circle a radius of half its side', () => {
    const rect = bubbleRect(stage, { ...DEFAULT_CAMERA_LAYOUT, shape: 'circle' })
    expect(rect.radius).toBe(rect.width / 2)

    expect(bubbleRect(stage, { ...DEFAULT_CAMERA_LAYOUT, shape: 'square' }).radius).toBe(0)
  })

  it('keeps the bubble inside the stage', () => {
    for (const corner of ['bottom-left', 'bottom-right', 'top-left', 'top-right'] as const) {
      const rect = bubbleRect(stage, { ...DEFAULT_CAMERA_LAYOUT, corner, size: 0.4 })
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(stage.width)
      expect(rect.y + rect.height).toBeLessThanOrEqual(stage.height)
    }
  })
})

describe('isCameraHidden', () => {
  const layout: CameraLayout = {
    ...DEFAULT_CAMERA_LAYOUT,
    hiddenSpans: [{ startMs: 5_000, endMs: 9_000 }]
  }

  it('hides inside a span, half-open at the end', () => {
    expect(isCameraHidden(5_000, layout)).toBe(true)
    expect(isCameraHidden(8_999, layout)).toBe(true)
    expect(isCameraHidden(9_000, layout)).toBe(false)
  })

  it('is never hidden without spans', () => {
    expect(isCameraHidden(1_000)).toBe(false)
    expect(isCameraHidden(1_000, DEFAULT_CAMERA_LAYOUT)).toBe(false)
  })
})

describe('bubbleStyle', () => {
  it('emits percentage geometry so the player scales with its container', () => {
    const style = bubbleStyle(stage)

    expect(style.left).toMatch(/%$/)
    expect(style.width).toMatch(/%$/)
    expect(style.borderRadius).toBe('50%')
  })
})
