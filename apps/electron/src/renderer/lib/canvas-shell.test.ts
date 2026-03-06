import { createNode } from '@xnetjs/canvas'
import { describe, expect, it } from 'vitest'
import {
  createCanvasShellNoteProperties,
  isCanvasShellNote,
  shouldRenderCanvasShellCard
} from './canvas-shell'

describe('canvas-shell', () => {
  describe('isCanvasShellNote', () => {
    it('returns true for shell-created note cards', () => {
      const node = createNode('card', {}, createCanvasShellNoteProperties())

      expect(isCanvasShellNote(node)).toBe(true)
    })

    it('returns false for generic card nodes', () => {
      const node = createNode('card', {}, { title: 'Generic card' })

      expect(isCanvasShellNote(node)).toBe(false)
    })

    it('returns false for non-card nodes', () => {
      const node = createNode('embed', {}, { title: 'Linked page' })

      expect(isCanvasShellNote(node)).toBe(false)
    })
  })

  describe('shouldRenderCanvasShellCard', () => {
    it('renders linked documents with shell cards', () => {
      const node = createNode('embed', {}, { title: 'Linked page' })
      node.linkedNodeId = 'page-1'

      expect(shouldRenderCanvasShellCard(node, { id: 'page-1', title: 'Page', type: 'page' })).toBe(
        true
      )
    })

    it('does not render generic cards with shell chrome', () => {
      const node = createNode('card', {}, { title: 'Generic card' })

      expect(shouldRenderCanvasShellCard(node)).toBe(false)
    })
  })
})
