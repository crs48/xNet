import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createCanvasQueryFrameNode } from '../frames/query-frames'
import { CANVAS_INTERNAL_NODE_MIME, parseCanvasInternalNodeDragData } from '../ingestion'
import { CanvasPrimitiveNodeContent } from './CanvasPrimitiveNodeContent'

const viewport = {
  x: 100,
  y: 100,
  zoom: 1
}

describe('CanvasPrimitiveNodeContent query result cards', () => {
  it('serializes source-backed result cards as internal canvas drags', () => {
    const frame = createCanvasQueryFrameNode({
      viewport,
      query: {
        source: 'schema',
        label: 'Social actors'
      },
      resultPreview: {
        cards: [
          {
            id: 'actor:1',
            title: 'Alice Example',
            subtitle: 'instagram / actor',
            description: 'Imported profile',
            sourceNodeId: 'social-actor-1',
            schemaId: 'xnet://xnet.fyi/SocialActor@1.0.0',
            href: 'https://instagram.com/alice',
            badges: ['instagram', 'actor']
          }
        ]
      }
    })
    const values = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'uninitialized',
      setData: vi.fn((type: string, value: string) => {
        values.set(type, value)
      })
    } as unknown as DataTransfer

    render(<CanvasPrimitiveNodeContent node={frame} />)

    const card = screen
      .getByText('Alice Example')
      .closest('[data-canvas-query-frame-result-card="true"]')
    expect(card).not.toBeNull()

    fireEvent.dragStart(card as HTMLElement, { dataTransfer })

    expect(dataTransfer.effectAllowed).toBe('copy')
    expect(parseCanvasInternalNodeDragData(values.get(CANVAS_INTERNAL_NODE_MIME))).toEqual({
      nodeId: 'social-actor-1',
      schemaId: 'xnet://xnet.fyi/SocialActor@1.0.0',
      title: 'Alice Example',
      canvasKind: 'external-reference',
      subtitle: 'instagram / actor',
      description: 'Imported profile',
      href: 'https://instagram.com/alice',
      badges: ['instagram', 'actor']
    })
    expect(values.get('text/plain')).toBe('Alice Example')
  })
})
