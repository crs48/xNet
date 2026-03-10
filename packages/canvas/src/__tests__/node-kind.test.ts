import { describe, expect, it } from 'vitest'
import {
  CANVAS_SCENE_NODE_KINDS,
  getCanvasResolvedNodeKind,
  isCanvasObjectKind,
  isFrameLikeCanvasNode
} from '../scene/node-kind'

describe('node-kind', () => {
  it('recognizes Canvas V2 object kinds', () => {
    expect(CANVAS_SCENE_NODE_KINDS).toContain('page')
    expect(isCanvasObjectKind('page')).toBe(true)
    expect(isCanvasObjectKind('embed')).toBe(false)
  })

  it('treats frame-role groups as frame display kinds', () => {
    expect(
      getCanvasResolvedNodeKind({
        type: 'group',
        properties: { containerRole: 'frame' }
      })
    ).toBe('frame')
    expect(
      isFrameLikeCanvasNode({
        type: 'group',
        properties: { containerRole: 'frame' }
      })
    ).toBe(true)
  })

  it('keeps regular groups and scene objects distinct', () => {
    expect(getCanvasResolvedNodeKind({ type: 'group', properties: {} })).toBe('group')
    expect(getCanvasResolvedNodeKind({ type: 'note', properties: {} })).toBe('note')
  })

  it('downgrades legacy node types to generic legacy display kinds', () => {
    expect(getCanvasResolvedNodeKind({ type: 'card', properties: {} })).toBe('legacy')
    expect(getCanvasResolvedNodeKind({ type: 'embed', properties: {} })).toBe('legacy')
  })
})
