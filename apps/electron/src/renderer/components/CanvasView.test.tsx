/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasView } from './CanvasView'

const mockUseIdentity = vi.fn()
const mockUseNode = vi.fn()

vi.mock('@xnetjs/canvas', async () => {
  const ReactModule = await import('react')

  return {
    Canvas: ReactModule.forwardRef(function MockCanvas() {
      return <div data-testid="mock-canvas">canvas</div>
    }),
    createNode: vi.fn(() => ({
      id: 'node-1',
      type: 'card',
      position: { x: 0, y: 0, width: 100, height: 100 },
      properties: {}
    }))
  }
})

vi.mock('@xnetjs/data', () => ({
  CanvasSchema: {
    schema: {
      '@id': 'xnet://schema/canvas'
    }
  }
}))

vi.mock('@xnetjs/react', () => ({
  useIdentity: (...args: unknown[]) => mockUseIdentity(...args),
  useNode: (...args: unknown[]) => mockUseNode(...args)
}))

describe('CanvasView', () => {
  beforeEach(() => {
    const nodesMap = {
      size: 0,
      observe: vi.fn(),
      unobserve: vi.fn()
    }

    mockUseIdentity.mockReturnValue({ did: 'did:key:test' })
    mockUseNode.mockReturnValue({
      data: { title: 'Workspace Canvas' },
      doc: {
        getMap: vi.fn(() => nodesMap)
      },
      loading: false,
      awareness: null
    })
  })

  it('keeps the canvas host at full height for the renderer shell', () => {
    render(<CanvasView docId="canvas-1" />)

    const canvas = screen.getByTestId('mock-canvas')
    const canvasHost = canvas.parentElement?.parentElement

    expect(canvasHost).not.toBeNull()
    expect(canvasHost?.className).toContain('h-full')
  })
})
