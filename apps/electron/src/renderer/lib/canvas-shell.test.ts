import { describe, expect, it } from 'vitest'
import {
  createCanvasShellNoteProperties,
  getCanvasShellDisplayType,
  getCanvasShellSourceId,
  getCanvasShellSourceType,
  getCanvasShellNotePlacement,
  getLinkedDocumentPlacement,
  isCanvasShellNote,
  shouldRenderCanvasShellCard
} from './canvas-shell'

describe('canvas-shell', () => {
  describe('isCanvasShellNote', () => {
    it('returns true for shell-created note nodes', () => {
      const node = {
        type: 'note',
        properties: createCanvasShellNoteProperties()
      }

      expect(isCanvasShellNote(node)).toBe(true)
    })

    it('returns false for generic page nodes', () => {
      const node = {
        type: 'page',
        properties: { title: 'Generic card' }
      }

      expect(isCanvasShellNote(node)).toBe(false)
    })

    it('returns false for non-note nodes', () => {
      const node = {
        type: 'database',
        properties: { title: 'Linked page' }
      }

      expect(isCanvasShellNote(node)).toBe(false)
    })
  })

  describe('shouldRenderCanvasShellCard', () => {
    it('renders page objects with shell chrome', () => {
      const node = {
        type: 'page',
        properties: { title: 'Linked page' },
        sourceNodeId: 'page-1'
      }

      expect(shouldRenderCanvasShellCard(node, { id: 'page-1', title: 'Page', type: 'page' })).toBe(
        true
      )
    })

    it('renders note objects even without a loaded linked document', () => {
      const node = {
        type: 'note',
        properties: createCanvasShellNoteProperties()
      }

      expect(shouldRenderCanvasShellCard(node)).toBe(true)
    })

    it('does not render unrelated shape objects with shell chrome', () => {
      const node = {
        type: 'shape',
        properties: { title: 'Rectangle' }
      }

      expect(shouldRenderCanvasShellCard(node)).toBe(false)
    })
  })

  describe('source helpers', () => {
    it('derives note display type separately from its page source', () => {
      const node = {
        type: 'note',
        sourceNodeId: 'page-1',
        sourceSchemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: createCanvasShellNoteProperties()
      }

      expect(getCanvasShellDisplayType(node)).toBe('note')
      expect(getCanvasShellSourceType(node)).toBe('page')
      expect(getCanvasShellSourceId(node)).toBe('page-1')
    })

    it('uses source schema ids to resolve document types', () => {
      const node = {
        type: 'media',
        sourceNodeId: 'db-1',
        sourceSchemaId: 'xnet://xnet.fyi/Database@1.0.0',
        properties: {}
      }

      expect(getCanvasShellSourceType(node)).toBe('database')
    })

    it('falls back to the legacy linked node id', () => {
      const node = {
        type: 'embed',
        linkedNodeId: 'page-legacy',
        properties: { linkedType: 'page' }
      }

      expect(getCanvasShellSourceId(node)).toBe('page-legacy')
      expect(getCanvasShellSourceType(node)).toBe('page')
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
