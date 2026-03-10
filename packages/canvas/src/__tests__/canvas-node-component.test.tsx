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

  it('routes resize handle interactions through the resize callbacks', () => {
    const onResizeStart = vi.fn()
    const onResize = vi.fn()
    const onResizeEnd = vi.fn()
    const onDragStart = vi.fn()

    render(
      <CanvasNodeComponent
        node={TEST_NODE}
        selected
        onSelect={vi.fn()}
        onDragStart={onDragStart}
        onDrag={vi.fn()}
        onDragEnd={vi.fn()}
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeEnd={onResizeEnd}
      />
    )

    const handle = screen.getByRole('button', { name: 'Resize Canvas Page from bottom-right' })

    fireEvent.pointerDown(handle, {
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 240,
      clientY: 220
    })
    fireEvent.mouseDown(handle, {
      button: 0,
      clientX: 240,
      clientY: 220
    })
    fireEvent.pointerMove(handle, {
      buttons: 1,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 280,
      clientY: 260
    })
    fireEvent.pointerUp(handle, {
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 280,
      clientY: 260
    })

    expect(onResizeStart).toHaveBeenCalledWith(
      'page-1',
      'bottom-right',
      expect.objectContaining({})
    )
    expect(onDragStart).not.toHaveBeenCalled()
    expect(onResize).toHaveBeenCalledWith('page-1', 'bottom-right', expect.any(Object))
    expect(onResizeEnd).toHaveBeenCalledWith('page-1')
  })
})
