/**
 * Engine ↔ persisted-layout serialization tests for the grid host.
 */

import type { GridStackNode } from 'gridstack'
import { describe, expect, it } from 'vitest'
import { mergeGridChange, serializeGridNodes } from '../components/DashboardGrid'

const LAYOUT = [
  { id: 'a', x: 0, y: 0, w: 3, h: 2 },
  { id: 'b', x: 3, y: 0, w: 4, h: 4 }
]

describe('serializeGridNodes', () => {
  it('serializes engine nodes with defaults and drops id-less nodes', () => {
    const nodes = [
      { id: 'a', x: 6, y: 2, w: 3, h: 2 },
      { id: 'b' },
      { x: 1, y: 1 }
    ] as GridStackNode[]

    expect(serializeGridNodes(nodes)).toEqual([
      { id: 'a', x: 6, y: 2, w: 3, h: 2 },
      { id: 'b', x: 0, y: 0, w: 1, h: 1 }
    ])
  })
})

describe('mergeGridChange', () => {
  it('merges changed nodes into the current layout by id', () => {
    const merged = mergeGridChange(LAYOUT, [{ id: 'b', x: 0, y: 4, w: 6, h: 3 }] as GridStackNode[])

    expect(merged).toEqual([
      { id: 'a', x: 0, y: 0, w: 3, h: 2 },
      { id: 'b', x: 0, y: 4, w: 6, h: 3 }
    ])
  })

  it('returns null when the event carries nothing to persist', () => {
    expect(mergeGridChange(LAYOUT, undefined)).toBeNull()
    expect(mergeGridChange(LAYOUT, [] as GridStackNode[])).toBeNull()
    expect(mergeGridChange(LAYOUT, [{ x: 1 }] as GridStackNode[])).toBeNull()
  })
})
