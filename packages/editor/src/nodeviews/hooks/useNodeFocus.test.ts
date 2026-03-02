import { describe, expect, it } from 'vitest'
import { isNodeFocused } from './useNodeFocus'

describe('useNodeFocus helpers', () => {
  it('returns true for collapsed cursor at node start boundary', () => {
    expect(
      isNodeFocused({
        nodePos: 5,
        nodeSize: 12,
        selectionFrom: 6,
        selectionTo: 6,
        isNodeSelection: false
      })
    ).toBe(true)
  })

  it('returns true for collapsed cursor at node end boundary', () => {
    expect(
      isNodeFocused({
        nodePos: 5,
        nodeSize: 12,
        selectionFrom: 16,
        selectionTo: 16,
        isNodeSelection: false
      })
    ).toBe(true)
  })

  it('returns false when selection starts outside node content', () => {
    expect(
      isNodeFocused({
        nodePos: 5,
        nodeSize: 12,
        selectionFrom: 5,
        selectionTo: 10,
        isNodeSelection: false
      })
    ).toBe(false)
  })

  it('returns false when selection ends outside node content', () => {
    expect(
      isNodeFocused({
        nodePos: 5,
        nodeSize: 12,
        selectionFrom: 7,
        selectionTo: 17,
        isNodeSelection: false
      })
    ).toBe(false)
  })

  it('returns true for node selection targeting this node', () => {
    expect(
      isNodeFocused({
        nodePos: 12,
        nodeSize: 8,
        selectionFrom: 12,
        selectionTo: 20,
        isNodeSelection: true
      })
    ).toBe(true)
  })

  it('returns false for node selection targeting another node', () => {
    expect(
      isNodeFocused({
        nodePos: 12,
        nodeSize: 8,
        selectionFrom: 30,
        selectionTo: 38,
        isNodeSelection: true
      })
    ).toBe(false)
  })
})
