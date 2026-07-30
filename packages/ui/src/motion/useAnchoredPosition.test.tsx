import { describe, expect, it } from 'vitest'
import { placeAnchored } from './useAnchoredPosition'

const VIEWPORT = { width: 1000, height: 800 }

function rect(x: number, y: number, w = 100, h = 20): DOMRect {
  return {
    x,
    y,
    width: w,
    height: h,
    top: y,
    left: x,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({})
  } as DOMRect
}

describe('placeAnchored', () => {
  it('places to the right of the anchor with a gap', () => {
    const pos = placeAnchored(rect(100, 100), 'right', 320, 200, VIEWPORT)
    expect(pos).toEqual({ left: 208, top: 100 })
  })

  it('places below the anchor with a gap', () => {
    const pos = placeAnchored(rect(100, 100), 'bottom', 320, 200, VIEWPORT)
    expect(pos).toEqual({ left: 100, top: 128 })
  })

  it('mirrors to the left when the right side would overflow', () => {
    // Anchor near the right edge: 900 + 8 + 320 = 1228 > 1000.
    const pos = placeAnchored(rect(900, 100), 'right', 320, 200, VIEWPORT)
    expect(pos.left).toBe(900 - 8 - 320)
  })

  it('mirrors above when the bottom would overflow', () => {
    const pos = placeAnchored(rect(100, 700), 'bottom', 320, 200, VIEWPORT)
    expect(pos.top).toBe(700 - 8 - 200)
  })

  it('clamps into the viewport rather than rendering offscreen', () => {
    // Anchor beyond the right edge entirely — mirroring still cannot fit it,
    // so the clamp is the last line of defence.
    const pos = placeAnchored(rect(1400, 2000), 'right', 320, 200, VIEWPORT)
    expect(pos.left).toBeGreaterThanOrEqual(8)
    expect(pos.left).toBeLessThanOrEqual(VIEWPORT.width - 320 - 8)
    expect(pos.top).toBeLessThanOrEqual(VIEWPORT.height - 200 - 8)
  })

  it('never returns a negative coordinate', () => {
    const pos = placeAnchored(rect(-500, -500), 'left', 320, 200, VIEWPORT)
    expect(pos.left).toBeGreaterThanOrEqual(8)
    expect(pos.top).toBeGreaterThanOrEqual(8)
  })
})
