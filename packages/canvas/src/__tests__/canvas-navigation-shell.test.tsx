import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { Canvas } from '../renderer/Canvas'
import { createViewport } from '../spatial'

const mockUseCanvas = vi.fn()

vi.mock('../hooks/useCanvas', () => ({
  useCanvas: (...args: unknown[]) => mockUseCanvas(...args)
}))

vi.mock('../layers', () => ({
  createGridLayer: () => ({
    resize: vi.fn(),
    render: vi.fn(),
    destroy: vi.fn()
  })
}))

vi.mock('../comments/CommentOverlay', () => ({
  CommentOverlay: () => null
}))

vi.mock('../edges/CanvasEdgeComponent', () => ({
  CanvasEdgeComponent: () => null
}))

vi.mock('../nodes/CanvasNodeComponent', () => ({
  CanvasNodeComponent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  calculateLOD: () => 'full'
}))

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({
      scale: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn()
    }))
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return 800
    }
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 600
    }
  })
})

function createCanvasMock() {
  const viewport = createViewport({ x: 100, y: 80, zoom: 1 })
  viewport.width = 800
  viewport.height = 600

  return {
    nodes: [],
    edges: [],
    selectedNodeIds: new Set<string>(),
    selectedEdgeIds: new Set<string>(),
    viewport,
    addNode: vi.fn(),
    updateNodePosition: vi.fn(),
    updateNodePositions: vi.fn(),
    removeNode: vi.fn(),
    removeNodes: vi.fn(),
    addEdge: vi.fn(),
    removeEdge: vi.fn(),
    selectNode: vi.fn(),
    selectNodes: vi.fn(),
    selectEdge: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    deleteSelected: vi.fn(),
    pan: vi.fn(),
    zoomAt: vi.fn(),
    fitToContent: vi.fn(),
    fitToRect: vi.fn(),
    resetView: vi.fn(),
    getViewportSnapshot: vi.fn(() => ({ x: 100, y: 80, zoom: 1 })),
    setViewportSnapshot: vi.fn(),
    autoLayout: vi.fn(),
    layoutSelected: vi.fn(),
    findNodeAt: vi.fn(),
    findNodesInRect: vi.fn(),
    getVisibleNodes: vi.fn(() => []),
    store: {
      getBounds: vi.fn(() => ({ x: 50, y: 20, width: 200, height: 120 })),
      getVisibleNodes: vi.fn(() => []),
      getNode: vi.fn()
    }
  }
}

describe('Canvas navigation shell', () => {
  beforeEach(() => {
    mockUseCanvas.mockReset()
  })

  it('renders the shared navigation tools when requested', () => {
    mockUseCanvas.mockReturnValue(createCanvasMock())

    render(
      <Canvas
        doc={new Y.Doc()}
        showNavigationTools
        navigationToolsPosition="bottom-right"
        navigationToolsShowZoomLabel={false}
      />
    )

    expect(screen.getByRole('button', { name: /zoom in/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /fit to content/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /reset view/i })).toBeTruthy()
    expect(screen.queryByText('100%')).toBeNull()
  })

  it('renders the shared minimap when requested', () => {
    mockUseCanvas.mockReturnValue(createCanvasMock())

    render(
      <Canvas
        doc={new Y.Doc()}
        showNavigationTools
        showMinimap
        navigationToolsPosition="bottom-right"
      />
    )

    expect(screen.getByRole('button', { name: /hide minimap/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeTruthy()
  })

  it('routes navigation tool actions through the viewport snapshot API', () => {
    const canvasMock = createCanvasMock()
    mockUseCanvas.mockReturnValue(canvasMock)

    render(<Canvas doc={new Y.Doc()} showNavigationTools />)

    fireEvent.click(screen.getByRole('button', { name: /fit to content/i }))
    fireEvent.click(screen.getByRole('button', { name: /reset view/i }))

    expect(canvasMock.setViewportSnapshot).toHaveBeenNthCalledWith(1, {
      x: 150,
      y: 80,
      zoom: 1
    })
    expect(canvasMock.setViewportSnapshot).toHaveBeenNthCalledWith(2, {
      x: 0,
      y: 0,
      zoom: 1
    })
  })
})
