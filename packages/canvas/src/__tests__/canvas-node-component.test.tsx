import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CanvasNodeComponent } from '../nodes/CanvasNodeComponent'

const TEST_NODE = {
  id: 'page-1',
  type: 'page' as const,
  position: {
    x: 10,
    y: 20,
    width: 320,
    height: 220
  },
  properties: {
    title: 'Canvas Page'
  }
}

describe('CanvasNodeComponent', () => {
  it('treats interactive child regions as selectable but not draggable', () => {
    const onSelect = vi.fn()
    const onDragStart = vi.fn()
    const onDrag = vi.fn()
    const onDragEnd = vi.fn()

    render(
      <CanvasNodeComponent
        node={TEST_NODE}
        selected={false}
        onSelect={onSelect}
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
      >
        <div data-canvas-interactive="true">
          <button type="button">Edit title</button>
        </div>
      </CanvasNodeComponent>
    )

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Edit title' }), {
      button: 0,
      clientX: 100,
      clientY: 120
    })
    fireEvent.mouseMove(window, { clientX: 120, clientY: 140 })
    fireEvent.mouseUp(window)

    expect(onSelect).toHaveBeenCalledWith('page-1', false)
    expect(onDragStart).not.toHaveBeenCalled()
    expect(onDrag).not.toHaveBeenCalled()
    expect(onDragEnd).not.toHaveBeenCalled()
  })

  it('prevents node double-click handlers from firing through interactive child regions', () => {
    const onDoubleClick = vi.fn()

    render(
      <CanvasNodeComponent
        node={TEST_NODE}
        selected={true}
        onSelect={vi.fn()}
        onDragStart={vi.fn()}
        onDrag={vi.fn()}
        onDragEnd={vi.fn()}
        onDoubleClick={onDoubleClick}
      >
        <div data-canvas-interactive="true">
          <button type="button">Inline editor</button>
        </div>
      </CanvasNodeComponent>
    )

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Inline editor' }))

    expect(onDoubleClick).not.toHaveBeenCalled()
  })
})
