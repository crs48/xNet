import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CommentOverlay } from '../comments/CommentOverlay'

const mockUseCanvasComments = vi.fn()

vi.mock('../hooks/useCanvasComments', () => ({
  useCanvasComments: (...args: unknown[]) => mockUseCanvasComments(...args)
}))

const baseThread = {
  root: {
    id: 'thread-1',
    createdAt: Date.now(),
    properties: {
      createdBy: 'did:key:z6Mkabcd',
      resolved: false,
      content: 'Comment on the selected card'
    }
  },
  replies: []
}

describe('CommentOverlay', () => {
  it('renders active pins and exposes orphaned threads through the tray', () => {
    mockUseCanvasComments.mockReturnValue({
      activePins: [
        {
          thread: baseThread,
          viewportX: 120,
          viewportY: 180,
          orphaned: false,
          canvasCoords: { x: 120, y: 180 }
        }
      ],
      orphanedPins: [
        {
          thread: {
            ...baseThread,
            root: {
              ...baseThread.root,
              id: 'thread-2',
              properties: {
                ...baseThread.root.properties,
                content: 'Lost anchor thread'
              }
            }
          },
          viewportX: 0,
          viewportY: 0,
          orphaned: true,
          canvasCoords: null
        }
      ],
      replyTo: vi.fn(),
      resolveThread: vi.fn(),
      reopenThread: vi.fn(),
      deleteComment: vi.fn(),
      editComment: vi.fn()
    })

    render(
      <CommentOverlay
        canvasNodeId="canvas-1"
        transform={{ panX: 0, panY: 0, zoom: 1 }}
        objects={new Map()}
      />
    )

    expect(document.querySelector('[data-canvas-comment-pin="true"]')).toBeTruthy()
    expect(document.querySelector('[data-canvas-comment-orphan-tray="true"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /orphaned comment/i }))

    expect(screen.getAllByText('Lost anchor thread').length).toBeGreaterThan(0)
  })
})
