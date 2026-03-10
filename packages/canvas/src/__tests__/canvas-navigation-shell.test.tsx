import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { buildCanvasPerformanceScene } from '../fixtures/performance-scene'
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
  CanvasNodeComponent: ({
    node,
    children,
    selected,
    focused,
    onResizeStart,
    onResize,
    onResizeEnd
  }: {
    node: { id: string; type: string }
    selected?: boolean
    focused?: boolean
    onResizeStart?: (id: string, handle: string, point: { x: number; y: number }) => void
    onResize?: (id: string, handle: string, delta: { x: number; y: number }) => void
    onResizeEnd?: (id: string) => void
    children?: React.ReactNode
  }) => (
    <div
      className="canvas-node"
      data-node-id={node.id}
      data-node-type={node.type}
      data-focused={focused ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
    >
      {children}
      {selected && onResizeStart && onResize && onResizeEnd ? (
        <button
          type="button"
          data-canvas-resize-handle="bottom-right"
          onMouseDown={(event) => {
            const start = { x: event.clientX, y: event.clientY }
            onResizeStart(node.id, 'bottom-right', start)
            const ownerDocument = document

            const handleMouseMove = (moveEvent: MouseEvent) => {
              onResize(node.id, 'bottom-right', {
                x: moveEvent.clientX - start.x,
                y: moveEvent.clientY - start.y
              })
            }

            const handleMouseUp = () => {
              ownerDocument.removeEventListener('mousemove', handleMouseMove)
              ownerDocument.removeEventListener('mouseup', handleMouseUp)
              onResizeEnd(node.id)
            }

            ownerDocument.addEventListener('mousemove', handleMouseMove)
            ownerDocument.addEventListener('mouseup', handleMouseUp)
          }}
        >
          Resize
        </button>
      ) : null}
    </div>
  ),
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
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      scale: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
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

function createCanvasMock(overrides: Partial<ReturnType<typeof createCanvasMockBase>> = {}) {
  const base = createCanvasMockBase()
  return {
    ...base,
    ...overrides
  }
}

function createCanvasMockBase() {
  const viewport = createViewport({ x: 100, y: 80, zoom: 1 })
  viewport.width = 800
  viewport.height = 600

  return {
    nodes: [],
    edges: [],
    renderNodes: [],
    renderEdges: [],
    chunkStats: {
      loadedCount: 1,
      loadingCount: 0,
      totalNodes: 0,
      totalEdges: 0,
      crossChunkEdgeCount: 0,
      queuedCount: 0
    },
    selectedNodeIds: new Set<string>(),
    selectedEdgeIds: new Set<string>(),
    viewport,
    addNode: vi.fn(),
    updateNodes: vi.fn(),
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
    setViewportSize: vi.fn(),
    autoLayout: vi.fn(),
    layoutSelected: vi.fn(),
    findNodeAt: vi.fn(),
    findNodesInRect: vi.fn(),
    getVisibleNodes: vi.fn(() => []),
    store: {
      getBounds: vi.fn(() => ({ x: 50, y: 20, width: 200, height: 120 })),
      getVisibleNodes: vi.fn(() => []),
      getNode: vi.fn(),
      getNodesMap: vi.fn(() => new Map())
    }
  }
}

function createMockAwareness() {
  let localState: Record<string, unknown> | null = {
    user: {
      did: 'did:key:local',
      name: 'Local',
      color: '#3b82f6'
    }
  }
  const states = new Map<number, Record<string, unknown>>([[1, localState]])
  const listeners = new Set<() => void>()

  return {
    clientID: 1,
    getLocalState: () => localState,
    setLocalState: (state: Record<string, unknown> | null) => {
      localState = state
      if (state) {
        states.set(1, state)
      } else {
        states.delete(1)
      }
      listeners.forEach((listener) => listener())
    },
    setLocalStateField: (field: string, value: unknown) => {
      const nextState = {
        ...(localState ?? {}),
        [field]: value
      }
      localState = nextState
      states.set(1, nextState)
      listeners.forEach((listener) => listener())
    },
    getStates: () => states,
    on: (_event: string, handler: () => void) => {
      listeners.add(handler)
    },
    off: (_event: string, handler: () => void) => {
      listeners.delete(handler)
    },
    setRemoteState: (clientId: number, state: Record<string, unknown>) => {
      states.set(clientId, state)
      listeners.forEach((listener) => listener())
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

  it('provides drop callbacks with a surface coordinate transformer', () => {
    mockUseCanvas.mockReturnValue(createCanvasMock())
    const onSurfaceDrop = vi.fn()

    render(<Canvas doc={new Y.Doc()} onSurfaceDrop={onSurfaceDrop} />)

    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    expect(surface).toBeTruthy()

    fireEvent.drop(surface as HTMLElement, {
      clientX: 400,
      clientY: 300,
      dataTransfer: {
        files: [],
        getData: () => ''
      }
    })

    expect(onSurfaceDrop).toHaveBeenCalledTimes(1)
    const [, context] = onSurfaceDrop.mock.calls[0] as [
      React.DragEvent<HTMLDivElement>,
      { screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number } }
    ]

    expect(context.screenToCanvas(400, 300)).toEqual({ x: 100, y: 80 })
  })

  it('renders remote cursor overlays and surface activity diagnostics', () => {
    const awareness = createMockAwareness()
    const canvasMock = createCanvasMock()
    canvasMock.viewport.canvasToScreen = vi.fn((x: number, y: number) => ({
      x: x - 40,
      y: y - 20
    }))
    mockUseCanvas.mockReturnValue(canvasMock)

    awareness.setRemoteState(2, {
      user: {
        did: 'did:key:peer',
        name: 'Peer',
        color: '#22c55e'
      },
      selection: ['page-1'],
      cursor: { x: 200, y: 140 },
      activity: 'editing',
      editingNodeId: 'page-1'
    })

    render(
      <Canvas
        doc={new Y.Doc()}
        awareness={awareness}
        presenceIntent={{
          activity: 'commenting',
          editingNodeId: 'page-1'
        }}
      />
    )

    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    expect(surface?.dataset.canvasLocalActivity).toBe('commenting')
    expect(surface?.dataset.canvasRemoteUserCount).toBe('1')
    expect(document.querySelector('[data-canvas-remote-cursor="true"]')).toBeTruthy()
    expect(document.querySelector('[data-canvas-remote-activity="editing"]')).toBeTruthy()
  })

  it('resizes selected nodes and surfaces resizing activity diagnostics', () => {
    const node = {
      id: 'page-1',
      type: 'page',
      position: { x: 20, y: 40, width: 320, height: 200 },
      properties: { title: 'Canvas Page' }
    }
    const canvasMock = createCanvasMock()
    canvasMock.nodes = [node]
    canvasMock.renderNodes = [node]
    canvasMock.selectedNodeIds = new Set(['page-1'])
    canvasMock.store.getVisibleNodes = vi.fn(() => [node])
    canvasMock.store.getNode = vi.fn((nodeId: string) => (nodeId === 'page-1' ? node : undefined))

    mockUseCanvas.mockReturnValue(canvasMock)

    render(<Canvas doc={new Y.Doc()} />)

    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    const resizeHandle = screen.getByRole('button', { name: 'Resize' })

    fireEvent.mouseDown(resizeHandle, {
      button: 0,
      clientX: 200,
      clientY: 160
    })

    expect(surface?.dataset.canvasLocalActivity).toBe('resizing')

    fireEvent.mouseMove(document, {
      clientX: 248,
      clientY: 196
    })

    expect(canvasMock.updateNodePositions).toHaveBeenCalledWith([
      {
        id: 'page-1',
        position: {
          x: 20,
          y: 40,
          width: 368,
          height: 236
        }
      }
    ])

    fireEvent.mouseUp(document)

    expect(surface?.dataset.canvasLocalActivity).toBe('idle')
  })

  it('lets a parent runtime intercept undo and redo shortcuts', () => {
    mockUseCanvas.mockReturnValue(createCanvasMock())
    const onUndoRedoShortcut = vi.fn(() => true)

    render(<Canvas doc={new Y.Doc()} onUndoRedoShortcut={onUndoRedoShortcut} />)

    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    expect(surface).toBeTruthy()

    surface?.focus()

    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true })

    expect(onUndoRedoShortcut).toHaveBeenNthCalledWith(1, 'undo')
    expect(onUndoRedoShortcut).toHaveBeenNthCalledWith(2, 'redo')
  })

  it('collects frame diagnostics when performance monitoring is enabled', async () => {
    mockUseCanvas.mockReturnValue(createCanvasMock())
    const canvasRef = React.createRef<import('../renderer/Canvas').CanvasHandle>()

    render(<Canvas ref={canvasRef} doc={new Y.Doc()} collectPerformanceMetrics />)

    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })

    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    expect(surface?.dataset.canvasPerformanceEnabled).toBe('true')
    expect(canvasRef.current?.getPerformanceStats().frameCount ?? 0).toBeGreaterThan(0)

    act(() => {
      canvasRef.current?.resetPerformanceStats()
    })

    expect(Number(surface?.dataset.canvasFrameCount ?? 0)).toBeLessThanOrEqual(1)
  })

  it('supports spatial keyboard focus with live announcements', async () => {
    const nodes = [
      {
        id: 'page-1',
        type: 'page',
        position: { x: 20, y: 40, width: 320, height: 200 },
        properties: { title: 'Alpha' }
      },
      {
        id: 'page-2',
        type: 'page',
        position: { x: 420, y: 40, width: 320, height: 200 },
        properties: { title: 'Bravo' }
      }
    ]
    const canvasMock = createCanvasMock()
    canvasMock.nodes = nodes
    canvasMock.renderNodes = nodes
    canvasMock.store.getNode = vi.fn((nodeId: string) => nodes.find((node) => node.id === nodeId))
    canvasMock.store.getNodesMap = vi.fn(() => new Map(nodes.map((node) => [node.id, node])))

    mockUseCanvas.mockReturnValue(canvasMock)

    render(<Canvas doc={new Y.Doc()} />)

    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    expect(surface).toBeTruthy()

    surface?.focus()

    fireEvent.keyDown(window, { key: 'Home' })

    expect(canvasMock.selectNodes).toHaveBeenNthCalledWith(1, ['page-1'])
    expect(surface?.dataset.canvasFocusedNodeId).toBe('page-1')
    expect(surface?.dataset.canvasLastAnnouncement).toContain('Page: Alpha')

    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true })

    expect(canvasMock.selectNodes).toHaveBeenNthCalledWith(2, ['page-2'])
    expect(surface?.dataset.canvasFocusedNodeId).toBe('page-2')
    expect(surface?.dataset.canvasLastAnnouncement).toContain('Page: Bravo')
  })

  it('passes render context to full-detail node renderers', () => {
    const node = {
      id: 'page-1',
      type: 'page',
      position: { x: 20, y: 40, width: 320, height: 200 },
      properties: { title: 'Canvas Page' }
    }
    const canvasMock = createCanvasMock()
    canvasMock.nodes = [node]
    canvasMock.selectedNodeIds = new Set(['page-1'])
    canvasMock.viewport.zoom = 1.25
    canvasMock.store.getVisibleNodes = vi.fn(() => [node])

    mockUseCanvas.mockReturnValue(canvasMock)

    const renderNode = vi.fn(() => <div>inline</div>)

    render(<Canvas doc={new Y.Doc()} renderNode={renderNode} />)

    expect(renderNode).toHaveBeenCalledWith(
      node,
      expect.objectContaining({
        selected: true,
        lod: 'full',
        selectionSize: 1,
        viewportZoom: 1.25
      })
    )
  })

  it('renders built-in primitive content for shape and frame nodes', () => {
    const nodes = [
      {
        id: 'shape-1',
        type: 'shape',
        position: { x: 20, y: 40, width: 240, height: 160 },
        properties: { title: 'Rectangle', label: 'Rectangle', shapeType: 'rectangle' }
      },
      {
        id: 'frame-1',
        type: 'group',
        position: { x: 320, y: 80, width: 420, height: 280 },
        properties: { title: 'Frame', containerRole: 'frame', memberIds: ['shape-1'] }
      }
    ]
    const canvasMock = createCanvasMock()
    canvasMock.nodes = nodes
    canvasMock.store.getVisibleNodes = vi.fn(() => nodes)

    mockUseCanvas.mockReturnValue(canvasMock)

    render(<Canvas doc={new Y.Doc()} />)

    expect(
      document.querySelector(
        '[data-canvas-primitive-node="true"][data-canvas-primitive-kind="shape"]'
      )
    ).toBeTruthy()
    expect(
      document.querySelector(
        '[data-canvas-primitive-node="true"][data-canvas-container-role="frame"]'
      )
    ).toBeTruthy()
  })

  it('keeps dense scenes bounded to visible nodes while retaining minimap diagnostics', () => {
    const scene = buildCanvasPerformanceScene({
      columns: 42,
      rows: 28,
      clusterColumns: 6,
      clusterRows: 4
    })
    const visibleNodes = scene.nodes.slice(0, 84)
    const canvasMock = createCanvasMock()
    canvasMock.nodes = scene.nodes
    canvasMock.edges = scene.edges
    canvasMock.renderNodes = visibleNodes
    canvasMock.renderEdges = scene.edges
    canvasMock.chunkStats = {
      loadedCount: 6,
      loadingCount: 0,
      totalNodes: visibleNodes.length,
      totalEdges: scene.edges.length,
      crossChunkEdgeCount: 24,
      queuedCount: 0
    }
    canvasMock.store.getVisibleNodes = vi.fn(() => visibleNodes)

    mockUseCanvas.mockReturnValue(canvasMock)

    const renderNode = vi.fn(() => <div data-testid="dense-node" />)

    render(<Canvas doc={new Y.Doc()} renderNode={renderNode} showMinimap />)

    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    const minimap = document.querySelector<HTMLElement>('[data-canvas-minimap="true"]')

    expect(surface?.dataset.nodeCount).toBe(String(scene.nodeCount))
    expect(surface?.dataset.loadedNodeCount).toBe(String(visibleNodes.length))
    expect(surface?.dataset.visibleNodeCount).toBe(String(visibleNodes.length))
    expect(surface?.dataset.canvasRenderMode).toBe('hybrid')
    expect(surface?.dataset.domNodeCount).toBe('48')
    expect(surface?.dataset.overviewNodeCount).toBe(String(visibleNodes.length - 48))
    expect(surface?.dataset.loadedChunkCount).toBe('6')
    expect(Number(surface?.dataset.visibleEdgeCount ?? 0)).toBeLessThanOrEqual(scene.edgeCount)
    expect(document.querySelectorAll('.canvas-node')).toHaveLength(48)
    expect(renderNode).toHaveBeenCalledTimes(48)
    expect(minimap?.dataset.canvasMinimapNodeCount).toBe(String(scene.nodeCount))
    expect(minimap?.dataset.canvasMinimapEdgeCount).toBe(String(scene.edgeCount))
  })

  it('selects far-field overview nodes via hit testing before mounting a DOM island', () => {
    const farFieldNode = {
      id: 'page-1',
      type: 'page',
      position: { x: 60, y: 80, width: 320, height: 220 },
      properties: { title: 'Canvas Page' }
    }
    const canvasMock = createCanvasMock()
    canvasMock.nodes = Array.from({ length: 96 }, (_, index) => ({
      id: `node-${index}`,
      type: 'page',
      position: {
        x: index * 40,
        y: index * 30,
        width: 220,
        height: 160
      },
      properties: { title: `Node ${index}` }
    }))
    canvasMock.store.getVisibleNodes = vi.fn(() => canvasMock.nodes)
    canvasMock.findNodeAt = vi.fn(() => farFieldNode)

    mockUseCanvas.mockReturnValue(canvasMock)

    render(<Canvas doc={new Y.Doc()} />)

    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    expect(surface).toBeTruthy()

    fireEvent.mouseDown(surface as HTMLElement, {
      clientX: 320,
      clientY: 240,
      button: 0
    })

    expect(canvasMock.selectNode).toHaveBeenCalledWith('page-1', false)
  })

  it('dispatches canvas creation, help, and selection-open shortcuts when focused', () => {
    const nodes = [
      {
        id: 'page-1',
        type: 'page',
        position: { x: 20, y: 40, width: 320, height: 200 },
        properties: { title: 'Canvas Page' }
      },
      {
        id: 'page-2',
        type: 'page',
        position: { x: 420, y: 40, width: 320, height: 200 },
        properties: { title: 'Canvas Page 2' }
      }
    ]
    const canvasMock = createCanvasMock()
    canvasMock.nodes = nodes
    canvasMock.selectedNodeIds = new Set(['page-1'])
    canvasMock.store.getVisibleNodes = vi.fn(() => nodes)

    mockUseCanvas.mockReturnValue(canvasMock)

    const onCreateObject = vi.fn()
    const onOpenSelection = vi.fn()
    const onToggleShortcutHelp = vi.fn()
    const onEditSelectionAlias = vi.fn()
    const onCreateSelectionComment = vi.fn()

    render(
      <Canvas
        doc={new Y.Doc()}
        onCreateObject={onCreateObject}
        onOpenSelection={onOpenSelection}
        onToggleShortcutHelp={onToggleShortcutHelp}
        onEditSelectionAlias={onEditSelectionAlias}
        onCreateSelectionComment={onCreateSelectionComment}
      />
    )

    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    surface?.focus()

    fireEvent.keyDown(window, { key: 'Tab' })
    fireEvent.keyDown(window, { key: 'P' })
    fireEvent.keyDown(window, { key: 'R' })
    fireEvent.keyDown(window, { key: 'F' })
    fireEvent.keyDown(window, { key: 'A', metaKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: 'C', metaKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: '/', shiftKey: true })
    fireEvent.keyDown(window, { key: 'Enter', altKey: true })
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })

    expect(canvasMock.selectNode).toHaveBeenCalledWith('page-2')
    expect(onCreateObject).toHaveBeenCalledWith('page')
    expect(onCreateObject).toHaveBeenCalledWith('shape')
    expect(onCreateObject).toHaveBeenCalledWith('frame')
    expect(onEditSelectionAlias).toHaveBeenCalledOnce()
    expect(onCreateSelectionComment).toHaveBeenCalledOnce()
    expect(onToggleShortcutHelp).toHaveBeenCalledOnce()
    expect(onOpenSelection).toHaveBeenNthCalledWith(1, 'split')
    expect(onOpenSelection).toHaveBeenNthCalledWith(2, 'focus')
  })

  it('dispatches lock, align, and layer shortcuts against the current selection', () => {
    const leftNode = {
      id: 'page-1',
      type: 'page',
      locked: false,
      position: { x: 20, y: 40, width: 120, height: 80, zIndex: 1 },
      properties: { title: 'Canvas Page' }
    }
    const rightNode = {
      id: 'page-2',
      type: 'page',
      locked: false,
      position: { x: 220, y: 140, width: 160, height: 120, zIndex: 3 },
      properties: { title: 'Canvas Page 2' }
    }
    const nodesById = new Map([
      [leftNode.id, leftNode],
      [rightNode.id, rightNode]
    ])
    const canvasMock = createCanvasMock()
    canvasMock.nodes = [leftNode, rightNode]
    canvasMock.selectedNodeIds = new Set(['page-1', 'page-2'])
    canvasMock.store.getVisibleNodes = vi.fn(() => [leftNode, rightNode])
    canvasMock.store.getNode = vi.fn((nodeId: string) => nodesById.get(nodeId))

    mockUseCanvas.mockReturnValue(canvasMock)

    render(<Canvas doc={new Y.Doc()} />)

    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    surface?.focus()

    fireEvent.keyDown(window, { key: 'L', metaKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: 'ArrowLeft', metaKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: '[' })
    fireEvent.keyDown(window, { key: ']' })

    expect(canvasMock.updateNodes).toHaveBeenCalledWith([
      { id: 'page-1', changes: { locked: true } },
      { id: 'page-2', changes: { locked: true } }
    ])
    expect(canvasMock.updateNodePositions).toHaveBeenNthCalledWith(1, [
      { id: 'page-1', position: { x: 20 } },
      { id: 'page-2', position: { x: 20 } }
    ])
    expect(canvasMock.updateNodePositions).toHaveBeenNthCalledWith(2, [
      { id: 'page-1', position: { zIndex: 0 } },
      { id: 'page-2', position: { zIndex: 2 } }
    ])
    expect(canvasMock.updateNodePositions).toHaveBeenNthCalledWith(3, [
      { id: 'page-1', position: { zIndex: 2 } },
      { id: 'page-2', position: { zIndex: 4 } }
    ])
  })

  it('wraps the current selection in a frame with the keyboard shortcut', () => {
    const leftNode = {
      id: 'page-1',
      type: 'page',
      position: { x: 20, y: 40, width: 120, height: 80, zIndex: 1 },
      properties: { title: 'Canvas Page' }
    }
    const rightNode = {
      id: 'page-2',
      type: 'page',
      position: { x: 220, y: 140, width: 160, height: 120, zIndex: 3 },
      properties: { title: 'Canvas Page 2' }
    }
    const nodesById = new Map([
      [leftNode.id, leftNode],
      [rightNode.id, rightNode]
    ])
    const canvasMock = createCanvasMock()
    canvasMock.nodes = [leftNode, rightNode]
    canvasMock.selectedNodeIds = new Set(['page-1', 'page-2'])
    canvasMock.store.getVisibleNodes = vi.fn(() => [leftNode, rightNode])
    canvasMock.store.getNode = vi.fn((nodeId: string) => nodesById.get(nodeId))
    canvasMock.store.getNodesMap = vi.fn(() => nodesById)

    mockUseCanvas.mockReturnValue(canvasMock)

    render(<Canvas doc={new Y.Doc()} />)

    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    surface?.focus()

    fireEvent.keyDown(window, { key: 'F', metaKey: true, shiftKey: true })

    expect(canvasMock.addNode).toHaveBeenCalledTimes(1)
    const [frameNode] = canvasMock.addNode.mock.calls[0] as [
      {
        id: string
        type: string
        properties: { containerRole?: string; memberIds?: string[] }
      }
    ]

    expect(frameNode.type).toBe('group')
    expect(frameNode.properties.containerRole).toBe('frame')
    expect(frameNode.properties.memberIds).toEqual(['page-1', 'page-2'])
    expect(canvasMock.selectNode).toHaveBeenCalledWith(frameNode.id)
  })

  it('nudges the current selection instead of panning when arrow shortcuts are used', () => {
    const selectedNode = {
      id: 'page-1',
      type: 'page',
      position: { x: 20, y: 40, width: 320, height: 200 },
      properties: { title: 'Canvas Page' }
    }
    const canvasMock = createCanvasMock()
    canvasMock.nodes = [selectedNode]
    canvasMock.selectedNodeIds = new Set(['page-1'])
    canvasMock.store.getVisibleNodes = vi.fn(() => [selectedNode])
    canvasMock.store.getNode = vi.fn(() => selectedNode)

    mockUseCanvas.mockReturnValue(canvasMock)

    render(<Canvas doc={new Y.Doc()} />)

    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    surface?.focus()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true })

    expect(canvasMock.updateNodePositions).toHaveBeenNthCalledWith(1, [
      {
        id: 'page-1',
        position: {
          x: 36,
          y: 40
        }
      }
    ])
    expect(canvasMock.updateNodePositions).toHaveBeenNthCalledWith(2, [
      {
        id: 'page-1',
        position: {
          x: 20,
          y: 72
        }
      }
    ])
    expect(canvasMock.pan).not.toHaveBeenCalled()
  })

  it('keeps single-key shortcuts disabled while typing inside an inline surface', () => {
    const selectedNode = {
      id: 'page-1',
      type: 'page',
      position: { x: 20, y: 40, width: 320, height: 200 },
      properties: { title: 'Canvas Page' }
    }
    const canvasMock = createCanvasMock()
    canvasMock.nodes = [selectedNode]
    canvasMock.selectedNodeIds = new Set(['page-1'])
    canvasMock.store.getVisibleNodes = vi.fn(() => [selectedNode])

    mockUseCanvas.mockReturnValue(canvasMock)

    const onCreateObject = vi.fn()
    const onToggleShortcutHelp = vi.fn()

    render(
      <Canvas
        doc={new Y.Doc()}
        onCreateObject={onCreateObject}
        onToggleShortcutHelp={onToggleShortcutHelp}
        renderNode={() => (
          <input
            type="text"
            defaultValue="Canvas title"
            data-canvas-interactive="true"
            aria-label="Canvas title"
          />
        )}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Canvas title' })
    input.focus()

    fireEvent.keyDown(window, { key: 'P' })
    fireEvent.keyDown(window, { key: '/', shiftKey: true })

    expect(onCreateObject).not.toHaveBeenCalled()
    expect(onToggleShortcutHelp).not.toHaveBeenCalled()
  })
})
