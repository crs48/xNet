import { describe, expect, it } from 'vitest'
import { frameSetSignature, orderForStack, toggleGeometry } from './geometry.js'
import type { FrameDef } from './types.js'

const frame = (id: string, sortKey: string, layout?: FrameDef['layout']): FrameDef => ({
  id,
  source: { kind: 'node', nodeId: `n-${id}` },
  viewType: 'table',
  config: { groupBy: id },
  tier: 'live',
  sortKey,
  ...(layout ? { layout } : {})
})

describe('page geometry', () => {
  it('stack orders by sortKey with code-unit collation', () => {
    const frames = [frame('b', 'b'), frame('a', 'B'), frame('c', 'c')]
    // Code units: 'B' (0x42) < 'b' (0x62) < 'c' — never localeCompare.
    expect(orderForStack(frames).map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })

  it('round-trip stack → grid → space → stack preserves the exact frame set', () => {
    const original = [frame('a', 'a'), frame('b', 'b', { x: 3, y: 4, w: 5, h: 6 }), frame('c', 'c')]
    const signature = frameSetSignature(original)

    const grid = toggleGeometry(original, 'grid')
    const space = toggleGeometry(grid.frames, 'space')
    const stack = toggleGeometry(space.frames, 'stack')

    expect(frameSetSignature(grid.frames)).toBe(signature)
    expect(frameSetSignature(space.frames)).toBe(signature)
    expect(frameSetSignature(stack.frames)).toBe(signature)
    expect(stack.frames).toHaveLength(original.length)
  })

  it('only missing layouts gain defaults; existing layouts keep identity', () => {
    const withLayout = frame('b', 'b', { x: 3, y: 4, w: 5, h: 6 })
    const { frames } = toggleGeometry([frame('a', 'a'), withLayout], 'grid')
    expect(frames[0].layout).toBeDefined()
    expect(frames[1]).toBe(withLayout)
    expect(frames[1].layout).toEqual({ x: 3, y: 4, w: 5, h: 6 })
  })

  it('toggling to stack never mutates layouts', () => {
    const spaced = toggleGeometry([frame('a', 'a')], 'space').frames
    const back = toggleGeometry(spaced, 'stack').frames
    expect(back[0].layout).toEqual(spaced[0].layout)
  })
})
