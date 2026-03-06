import { describe, expect, it } from 'vitest'
import {
  createCanvasShellNoteProperties,
  getCanvasShellNotePlacement,
  getLinkedDocumentPlacement,
  isCanvasShellNote,
  shouldRenderCanvasShellCard
} from './canvas-shell'

describe('canvas-shell', () => {
  describe('isCanvasShellNote', () => {
    it('returns true for shell-created note cards', () => {
      const node = {
        type: 'card',
        properties: createCanvasShellNoteProperties()
      }

      expect(isCanvasShellNote(node)).toBe(true)
    })

    it('returns false for generic card nodes', () => {
      const node = {
        type: 'card',
        properties: { title: 'Generic card' }
      }

      expect(isCanvasShellNote(node)).toBe(false)
    })

    it('returns false for non-card nodes', () => {
      const node = {
        type: 'embed',
        properties: { title: 'Linked page' }
      }

      expect(isCanvasShellNote(node)).toBe(false)
    })
  })

  describe('shouldRenderCanvasShellCard', () => {
    it('renders linked documents with shell cards', () => {
      const node = {
        type: 'embed',
        properties: { title: 'Linked page' },
        linkedNodeId: 'page-1'
      }

      expect(shouldRenderCanvasShellCard(node, { id: 'page-1', title: 'Page', type: 'page' })).toBe(
        true
      )
    })

    it('does not render generic cards with shell chrome', () => {
      const node = {
        type: 'card',
        properties: { title: 'Generic card' }
      }

      expect(shouldRenderCanvasShellCard(node)).toBe(false)
    })
  })

  describe('placement helpers', () => {
    const viewport = {
      x: 240,
      y: 180,
      zoom: 1.25
    }

    it('centers shell notes on the current viewport', () => {
      const placement = getCanvasShellNotePlacement(viewport)

      expect(placement.x + placement.width / 2).toBe(viewport.x)
      expect(placement.y + placement.height / 2).toBe(viewport.y)
    })

    it('centers new pages on the current viewport', () => {
      const placement = getLinkedDocumentPlacement(viewport, 'page')

      expect(placement.x + placement.width / 2).toBe(viewport.x)
      expect(placement.y + placement.height / 2).toBe(viewport.y)
      expect(placement.width).toBe(360)
      expect(placement.height).toBe(220)
    })

    it('centers new databases on the current viewport', () => {
      const placement = getLinkedDocumentPlacement(viewport, 'database')

      expect(placement.x + placement.width / 2).toBe(viewport.x)
      expect(placement.y + placement.height / 2).toBe(viewport.y)
      expect(placement.width).toBe(440)
      expect(placement.height).toBe(260)
    })
  })
})
