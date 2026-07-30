/**
 * Canvas v3 active renderer tests.
 */

import type { CanvasEdge, CanvasHandle, CanvasNode, ResizeHandle } from '../index'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import {
  Canvas,
  createEdge,
  createCanvasMindMapBranchProperties,
  createCanvasEdgeRelationship,
  createCanvasFrameVariantNode,
  createCanvasMindMapRootProperties,
  createCanvasStickyNoteNode,
  createNode,
  getCanvasMindMapMetadata,
  getCanvasConnectorsMap,
  getCanvasObjectsMap
} from '../index'
import { readCanvasV3MigrationSceneFromFlatDoc } from '../scene/flat-doc-v3-migration'
import { getCanvasResizePolicy } from '../selection/resize-policy'
import { createResizeUpdate } from '../selection/scene-operations'

const TEST_RESIZE_HANDLES: ResizeHandle[] = [
  'top-left',
  'top',
  'top-right',
  'right',
  'bottom-right',
  'bottom',
  'bottom-left',
  'left'
]

class ResizeObserverStub {
  observe(): void {
    // Test DOM sizes are fixed through HTMLElement clientWidth/clientHeight stubs.
  }

  unobserve(): void {
    // No-op.
  }

  disconnect(): void {
    // No-op.
  }
}

class PointerEventStub extends MouseEvent {
  pointerId: number
  pointerType: string

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
  }
}

function createMockAwareness() {
  let localState: Record<string, unknown> = {
    user: {
      did: 'did:key:local',
      name: 'Local',
      color: '#3b82f6'
    }
  }
  const states = new Map<number, Record<string, unknown>>([[1, localState]])
  const listeners = new Set<() => void>()

  const emitChange = () => {
    listeners.forEach((listener) => {
      listener()
    })
  }

  return {
    clientID: 1,
    getStates: () => states,
    setLocalStateField: vi.fn((field: string, value: unknown) => {
      const nextState = {
        ...localState,
        [field]: value
      }

      localState = nextState
      states.set(1, nextState)
      emitChange()
    }),
    on: (_event: string, handler: () => void) => {
      listeners.add(handler)
    },
    off: (_event: string, handler: () => void) => {
      listeners.delete(handler)
    },
    setRemoteState: (clientId: number, state: Record<string, unknown>) => {
      states.set(clientId, state)
      emitChange()
    }
  }
}

function createCanvasTestDoc(): Y.Doc {
  const doc = new Y.Doc()
  const nodes = getCanvasObjectsMap<CanvasNode>(doc)
  const page = createNode(
    'page',
    { x: -120, y: -80, width: 260, height: 160 },
    {
      title: 'Research Page'
    }
  )
  const shape = createNode(
    'shape',
    { x: 260, y: 120, width: 220, height: 140 },
    {
      title: 'Decision Box'
    }
  )

  page.sourceNodeId = 'source-page-1'
  nodes.set(page.id, page)
  nodes.set(shape.id, shape)
  doc.getMap('connectors').set('edge-1', createEdge(page.id, shape.id))

  return doc
}

function getNodeByTitle(doc: Y.Doc, title: string): CanvasNode {
  const node = Array.from(getCanvasObjectsMap<CanvasNode>(doc).values()).find(
    (candidate) => candidate.properties.title === title
  )

  if (!node) {
    throw new Error(`Expected node titled ${title}`)
  }

  return node
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    value: 960
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 640
  })
  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    value: ResizeObserverStub
  })
  Object.defineProperty(window, 'PointerEvent', {
    configurable: true,
    value: PointerEventStub
  })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null)
})

describe('Canvas v3 active renderer', () => {
  it('renders the public Canvas export through the v3 DOM island pool', () => {
    const doc = createCanvasTestDoc()
    const onSelectionChange = vi.fn()

    render(
      <Canvas
        doc={doc}
        onSelectionChange={onSelectionChange}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const surface = screen.getByRole('application', { name: 'Canvas' })
    const pageIsland = screen.getByText('Research Page').closest('[data-canvas-v3-object="true"]')

    expect(surface.getAttribute('data-canvas-renderer-version')).toBe('3')
    expect(surface.getAttribute('data-canvas-object-count')).toBe('2')
    expect(pageIsland?.classList.contains('canvas-node')).toBe(true)
    expect(pageIsland?.getAttribute('data-node-type')).toBe('page')
    expect(pageIsland?.getAttribute('data-canvas-dom-island-tier')).toBeTruthy()
    if (!pageIsland) {
      throw new Error('Expected Research Page DOM island')
    }

    fireEvent.pointerDown(pageIsland, {
      button: 0,
      clientX: 480,
      clientY: 320
    })

    expect(onSelectionChange).toHaveBeenLastCalledWith({
      nodeIds: [expect.any(String)],
      edgeIds: []
    })
  })

  it('annotates the v3 surface with the resolved canvas theme', () => {
    document.documentElement.classList.add('dark')

    try {
      render(<Canvas doc={createCanvasTestDoc()} />)

      const surface = screen.getByRole('application', { name: 'Canvas' })

      expect(surface.getAttribute('data-canvas-theme')).toBe('dark')
    } finally {
      document.documentElement.classList.remove('dark')
    }
  })

  it('renders forgiving hit targets for selectable canvas objects', () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const tinyShape = createNode(
      'shape',
      { x: 0, y: 0, width: 4, height: 4 },
      {
        title: 'Tiny Target'
      }
    )
    const onSelectionChange = vi.fn()

    nodes.set(tinyShape.id, tinyShape)

    render(<Canvas doc={doc} onSelectionChange={onSelectionChange} />)

    const surface = screen.getByRole('application', { name: 'Canvas' })
    const hitTarget = surface.querySelector<HTMLElement>(
      `[data-canvas-v3-hit-target="true"][data-canvas-object-id="${tinyShape.id}"]`
    )

    expect(hitTarget).toBeTruthy()
    expect(hitTarget?.style.width).toBe('36px')
    expect(hitTarget?.style.height).toBe('36px')

    if (!hitTarget) {
      throw new Error('Expected Tiny Target hit target')
    }

    fireEvent.pointerDown(hitTarget, {
      button: 0,
      clientX: 480,
      clientY: 320
    })

    expect(onSelectionChange).toHaveBeenLastCalledWith({
      nodeIds: [tinyShape.id],
      edgeIds: []
    })
  })

  it('opens a right-click context menu for a node when nodeContextActions is provided (0285 PR4)', () => {
    const doc = createCanvasTestDoc()
    const page = getNodeByTitle(doc, 'Research Page')
    const onSelectionChange = vi.fn()
    const run = vi.fn()
    const nodeContextActions = vi.fn(() => [
      { id: 'rename', label: 'Rename', run },
      { id: 'delete', label: 'Delete', danger: true, run: () => {} }
    ])

    render(
      <Canvas
        doc={doc}
        onSelectionChange={onSelectionChange}
        nodeContextActions={nodeContextActions}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const island = screen.getByText('Research Page').closest('[data-canvas-v3-object="true"]')
    if (!island) {
      throw new Error('Expected Research Page DOM island')
    }

    fireEvent.contextMenu(island, { clientX: 480, clientY: 320 })

    // Right-clicking a node outside the selection selects it first, so the
    // supplied verbs act on that node.
    expect(onSelectionChange).toHaveBeenLastCalledWith({ nodeIds: [page.id], edgeIds: [] })
    expect(nodeContextActions).toHaveBeenCalledWith(page.id)

    // The menu renders the descriptor list; invoking an item runs its handler.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('leaves nodes without a context menu when nodeContextActions is absent (opt-in)', () => {
    const doc = createCanvasTestDoc()

    render(
      <Canvas doc={doc} renderNode={(node) => <span>{node.properties.title as string}</span>} />
    )

    const island = screen.getByText('Research Page').closest('[data-canvas-v3-object="true"]')
    if (!island) {
      throw new Error('Expected Research Page DOM island')
    }

    fireEvent.contextMenu(island, { clientX: 480, clientY: 320 })

    // No portalled menu appears — the renderer is untouched by default.
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('routes creation shortcuts through app entry callbacks', () => {
    const doc = createCanvasTestDoc()
    const onCreateObject = vi.fn()

    render(<Canvas doc={doc} onCreateObject={onCreateObject} />)

    const surface = screen.getByRole('application', { name: 'Canvas' })
    fireEvent.keyDown(surface, { key: 'r' })
    fireEvent.keyDown(surface, { key: 'f' })
    fireEvent.keyDown(surface, { key: 'n' })
    fireEvent.keyDown(surface, { key: 'm' })

    expect(onCreateObject).toHaveBeenNthCalledWith(1, 'shape')
    expect(onCreateObject).toHaveBeenNthCalledWith(2, 'frame')
    expect(onCreateObject).toHaveBeenNthCalledWith(3, 'note')
    expect(onCreateObject).toHaveBeenNthCalledWith(4, 'mind-map')
  })

  it('exposes viewport operations without the legacy useCanvas hook', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()

    render(<Canvas ref={ref} doc={doc} />)

    act(() => {
      ref.current?.setViewportSnapshot({ x: 100, y: 200, zoom: 2 })
    })
    expect(ref.current?.getViewportSnapshot()).toEqual({ x: 100, y: 200, zoom: 2 })

    act(() => {
      ref.current?.fitToContent(80)
    })
    expect(ref.current?.getViewportSnapshot().zoom).toBeGreaterThan(0)
  })

  it('creates primitive shapes and frames through the v3 imperative handle', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const onSceneMutation = vi.fn()

    render(<Canvas ref={ref} doc={doc} onSceneMutation={onSceneMutation} />)

    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const initialObjectCount = objects.size

    act(() => {
      expect(ref.current?.createShape('diamond')).toBe(true)
    })

    const diamond = Array.from(objects.values()).find(
      (node) => node.type === 'shape' && node.properties.shapeType === 'diamond'
    )

    expect(diamond?.properties.title).toBe('Diamond')
    expect(diamond?.position.width).toBeGreaterThan(0)

    act(() => {
      expect(ref.current?.createFrame()).toBe(true)
    })

    const frame = Array.from(objects.values()).find(
      (node) => node.type === 'group' && node.properties.containerRole === 'frame'
    )

    expect(objects.size).toBe(initialObjectCount + 2)
    expect(frame?.properties.title).toBe('Frame')
    expect(frame?.properties.frameVariant).toBe('standard')
    expect(frame?.position.width).toBe(640)
    expect(frame?.position.height).toBe(420)
    expect(onSceneMutation).toHaveBeenCalledTimes(2)
  })

  it('creates planning templates through the v3 imperative handle', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const onSceneMutation = vi.fn()

    render(<Canvas ref={ref} doc={doc} onSceneMutation={onSceneMutation} />)

    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const connectors = getCanvasConnectorsMap(doc)
    const initialObjectCount = objects.size
    const initialConnectorCount = connectors.size

    act(() => {
      expect(ref.current?.createPlanningTemplate('incident-review')).toBe(true)
    })

    const incidentFrame = Array.from(objects.values()).find(
      (node) => node.properties.title === 'Incident Review'
    )
    const actionNote = Array.from(objects.values()).find(
      (node) => node.properties.title === 'Corrective actions'
    )

    expect(objects.size).toBe(initialObjectCount + 6)
    expect(connectors.size).toBe(initialConnectorCount + 3)
    expect(incidentFrame).toMatchObject({
      type: 'group',
      properties: {
        frameVariant: 'swimlane',
        memberCount: 5
      }
    })
    expect(actionNote).toMatchObject({
      type: 'note',
      properties: {
        stickyNoteRole: 'sticky-note',
        stickyNoteColor: 'green'
      }
    })
    expect(onSceneMutation).toHaveBeenCalledOnce()
  })

  it('applies v3 selection handle operations to the flat canvas document', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const onSceneMutation = vi.fn()

    render(<Canvas ref={ref} doc={doc} onSceneMutation={onSceneMutation} />)

    const page = getNodeByTitle(doc, 'Research Page')
    const shape = getNodeByTitle(doc, 'Decision Box')

    act(() => {
      ref.current?.selectNodes([page.id])
    })
    act(() => {
      expect(ref.current?.toggleSelectionLock()).toBe(true)
    })
    expect(getCanvasObjectsMap<CanvasNode>(doc).get(page.id)?.locked).toBe(true)

    act(() => {
      expect(ref.current?.toggleSelectionLock()).toBe(true)
    })
    expect(getCanvasObjectsMap<CanvasNode>(doc).get(page.id)?.locked).toBe(false)

    act(() => {
      ref.current?.selectNodes([page.id, shape.id])
    })
    act(() => {
      expect(ref.current?.alignSelection('left')).toBe(true)
    })
    expect(getCanvasObjectsMap<CanvasNode>(doc).get(shape.id)?.position.x).toBe(
      getCanvasObjectsMap<CanvasNode>(doc).get(page.id)?.position.x
    )

    act(() => {
      expect(ref.current?.shiftSelectionLayer('forward')).toBe(true)
    })
    expect(getCanvasObjectsMap<CanvasNode>(doc).get(page.id)?.position.zIndex).toBe(1)
    expect(getCanvasObjectsMap<CanvasNode>(doc).get(shape.id)?.position.zIndex).toBe(1)
    expect(onSceneMutation).toHaveBeenCalled()
  })

  it('connects and wraps v3 selections through the imperative handle', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()

    render(<Canvas ref={ref} doc={doc} />)

    const page = getNodeByTitle(doc, 'Research Page')
    const shape = getNodeByTitle(doc, 'Decision Box')
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const connectors = getCanvasConnectorsMap(doc)
    const initialConnectorCount = connectors.size
    const initialObjectCount = objects.size

    act(() => {
      ref.current?.selectNodes([page.id, shape.id])
    })
    act(() => {
      expect(ref.current?.connectSelection()).toBe(true)
    })
    expect(connectors.size).toBe(initialConnectorCount + 1)

    act(() => {
      expect(ref.current?.groupSelection()).toBe(true)
    })

    const group = Array.from(objects.values()).find(
      (node) =>
        node.type === 'group' &&
        node.properties.containerRole === 'group' &&
        Array.isArray(node.properties.memberIds) &&
        node.properties.memberIds.includes(page.id) &&
        node.properties.memberIds.includes(shape.id)
    )

    act(() => {
      ref.current?.selectNodes([page.id, shape.id])
    })
    act(() => {
      expect(ref.current?.wrapSelectionInFrame()).toBe(true)
    })

    const frame = Array.from(objects.values()).find(
      (node) =>
        node.type === 'group' &&
        node.properties.containerRole === 'frame' &&
        Array.isArray(node.properties.memberIds) &&
        node.properties.memberIds.includes(page.id) &&
        node.properties.memberIds.includes(shape.id)
    )

    expect(objects.size).toBe(initialObjectCount + 2)
    expect(group).toBeTruthy()
    expect(frame).toBeTruthy()
  })

  it('clusters, stacks, and converts v3 selections through command handlers', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()

    render(<Canvas ref={ref} doc={doc} />)

    const page = getNodeByTitle(doc, 'Research Page')
    const shape = getNodeByTitle(doc, 'Decision Box')
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const connectors = getCanvasConnectorsMap(doc)
    const initialConnectorCount = connectors.size

    act(() => {
      ref.current?.selectNodes([page.id, shape.id])
    })
    act(() => {
      expect(ref.current?.clusterSelection()).toBe(true)
    })

    expect(objects.get(page.id)?.position.x).not.toBe(page.position.x)
    expect(objects.get(shape.id)?.position.y).not.toBe(shape.position.y)

    act(() => {
      expect(ref.current?.stackSelection()).toBe(true)
    })

    const stackedPage = objects.get(page.id)
    const stackedShape = objects.get(shape.id)
    expect(stackedPage?.position.zIndex).toBe(0)
    expect(stackedShape?.position.zIndex).toBe(1)

    act(() => {
      expect(ref.current?.convertSelectionToMindMap()).toBe(true)
    })

    const mindMapNodes = Array.from(objects.values()).filter((node) =>
      Boolean(getCanvasMindMapMetadata(node))
    )
    const root = mindMapNodes.find((node) => getCanvasMindMapMetadata(node)?.role === 'root')
    const branches = mindMapNodes.filter(
      (node) => getCanvasMindMapMetadata(node)?.role === 'branch'
    )

    expect(root).toBeTruthy()
    expect(branches.map((node) => node.id).sort()).toEqual([page.id, shape.id].sort())
    expect(branches.every((node) => node.type === 'shape')).toBe(true)
    expect(connectors.size).toBe(initialConnectorCount + 2)
  })

  it('renders a contextual v3 selection toolbar and routes toolbar actions', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const onOpenSelection = vi.fn()
    const onCreateSelectionComment = vi.fn()

    render(
      <Canvas
        ref={ref}
        doc={doc}
        onOpenSelection={onOpenSelection}
        onCreateSelectionComment={onCreateSelectionComment}
      />
    )

    const page = getNodeByTitle(doc, 'Research Page')
    const shape = getNodeByTitle(doc, 'Decision Box')
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const connectors = getCanvasConnectorsMap(doc)
    const initialConnectorCount = connectors.size

    act(() => {
      ref.current?.selectNodes([page.id])
    })

    const singleToolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    expect(within(singleToolbar).getByText('Research Page')).toBeTruthy()

    fireEvent.click(within(singleToolbar).getByRole('button', { name: 'Open selection' }))
    fireEvent.click(within(singleToolbar).getByRole('button', { name: 'Comment on selection' }))
    fireEvent.click(within(singleToolbar).getByRole('button', { name: 'Lock selection' }))

    expect(onOpenSelection).toHaveBeenCalledWith('peek')
    expect(onCreateSelectionComment).toHaveBeenCalledOnce()
    expect(objects.get(page.id)?.locked).toBe(true)

    fireEvent.click(within(singleToolbar).getByRole('button', { name: 'Unlock selection' }))
    expect(objects.get(page.id)?.locked).toBe(false)

    act(() => {
      ref.current?.selectNodes([page.id, shape.id])
    })

    const multiToolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    expect(within(multiToolbar).getByText('2 selected')).toBeTruthy()

    fireEvent.click(within(multiToolbar).getByRole('button', { name: 'Connect selection' }))
    expect(connectors.size).toBe(initialConnectorCount + 1)

    fireEvent.click(within(multiToolbar).getByRole('button', { name: 'Group selection' }))
    expect(
      Array.from(objects.values()).some(
        (node) =>
          node.type === 'group' &&
          node.properties.containerRole === 'group' &&
          Array.isArray(node.properties.memberIds) &&
          node.properties.memberIds.includes(page.id) &&
          node.properties.memberIds.includes(shape.id)
      )
    ).toBe(true)

    act(() => {
      ref.current?.selectNodes([page.id, shape.id])
    })

    const regroupedToolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    fireEvent.click(
      within(regroupedToolbar).getByRole('button', { name: 'Wrap selection in frame' })
    )
    expect(
      Array.from(objects.values()).some(
        (node) =>
          node.type === 'group' &&
          node.properties.containerRole === 'frame' &&
          Array.isArray(node.properties.memberIds) &&
          node.properties.memberIds.includes(page.id) &&
          node.properties.memberIds.includes(shape.id)
      )
    ).toBe(true)
  })

  it('edits shape variants and styles from the contextual toolbar', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const objects = getCanvasObjectsMap<CanvasNode>(doc)

    render(<Canvas ref={ref} doc={doc} />)

    const shape = getNodeByTitle(doc, 'Decision Box')

    act(() => {
      ref.current?.selectNodes([shape.id])
    })

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Edit shape style' }))

    let shapePopover = screen.getByRole('dialog', { name: 'Shape style' })
    fireEvent.click(within(shapePopover).getByRole('button', { name: 'Emerald shape style' }))

    shapePopover = screen.getByRole('dialog', { name: 'Shape style' })
    fireEvent.click(within(shapePopover).getByRole('button', { name: 'Diamond shape' }))

    shapePopover = screen.getByRole('dialog', { name: 'Shape style' })
    fireEvent.click(within(shapePopover).getByRole('button', { name: 'Stroke width 4' }))
    fireEvent.change(within(shapePopover).getByLabelText('Shape label'), {
      target: { value: 'Approved' }
    })

    shapePopover = screen.getByRole('dialog', { name: 'Shape style' })
    fireEvent.click(within(shapePopover).getByRole('button', { name: 'Text #ffffff' }))

    expect(objects.get(shape.id)?.properties).toMatchObject({
      fill: '#dcfce7',
      stroke: '#16a34a',
      strokeWidth: 4,
      shapeType: 'diamond',
      label: 'Approved',
      title: 'Approved',
      labelColor: '#ffffff'
    })
  })

  it('edits sticky notes and records promotion targets from the toolbar', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const sticky = createCanvasStickyNoteNode({
      viewport: { x: 0, y: 0, zoom: 1 },
      title: 'Customer quote',
      body: 'Keep the rough idea visible.'
    })

    objects.set(sticky.id, sticky)
    render(<Canvas ref={ref} doc={doc} />)

    act(() => {
      ref.current?.selectNodes([sticky.id])
    })

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Edit sticky note' }))

    let stickyPopover = screen.getByRole('dialog', { name: 'Sticky note' })
    fireEvent.click(within(stickyPopover).getByRole('button', { name: 'Blue sticky color' }))
    fireEvent.change(within(stickyPopover).getByLabelText('Sticky note title'), {
      target: { value: 'Follow-up task' }
    })
    fireEvent.change(within(stickyPopover).getByLabelText('Sticky note body'), {
      target: { value: 'Assign this in planning.' }
    })

    stickyPopover = screen.getByRole('dialog', { name: 'Sticky note' })
    fireEvent.click(
      within(stickyPopover).getByRole('button', { name: 'Promote sticky note to Task' })
    )

    expect(objects.get(sticky.id)).toMatchObject({
      type: 'note',
      sourceSchemaId: expect.stringContaining('Task'),
      properties: {
        title: 'Follow-up task',
        body: 'Assign this in planning.',
        stickyNoteColor: 'blue',
        stickyNotePromoted: true,
        stickyNotePromotionTarget: 'task',
        sourceDisplayKind: 'task',
        status: 'todo',
        priority: 'medium'
      }
    })
  })

  it('edits frame variants from the contextual toolbar', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const frame = createCanvasFrameVariantNode({
      variant: 'standard',
      viewport: { x: 0, y: 0, zoom: 1 },
      title: 'Planning board'
    })

    objects.set(frame.id, frame)
    render(<Canvas ref={ref} doc={doc} />)

    act(() => {
      ref.current?.selectNodes([frame.id])
    })

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Edit frame variant' }))

    const framePopover = screen.getByRole('dialog', { name: 'Frame variants' })
    fireEvent.click(within(framePopover).getByRole('button', { name: 'Kanban frame' }))

    expect(objects.get(frame.id)?.properties).toMatchObject({
      title: 'Planning board',
      containerRole: 'frame',
      frameVariant: 'kanban',
      frameIntent: 'kanban',
      laneAxis: 'vertical',
      lanes: ['Backlog', 'In progress', 'Done']
    })
    expect(
      screen
        .getByRole('application', { name: 'Canvas' })
        .querySelector('[data-canvas-frame-variant="kanban"]')
    ).toBeTruthy()
  })

  it('edits media fit, PDF page, source, and plugin popovers from the toolbar', () => {
    const doc = new Y.Doc()
    const ref = React.createRef<CanvasHandle>()
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const media = createNode(
      'media',
      { x: 0, y: 0, width: 320, height: 180 },
      {
        title: 'Reference Image',
        kind: 'image',
        mimeType: 'image/png',
        pluginId: 'com.xnet.media-fixture',
        pluginContributionId: 'media.image-card',
        pluginFields: ['assetId', 'license']
      }
    )
    const pdf = createNode(
      'media',
      { x: 360, y: 0, width: 280, height: 360 },
      {
        title: 'Spec PDF',
        kind: 'pdf',
        mimeType: 'application/pdf',
        pageNumber: 2,
        pageCount: 4
      }
    )

    media.sourceNodeId = 'source-media-1'
    media.sourceSchemaId = 'xnet://schema/MediaAsset'
    pdf.sourceNodeId = 'source-pdf-1'
    pdf.sourceSchemaId = 'xnet://schema/PdfAsset'
    objects.set(media.id, media)
    objects.set(pdf.id, pdf)

    render(<Canvas ref={ref} doc={doc} />)

    act(() => {
      ref.current?.selectNodes([media.id])
    })

    const mediaToolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    fireEvent.click(within(mediaToolbar).getByRole('button', { name: 'Edit media crop and fit' }))

    const mediaPopover = screen.getByRole('dialog', { name: 'Media crop and fit' })
    fireEvent.click(within(mediaPopover).getByRole('button', { name: 'Fill media' }))
    fireEvent.change(within(mediaPopover).getByLabelText('Alt text'), {
      target: { value: 'Architecture diagram thumbnail' }
    })
    fireEvent.change(within(mediaPopover).getByLabelText('Caption'), {
      target: { value: 'Use this image in the launch plan.' }
    })

    expect(objects.get(media.id)?.properties).toMatchObject({
      objectFit: 'cover',
      alt: 'Architecture diagram thumbnail',
      caption: 'Use this image in the launch plan.'
    })

    fireEvent.click(within(mediaToolbar).getByRole('button', { name: 'Open source reference' }))
    expect(screen.getByRole('dialog', { name: 'Source reference' }).textContent).toContain(
      'source-media-1'
    )

    fireEvent.click(within(mediaToolbar).getByRole('button', { name: 'Open plugin fields' }))
    expect(screen.getByRole('dialog', { name: 'Plugin fields' }).textContent).toContain('assetId')

    act(() => {
      ref.current?.selectNodes([pdf.id])
    })

    const pdfToolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    fireEvent.click(within(pdfToolbar).getByRole('button', { name: 'Edit PDF page' }))

    const pdfPopover = screen.getByRole('dialog', { name: 'PDF page controls' })
    fireEvent.click(within(pdfPopover).getByRole('button', { name: 'Next PDF page' }))
    fireEvent.change(within(pdfPopover).getByLabelText('PDF page number'), {
      target: { value: '4' }
    })

    expect(objects.get(pdf.id)?.properties).toMatchObject({
      pageNumber: 4,
      pageAnchorId: `${pdf.id}:page:4`
    })
  })

  it('edits semantic edge type and bulk source references from the toolbar', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const connectors = getCanvasConnectorsMap<CanvasEdge>(doc)
    const page = getNodeByTitle(doc, 'Research Page')
    const shape = getNodeByTitle(doc, 'Decision Box')
    const sourceBackedShape = {
      ...shape,
      sourceNodeId: 'source-shape-1',
      sourceSchemaId: 'xnet://schema/Decision'
    }

    objects.set(shape.id, sourceBackedShape)
    render(<Canvas ref={ref} doc={doc} />)

    act(() => {
      ref.current?.selectNodes([page.id, shape.id])
    })

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Open source references' }))

    const sourcesPopover = screen.getByRole('dialog', { name: 'Source references' })
    expect(sourcesPopover.textContent).toContain('source-page-1')
    expect(sourcesPopover.textContent).toContain('source-shape-1')

    fireEvent.click(within(toolbar).getByRole('button', { name: 'Edit edge type' }))

    const edgePopover = screen.getByRole('dialog', { name: 'Edge type' })
    fireEvent.click(within(edgePopover).getByRole('button', { name: 'References edge' }))

    expect(connectors.get('edge-1')?.relationship).toEqual({
      kind: 'references',
      direction: 'directed',
      sourceRole: 'page',
      targetRole: 'shape',
      properties: {
        sourceRole: 'page',
        targetRole: 'shape',
        sourceNodeId: 'source-page-1',
        targetNodeId: 'source-shape-1',
        targetSchemaId: 'xnet://schema/Decision'
      }
    })
    expect(connectors.size).toBe(1)
  })

  it('collapses mind map branches from the selection toolbar', () => {
    const doc = new Y.Doc()
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const ref = React.createRef<CanvasHandle>()
    const rootProperties = {
      ...createCanvasMindMapRootProperties({
        title: 'Roadmap',
        mapId: 'mindmap-roadmap'
      }),
      fill: '#fef3c7',
      stroke: '#d97706'
    }
    const root = {
      ...createNode('shape', { x: 0, y: 0, width: 280, height: 120 }, rootProperties),
      id: 'mindmap-root'
    }
    const branch = {
      ...createNode(
        'shape',
        { x: 320, y: 0, width: 220, height: 88 },
        createCanvasMindMapBranchProperties({
          title: 'Launch',
          mapId: rootProperties.mindMap.mapId,
          parentId: root.id,
          depth: 1,
          index: 0
        })
      ),
      id: 'mindmap-branch'
    }
    const leaf = {
      ...createNode(
        'shape',
        { x: 620, y: 0, width: 220, height: 88 },
        createCanvasMindMapBranchProperties({
          title: 'Checklist',
          mapId: rootProperties.mindMap.mapId,
          parentId: branch.id,
          depth: 2,
          index: 0
        })
      ),
      id: 'mindmap-leaf'
    }

    objects.set(root.id, root)
    objects.set(branch.id, branch)
    objects.set(leaf.id, leaf)

    render(
      <Canvas
        ref={ref}
        doc={doc}
        renderNode={(node) => (
          <span data-testid={`node-${node.id}`} data-fill={String(node.properties.fill ?? '')}>
            {node.properties.title as string}
          </span>
        )}
      />
    )

    expect(screen.getByText('Checklist')).toBeTruthy()
    expect(screen.getByTestId(`node-${branch.id}`).getAttribute('data-fill')).toBe('#fef3c7')

    act(() => {
      ref.current?.selectNodes([branch.id])
    })

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Collapse mind map branch' }))

    expect(
      (objects.get(branch.id)?.properties.mindMap as { collapsed?: boolean } | undefined)?.collapsed
    ).toBe(true)
    expect(screen.queryByText('Checklist')).toBeNull()
    expect(
      screen
        .getByTestId(`node-${branch.id}`)
        .closest('[data-canvas-v3-object="true"]')
        ?.getAttribute('data-canvas-mind-map-collapsed')
    ).toBe('true')

    const collapsedToolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    fireEvent.click(
      within(collapsedToolbar).getByRole('button', { name: 'Expand mind map branch' })
    )

    expect(
      (objects.get(branch.id)?.properties.mindMap as { collapsed?: boolean } | undefined)?.collapsed
    ).toBe(false)
    expect(screen.getByText('Checklist')).toBeTruthy()
  })

  it('renders v3 connector handles, multi-select bounds, and connects handle endpoints', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const onSceneMutation = vi.fn()

    render(<Canvas ref={ref} doc={doc} onSceneMutation={onSceneMutation} />)

    const page = getNodeByTitle(doc, 'Research Page')
    const shape = getNodeByTitle(doc, 'Decision Box')
    const connectors = getCanvasConnectorsMap(doc)
    const initialConnectorIds = new Set(
      Array.from(connectors.values()).map((connector) => connector.id)
    )

    act(() => {
      ref.current?.selectNodes([page.id, shape.id])
    })

    const surface = screen.getByRole('application', { name: 'Canvas' })
    expect(surface.querySelector('[data-canvas-v3-selection-bounds="true"]')).toBeTruthy()
    expect(surface.querySelectorAll('[data-canvas-v3-connector-handle]')).toHaveLength(8)

    const pageIsland = screen.getByText('Research Page').closest('[data-canvas-v3-object="true"]')
    const shapeIsland = screen.getByText('Decision Box').closest('[data-canvas-v3-object="true"]')

    if (!pageIsland || !shapeIsland) {
      throw new Error('Expected page and shape DOM islands')
    }

    fireEvent.click(
      within(pageIsland as HTMLElement).getByRole('button', {
        name: 'Start connector from Research Page right'
      })
    )

    expect(
      within(pageIsland as HTMLElement)
        .getByRole('button', {
          name: 'Connector start from Research Page right'
        })
        .getAttribute('data-canvas-connector-active')
    ).toBe('true')
    expect(
      within(shapeIsland as HTMLElement).getByRole('button', {
        name: 'Finish connector at Decision Box left'
      })
    ).toBeTruthy()

    fireEvent.click(
      within(shapeIsland as HTMLElement).getByRole('button', {
        name: 'Finish connector at Decision Box left'
      })
    )

    const createdConnector = Array.from(connectors.values()).find(
      (connector) => !initialConnectorIds.has(connector.id)
    )

    expect(createdConnector?.source?.objectId).toBe(page.id)
    expect(createdConnector?.source?.placement).toBe('right')
    expect(createdConnector?.target?.objectId).toBe(shape.id)
    expect(createdConnector?.target?.placement).toBe('left')
    expect(createdConnector?.relationship).toEqual({
      kind: 'relates-to',
      direction: 'undirected',
      sourceRole: 'page',
      targetRole: 'shape',
      properties: {
        sourceRole: 'page',
        targetRole: 'shape',
        sourceNodeId: 'source-page-1'
      }
    })
    expect(onSceneMutation).toHaveBeenCalledOnce()
  })

  it('renders v3 edge labels and semantic edge styles', () => {
    const doc = createCanvasTestDoc()
    const connectors = getCanvasConnectorsMap<CanvasEdge>(doc)
    const edge = connectors.get('edge-1')

    if (!edge) {
      throw new Error('Expected edge-1')
    }

    connectors.set('edge-1', {
      ...edge,
      relationship: createCanvasEdgeRelationship({
        kind: 'depends-on',
        label: 'Needs'
      })
    })

    render(<Canvas doc={doc} />)

    const surface = screen.getByRole('application', { name: 'Canvas' })
    const edgeGroup = surface.querySelector(`[data-canvas-v3-edge-id="${edge.id}"]`)
    const line = edgeGroup?.querySelector('line')
    const label = edgeGroup?.querySelector('[data-canvas-v3-edge-label="true"]')

    expect(line?.getAttribute('stroke')).toBe('#dc2626')
    expect(line?.getAttribute('marker-end')).toBe(`url(#canvas-v3-edge-arrow-${edge.id})`)
    expect(label?.textContent).toBe('Needs')
    expect(edgeGroup?.getAttribute('aria-label')).toBe('Connector label Needs')
  })

  it('selects v3 edges from their hit targets and deletes them from the keyboard', () => {
    const doc = createCanvasTestDoc()
    const onSelectionChange = vi.fn()
    const edge = getCanvasConnectorsMap<CanvasEdge>(doc).get('edge-1')
    if (!edge) {
      throw new Error('Expected edge-1')
    }

    render(<Canvas doc={doc} onSelectionChange={onSelectionChange} />)

    const surface = screen.getByRole('application', { name: 'Canvas' })
    const hitTarget = surface.querySelector(
      `[data-canvas-v3-edge-hit-target="true"][data-canvas-edge-id="${edge.id}"]`
    )
    if (!hitTarget) {
      throw new Error('Expected edge hit target for edge-1')
    }

    fireEvent.pointerDown(hitTarget, { button: 0 })

    const edgeGroup = surface.querySelector(`[data-canvas-v3-edge-id="${edge.id}"]`)
    expect(edgeGroup?.getAttribute('data-canvas-edge-selected')).toBe('true')
    expect(edgeGroup?.querySelector('[data-canvas-v3-edge-selection-halo="true"]')).toBeTruthy()
    expect(onSelectionChange).toHaveBeenLastCalledWith({ nodeIds: [], edgeIds: [edge.id] })

    fireEvent.keyDown(surface, { key: 'Delete' })

    expect(getCanvasConnectorsMap(doc).has('edge-1')).toBe(false)
    expect(onSelectionChange).toHaveBeenLastCalledWith({ nodeIds: [], edgeIds: [] })
  })

  it('edits edge labels, relationship kind, and direction from the v3 edge toolbar', () => {
    const doc = createCanvasTestDoc()
    const page = getNodeByTitle(doc, 'Research Page')
    const shape = getNodeByTitle(doc, 'Decision Box')
    const edge = getCanvasConnectorsMap<CanvasEdge>(doc).get('edge-1')
    if (!edge) {
      throw new Error('Expected edge-1')
    }

    render(<Canvas doc={doc} />)

    const surface = screen.getByRole('application', { name: 'Canvas' })
    const hitTarget = surface.querySelector(
      `[data-canvas-v3-edge-hit-target="true"][data-canvas-edge-id="${edge.id}"]`
    )
    if (!hitTarget) {
      throw new Error('Expected edge hit target for edge-1')
    }

    fireEvent.pointerDown(hitTarget, { button: 0 })

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas connector actions' })
    const labelInput = within(toolbar).getByRole('textbox', { name: 'Connector label' })

    fireEvent.change(labelInput, { target: { value: 'Blocks deploy' } })
    fireEvent.keyDown(labelInput, { key: 'Enter' })

    expect(getCanvasConnectorsMap<CanvasEdge>(doc).get('edge-1')?.label).toBe('Blocks deploy')

    fireEvent.change(within(toolbar).getByRole('combobox', { name: 'Connector type' }), {
      target: { value: 'depends-on' }
    })

    const retyped = getCanvasConnectorsMap<CanvasEdge>(doc).get('edge-1')
    expect(retyped?.relationship?.kind).toBe('depends-on')
    expect(retyped?.relationship?.direction).toBe('directed')

    fireEvent.click(within(toolbar).getByRole('button', { name: 'Reverse connector direction' }))

    const reversed = getCanvasConnectorsMap<CanvasEdge>(doc).get('edge-1')
    expect(reversed?.sourceId).toBe(shape.id)
    expect(reversed?.targetId).toBe(page.id)

    fireEvent.change(labelInput, { target: { value: 'Discarded label' } })
    fireEvent.keyDown(labelInput, { key: 'Escape' })
    fireEvent.blur(labelInput)

    expect(getCanvasConnectorsMap<CanvasEdge>(doc).get('edge-1')?.label).toBe('Blocks deploy')

    fireEvent.click(within(toolbar).getByRole('button', { name: 'Delete connector' }))

    expect(getCanvasConnectorsMap(doc).has('edge-1')).toBe(false)
    expect(screen.queryByRole('toolbar', { name: 'Canvas connector actions' })).toBeNull()
  })

  it('creates v3 edges by dragging from a connector handle onto another object', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const onSelectionChange = vi.fn()

    render(<Canvas ref={ref} doc={doc} onSelectionChange={onSelectionChange} />)

    const page = getNodeByTitle(doc, 'Research Page')
    const shape = getNodeByTitle(doc, 'Decision Box')
    const connectors = getCanvasConnectorsMap(doc)
    const initialConnectorIds = new Set(Array.from(connectors.keys()))

    act(() => {
      ref.current?.selectNodes([page.id])
    })

    const surface = screen.getByRole('application', { name: 'Canvas' })
    const handle = screen.getByRole('button', {
      name: 'Start connector from Research Page right'
    })

    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 620, clientY: 320 })
    fireEvent.pointerMove(surface, { pointerId: 7, clientX: 700, clientY: 420 })
    fireEvent.pointerMove(surface, { pointerId: 7, clientX: 750, clientY: 470 })

    expect(surface.querySelector('[data-canvas-v3-connector-preview="true"]')).toBeTruthy()

    const shapeIsland = screen
      .getByText('Decision Box')
      .closest('[data-canvas-v3-object="true"]') as HTMLElement | null
    expect(shapeIsland?.getAttribute('data-canvas-connector-drop-target')).toBe('true')

    fireEvent.pointerUp(surface, { pointerId: 7, clientX: 750, clientY: 470 })

    const createdEntry = Array.from(connectors.entries()).find(
      ([edgeId]) => !initialConnectorIds.has(edgeId)
    )
    if (!createdEntry) {
      throw new Error('Expected a connector created by drag')
    }

    const [createdId, created] = createdEntry as [string, CanvasEdge]
    expect(created.sourceId).toBe(page.id)
    expect(created.targetId).toBe(shape.id)
    expect(created.source?.placement).toBe('right')
    expect(created.target?.placement).toBe('left')
    expect(surface.querySelector('[data-canvas-v3-connector-preview="true"]')).toBeNull()
    expect(onSelectionChange).toHaveBeenLastCalledWith({ nodeIds: [], edgeIds: [createdId] })
  })

  it('pans and zooms the v3 viewport from wheel input', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()

    render(<Canvas ref={ref} doc={doc} />)

    const surface = screen.getByRole('application', { name: 'Canvas' })
    const initial = ref.current?.getViewportSnapshot()
    if (!initial) {
      throw new Error('Expected viewport snapshot')
    }

    fireEvent.wheel(surface, { deltaX: 40, deltaY: 80 })

    const panned = ref.current?.getViewportSnapshot()
    expect(panned?.x).toBeCloseTo(initial.x + 40)
    expect(panned?.y).toBeCloseTo(initial.y + 80)

    fireEvent.wheel(surface, { deltaY: -10, ctrlKey: true, clientX: 480, clientY: 320 })

    const zoomedIn = ref.current?.getViewportSnapshot()
    expect(zoomedIn?.zoom ?? 0).toBeGreaterThan(panned?.zoom ?? 1)

    fireEvent.wheel(surface, { deltaY: 10, metaKey: true, clientX: 480, clientY: 320 })

    const zoomedOut = ref.current?.getViewportSnapshot()
    expect(zoomedOut?.zoom ?? 0).toBeLessThan(zoomedIn?.zoom ?? 0)
  })

  it('shows v3 connector handles while hovering an unselected object', () => {
    const doc = createCanvasTestDoc()

    render(<Canvas doc={doc} />)

    const shapeIsland = screen
      .getByText('Decision Box')
      .closest('[data-canvas-v3-object="true"]') as HTMLElement | null
    if (!shapeIsland) {
      throw new Error('Expected shape DOM island')
    }

    expect(shapeIsland.querySelectorAll('[data-canvas-v3-connector-handle]')).toHaveLength(0)

    fireEvent.pointerOver(shapeIsland)
    expect(shapeIsland.querySelectorAll('[data-canvas-v3-connector-handle]')).toHaveLength(4)

    fireEvent.pointerOut(shapeIsland)
    expect(shapeIsland.querySelectorAll('[data-canvas-v3-connector-handle]')).toHaveLength(0)
  })

  it('edits canvas-native node text inline from a double-click', () => {
    const doc = createCanvasTestDoc()
    const onNodeDoubleClick = vi.fn()
    const onSceneMutation = vi.fn()
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const seededShape = getNodeByTitle(doc, 'Decision Box')
    objects.set(seededShape.id, {
      ...seededShape,
      properties: { ...seededShape.properties, label: 'Decision Box' }
    })

    render(
      <Canvas doc={doc} onNodeDoubleClick={onNodeDoubleClick} onSceneMutation={onSceneMutation} />
    )

    const shape = getNodeByTitle(doc, 'Decision Box')
    const shapeIsland = screen
      .getByText('Decision Box')
      .closest('[data-canvas-v3-object="true"]') as HTMLElement | null
    if (!shapeIsland) {
      throw new Error('Expected shape DOM island')
    }

    fireEvent.doubleClick(shapeIsland)

    expect(onNodeDoubleClick).not.toHaveBeenCalled()

    const editor = screen.getByLabelText('Edit Decision Box text') as HTMLTextAreaElement
    expect(editor.value).toBe('Decision Box')

    fireEvent.change(editor, { target: { value: 'Approved Box' } })
    fireEvent.keyDown(editor, { key: 'Enter' })

    const updated = getCanvasObjectsMap<CanvasNode>(doc).get(shape.id)
    expect(updated?.properties.title).toBe('Approved Box')
    expect(updated?.properties.label).toBe('Approved Box')
    expect(screen.queryByLabelText('Edit Decision Box text')).toBeNull()
    expect(onSceneMutation).toHaveBeenCalled()
  })

  it('cancels inline editing with Escape and keeps double-click navigation for source-backed objects', () => {
    const doc = createCanvasTestDoc()
    const onNodeDoubleClick = vi.fn()

    render(<Canvas doc={doc} onNodeDoubleClick={onNodeDoubleClick} />)

    const page = getNodeByTitle(doc, 'Research Page')
    const pageIsland = screen
      .getByText('Research Page')
      .closest('[data-canvas-v3-object="true"]') as HTMLElement | null
    if (!pageIsland) {
      throw new Error('Expected page DOM island')
    }

    fireEvent.doubleClick(pageIsland)
    expect(onNodeDoubleClick).toHaveBeenCalledWith(page.id)
    expect(document.querySelector('[data-canvas-v3-inline-editor="true"]')).toBeNull()

    const shape = getNodeByTitle(doc, 'Decision Box')
    const shapeIsland = screen
      .getByText('Decision Box')
      .closest('[data-canvas-v3-object="true"]') as HTMLElement | null
    if (!shapeIsland) {
      throw new Error('Expected shape DOM island')
    }

    fireEvent.doubleClick(shapeIsland)

    const editor = screen.getByLabelText('Edit Decision Box text') as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: 'Discarded text' } })
    fireEvent.keyDown(editor, { key: 'Escape' })

    expect(screen.queryByLabelText('Edit Decision Box text')).toBeNull()
    expect(getCanvasObjectsMap<CanvasNode>(doc).get(shape.id)?.properties.title).toBe(
      'Decision Box'
    )
  })

  it('renames objects inline from the F2 shortcut and the selection toolbar', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()

    render(<Canvas ref={ref} doc={doc} />)

    const page = getNodeByTitle(doc, 'Research Page')

    act(() => {
      ref.current?.selectNodes([page.id])
    })

    const surface = screen.getByRole('application', { name: 'Canvas' })
    fireEvent.keyDown(surface, { key: 'F2' })

    const aliasEditor = screen.getByLabelText('Rename Research Page') as HTMLTextAreaElement
    expect(aliasEditor.value).toBe('')

    fireEvent.change(aliasEditor, { target: { value: 'Launch Notes' } })
    fireEvent.keyDown(aliasEditor, { key: 'Enter' })

    expect(getCanvasObjectsMap<CanvasNode>(doc).get(page.id)?.alias).toBe('Launch Notes')

    const shape = getNodeByTitle(doc, 'Decision Box')

    act(() => {
      ref.current?.selectNodes([shape.id])
    })

    fireEvent.click(screen.getByRole('button', { name: 'Rename selection on the canvas (F2)' }))

    const titleEditor = screen.getByLabelText('Edit Decision Box text') as HTMLTextAreaElement
    fireEvent.change(titleEditor, { target: { value: 'Decision Gate' } })
    fireEvent.keyDown(titleEditor, { key: 'Enter' })

    expect(getCanvasObjectsMap<CanvasNode>(doc).get(shape.id)?.properties.title).toBe(
      'Decision Gate'
    )
  })

  it('derives v3 selection toolbar actions from selection capabilities', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const onOpenSelection = vi.fn()
    const onEditSelectionAlias = vi.fn()
    const onCreateSelectionComment = vi.fn()
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const extraNote = createNode(
      'note',
      { x: 540, y: 220, width: 200, height: 120 },
      {
        title: 'Extra Note'
      }
    )

    objects.set(extraNote.id, extraNote)

    render(
      <Canvas
        ref={ref}
        doc={doc}
        onOpenSelection={onOpenSelection}
        onEditSelectionAlias={onEditSelectionAlias}
        onCreateSelectionComment={onCreateSelectionComment}
      />
    )

    const page = getNodeByTitle(doc, 'Research Page')
    const shape = getNodeByTitle(doc, 'Decision Box')

    act(() => {
      ref.current?.selectNodes([page.id])
    })

    const singleToolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    expect(within(singleToolbar).getByRole('button', { name: 'Open selection' })).toBeTruthy()
    expect(within(singleToolbar).getByRole('button', { name: 'Edit selection alias' })).toBeTruthy()
    expect(within(singleToolbar).getByRole('button', { name: 'Comment on selection' })).toBeTruthy()
    fireEvent.click(
      within(singleToolbar).getByRole('button', { name: 'Edit selection dimensions' })
    )
    const dimensionsPopover = screen.getByRole('dialog', { name: 'Selection dimensions' })
    fireEvent.change(within(dimensionsPopover).getByLabelText('Width'), {
      target: { value: '320' }
    })
    expect(objects.get(page.id)?.position.width).toBe(320)
    expect(within(singleToolbar).queryByRole('button', { name: 'Connect selection' })).toBeNull()
    expect(within(singleToolbar).queryByRole('button', { name: 'Align selection left' })).toBeNull()
    expect(within(singleToolbar).queryByRole('button', { name: 'Group selection' })).toBeNull()
    expect(
      within(singleToolbar).queryByRole('button', {
        name: 'Distribute selection horizontally'
      })
    ).toBeNull()
    expect(within(singleToolbar).queryByRole('button', { name: 'Tidy selection' })).toBeNull()

    act(() => {
      ref.current?.selectNodes([page.id, shape.id])
    })

    const pairToolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    expect(
      (
        within(pairToolbar).getByRole('button', {
          name: 'Connect selection'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
    expect(
      (
        within(pairToolbar).getByRole('button', {
          name: 'Align selection left'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
    expect(
      (
        within(pairToolbar).getByRole('button', {
          name: 'Tidy selection'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
    expect(
      (
        within(pairToolbar).getByRole('button', {
          name: 'Group selection'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
    expect(
      within(pairToolbar).queryByRole('button', {
        name: 'Distribute selection horizontally'
      })
    ).toBeNull()

    act(() => {
      ref.current?.selectNodes([page.id, shape.id, extraNote.id])
    })

    const threeItemToolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    expect(
      (
        within(threeItemToolbar).getByRole('button', {
          name: 'Distribute selection horizontally'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)

    act(() => {
      objects.set(page.id, { ...page, locked: true })
      objects.set(shape.id, { ...shape, locked: true })
      ref.current?.selectNodes([page.id, shape.id])
    })

    const lockedToolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    expect(screen.getAllByRole('img', { name: /^Locked / })).toHaveLength(2)
    expect(screen.queryAllByRole('button', { name: /^Resize / })).toHaveLength(0)
    expect(
      (
        within(lockedToolbar).getByRole('button', {
          name: 'Duplicate selection'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
    expect(
      (
        within(lockedToolbar).getByRole('button', {
          name: 'Connect selection'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
    expect(
      (
        within(lockedToolbar).getByRole('button', {
          name: 'Align selection left'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
    expect(
      (
        within(lockedToolbar).getByRole('button', {
          name: 'Group selection'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
    expect(
      (
        within(lockedToolbar).getByRole('button', {
          name: 'Delete selection'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
    expect(
      (
        within(lockedToolbar).getByRole('button', {
          name: 'Unlock selection'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  })

  it('keeps contextual toolbar actions available across rich object kinds', () => {
    const doc = new Y.Doc()
    const ref = React.createRef<CanvasHandle>()
    const onEditSelectionAlias = vi.fn()
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const media = createNode(
      'media',
      { x: 0, y: 0, width: 320, height: 180 },
      {
        title: 'Reference Image',
        kind: 'image'
      }
    )
    const pdf = createNode(
      'media',
      { x: 360, y: 0, width: 280, height: 360 },
      {
        title: 'Spec PDF',
        kind: 'pdf',
        mimeType: 'application/pdf'
      }
    )
    const embed = createNode(
      'external-reference',
      { x: 680, y: 0, width: 360, height: 202 },
      {
        title: 'Demo Video',
        embedUrl: 'https://www.youtube.com/embed/video'
      }
    )
    const shape = createNode(
      'shape',
      { x: 0, y: 260, width: 220, height: 140 },
      {
        title: 'Decision Shape'
      }
    )
    const baseFrame = createCanvasFrameVariantNode({
      title: 'Planning Frame',
      viewport: { x: 0, y: 0, zoom: 1 },
      variant: 'standard'
    })
    const frame: CanvasNode = {
      ...baseFrame,
      id: 'frame-kind',
      position: { x: 260, y: 240, width: 360, height: 260 }
    }
    const pluginCard = createNode(
      'external-reference',
      { x: 660, y: 260, width: 320, height: 180 },
      {
        title: 'ERP Purchase Order',
        pluginId: 'com.xnet.fixtures.erp',
        pluginContributionId: 'erp.purchase-order-card'
      }
    )
    pluginCard.sourceNodeId = 'source-erp-po'
    const richNodes = [media, pdf, embed, shape, frame, pluginCard]

    richNodes.forEach((node) => {
      objects.set(node.id, node)
    })

    render(<Canvas ref={ref} doc={doc} onEditSelectionAlias={onEditSelectionAlias} />)

    const expectEnabledToolbarButton = (toolbar: HTMLElement, name: string) => {
      expect((within(toolbar).getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(
        false
      )
    }

    for (const node of richNodes) {
      act(() => {
        ref.current?.selectNodes([node.id])
      })

      const toolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
      expectEnabledToolbarButton(toolbar, 'Edit selection dimensions')
      expectEnabledToolbarButton(toolbar, 'Duplicate selection')
      expectEnabledToolbarButton(toolbar, 'Lock selection')
      expectEnabledToolbarButton(toolbar, 'Wrap selection in frame')
      expectEnabledToolbarButton(toolbar, 'Send selection backward')
      expectEnabledToolbarButton(toolbar, 'Bring selection forward')
      expectEnabledToolbarButton(toolbar, 'Delete selection')
      expectEnabledToolbarButton(toolbar, 'Clear selection')
    }

    act(() => {
      ref.current?.selectNodes([shape.id])
    })
    expect(
      screen.getByRole('button', {
        name: 'Edit shape style'
      })
    ).toBeTruthy()

    act(() => {
      ref.current?.selectNodes([frame.id])
    })
    expect(
      screen.getByRole('button', {
        name: 'Edit frame variant'
      })
    ).toBeTruthy()

    act(() => {
      ref.current?.selectNodes([pluginCard.id])
    })
    expect(
      screen.getByRole('button', {
        name: 'Edit selection alias'
      })
    ).toBeTruthy()
  })

  it('selects rich object bodies, nested frame members, transparent shapes, and live iframe shells', () => {
    const doc = new Y.Doc()
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const onSelectionChange = vi.fn()
    const page = createNode(
      'page',
      { x: -420, y: -220, width: 260, height: 160 },
      {
        title: 'Live Page Surface'
      }
    )
    const database = createNode(
      'database',
      { x: -120, y: -220, width: 340, height: 220 },
      {
        title: 'Live Database Surface'
      }
    )
    const image = createNode(
      'media',
      { x: 260, y: -220, width: 320, height: 180 },
      {
        title: 'Reference Image',
        kind: 'image',
        mimeType: 'image/png'
      }
    )
    const pdf = createNode(
      'media',
      { x: 620, y: -220, width: 260, height: 340 },
      {
        title: 'Spec PDF',
        kind: 'pdf',
        mimeType: 'application/pdf'
      }
    )
    const embed = createNode(
      'external-reference',
      { x: -420, y: 80, width: 360, height: 202 },
      {
        title: 'Live Embed Shell',
        provider: 'youtube',
        embedUrl: 'https://www.youtube.com/embed/allowed'
      }
    )
    const transparentShape = createNode(
      'shape',
      { x: 0, y: 80, width: 220, height: 140 },
      {
        title: 'Transparent Shape',
        fill: 'transparent',
        stroke: 'transparent'
      }
    )
    const frameBase = createCanvasFrameVariantNode({
      title: 'Planning Frame',
      viewport: { x: 0, y: 0, zoom: 1 },
      variant: 'standard'
    })
    const nestedNote = createNode(
      'note',
      { x: 300, y: 130, width: 200, height: 120 },
      {
        title: 'Nested Frame Note'
      }
    )
    const frame: CanvasNode = {
      ...frameBase,
      id: 'planning-frame-select',
      position: { x: 260, y: 80, width: 360, height: 260 },
      properties: {
        ...frameBase.properties,
        memberIds: [nestedNote.id]
      }
    }
    const selectableNodes = [page, database, image, pdf, embed, transparentShape, frame, nestedNote]

    selectableNodes.forEach((node) => {
      objects.set(node.id, node)
    })

    render(
      <Canvas
        doc={doc}
        onSelectionChange={onSelectionChange}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const surface = screen.getByRole('application', { name: 'Canvas' })
    onSelectionChange.mockClear()

    const selectNode = (node: CanvasNode, selector?: string) => {
      const target = surface.querySelector<HTMLElement>(
        selector ?? `[data-canvas-v3-object="true"][data-canvas-object-id="${node.id}"]`
      )

      if (!target) {
        throw new Error(`Expected selectable target for ${node.properties.title as string}`)
      }

      fireEvent.pointerDown(target, {
        button: 0,
        pointerId: 91,
        clientX: 480,
        clientY: 320
      })

      expect(onSelectionChange).toHaveBeenLastCalledWith({
        nodeIds: [node.id],
        edgeIds: []
      })
      expect(
        surface
          .querySelector(`[data-canvas-v3-object="true"][data-canvas-object-id="${node.id}"]`)
          ?.getAttribute('aria-label')
      ).toContain('Selected')
      expect(surface.querySelectorAll('[data-canvas-v3-resize-handle]')).toHaveLength(
        TEST_RESIZE_HANDLES.length
      )
    }

    const bodySelectionNodes = [page, database, image, pdf, embed, frame, nestedNote]

    bodySelectionNodes.forEach((node) => selectNode(node))
    selectNode(
      transparentShape,
      `[data-canvas-v3-hit-target="true"][data-canvas-object-id="${transparentShape.id}"]`
    )

    expect(
      surface
        .querySelector(`[data-canvas-v3-object="true"][data-canvas-object-id="${embed.id}"]`)
        ?.getAttribute('data-canvas-live-iframe')
    ).toBe('true')
  })

  it('renders fallback cards when plugin contributions are disabled or missing', () => {
    const doc = new Y.Doc()
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const disabledPluginCard = createNode(
      'external-reference',
      { x: -240, y: -80, width: 320, height: 180 },
      {
        title: 'ERP Purchase Order',
        pluginId: 'com.xnet.fixtures.erp',
        pluginContributionId: 'erp.purchase-order-card',
        pluginEnabled: false,
        pluginFallbackLabel: 'Purchase order',
        pluginFields: ['poNumber', 'vendor', 'status']
      }
    )
    const missingPluginCard = createNode(
      'external-reference',
      { x: 140, y: -80, width: 320, height: 180 },
      {
        title: 'CRM Account',
        pluginId: 'com.xnet.fixtures.crm',
        pluginContributionId: 'crm.account-card',
        pluginStatus: 'missing',
        fallbackLabel: 'CRM account',
        pluginFields: [{ label: 'Health' }, { key: 'renewalDate' }]
      }
    )

    objects.set(disabledPluginCard.id, disabledPluginCard)
    objects.set(missingPluginCard.id, missingPluginCard)

    render(<Canvas doc={doc} />)

    const fallbacks = document.querySelectorAll('[data-canvas-v3-plugin-fallback="true"]')
    expect(fallbacks).toHaveLength(2)
    expect(fallbacks[0]?.getAttribute('data-canvas-plugin-state')).toBe('disabled')
    expect(fallbacks[0]?.textContent).toContain('Plugin disabled')
    expect(fallbacks[0]?.textContent).toContain('Purchase order')
    expect(fallbacks[0]?.textContent).toContain('poNumber')
    expect(fallbacks[1]?.getAttribute('data-canvas-plugin-state')).toBe('missing')
    expect(fallbacks[1]?.textContent).toContain('Plugin missing')
    expect(fallbacks[1]?.textContent).toContain('CRM account')
    expect(fallbacks[1]?.textContent).toContain('Health')
  })

  it('duplicates and deletes v3 selections from toolbar and keyboard shortcuts', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()

    render(<Canvas ref={ref} doc={doc} />)

    const page = getNodeByTitle(doc, 'Research Page')
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const connectors = getCanvasConnectorsMap(doc)
    const surface = screen.getByRole('application', { name: 'Canvas' })
    const initialObjectCount = objects.size
    const initialConnectorCount = connectors.size

    act(() => {
      ref.current?.selectNodes([page.id])
    })

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Duplicate selection' }))

    const firstDuplicate = Array.from(objects.values()).find(
      (node) => node.id !== page.id && node.properties.title === page.properties.title
    )

    expect(objects.size).toBe(initialObjectCount + 1)
    expect(firstDuplicate).toBeTruthy()

    if (!firstDuplicate) {
      throw new Error('Expected first duplicated page object')
    }

    expect(firstDuplicate.position.x).toBe(page.position.x + 32)
    expect(firstDuplicate.position.y).toBe(page.position.y + 32)
    expect(firstDuplicate.locked).toBe(false)

    fireEvent.keyDown(surface, { key: 'd', metaKey: true })

    const secondDuplicate = Array.from(objects.values()).find(
      (node) =>
        node.id !== page.id &&
        node.id !== firstDuplicate.id &&
        node.properties.title === page.properties.title
    )

    expect(objects.size).toBe(initialObjectCount + 2)
    expect(secondDuplicate).toBeTruthy()

    if (!secondDuplicate) {
      throw new Error('Expected second duplicated page object')
    }

    expect(secondDuplicate.position.x).toBe(firstDuplicate.position.x + 32)
    expect(secondDuplicate.position.y).toBe(firstDuplicate.position.y + 32)

    fireEvent.keyDown(surface, { key: 'Delete' })
    expect(objects.has(secondDuplicate.id)).toBe(false)
    expect(objects.size).toBe(initialObjectCount + 1)

    act(() => {
      ref.current?.selectNodes([page.id])
    })

    const deleteToolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    fireEvent.click(within(deleteToolbar).getByRole('button', { name: 'Delete selection' }))

    expect(objects.has(page.id)).toBe(false)
    expect(connectors.size).toBe(initialConnectorCount - 1)
    expect(objects.size).toBe(initialObjectCount)
  })

  it('routes v3 keyboard editing shortcuts through selection operations', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const onOpenSelection = vi.fn()

    render(
      <Canvas ref={ref} doc={doc} config={{ gridSize: 24 }} onOpenSelection={onOpenSelection} />
    )

    const page = getNodeByTitle(doc, 'Research Page')
    const shape = getNodeByTitle(doc, 'Decision Box')
    const surface = screen.getByRole('application', { name: 'Canvas' })
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const connectors = getCanvasConnectorsMap(doc)
    const initialConnectorCount = connectors.size

    act(() => {
      ref.current?.selectNodes([page.id])
    })

    fireEvent.keyDown(surface, { key: 'Enter' })
    expect(onOpenSelection).toHaveBeenCalledWith('focus')

    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    fireEvent.keyDown(surface, { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(surface, { key: ']' })

    expect(objects.get(page.id)?.position.x).toBe(page.position.x + 1)
    expect(objects.get(page.id)?.position.y).toBe(page.position.y + 24)
    expect(objects.get(page.id)?.position.zIndex).toBe(1)

    fireEvent.keyDown(surface, { key: 'L', metaKey: true, shiftKey: true })
    expect(objects.get(page.id)?.locked).toBe(true)

    fireEvent.keyDown(surface, { key: 'L', metaKey: true, shiftKey: true })
    expect(objects.get(page.id)?.locked).toBe(false)

    act(() => {
      ref.current?.selectNodes([page.id, shape.id])
    })

    fireEvent.keyDown(surface, { key: 'K', metaKey: true, shiftKey: true })
    expect(connectors.size).toBe(initialConnectorCount + 1)

    fireEvent.keyDown(surface, { key: 'G', metaKey: true })
    expect(
      Array.from(objects.values()).some(
        (node) =>
          node.type === 'group' &&
          node.properties.containerRole === 'group' &&
          Array.isArray(node.properties.memberIds) &&
          node.properties.memberIds.includes(page.id) &&
          node.properties.memberIds.includes(shape.id)
      )
    ).toBe(true)

    act(() => {
      ref.current?.selectNodes([page.id, shape.id])
    })

    fireEvent.keyDown(surface, { key: 'F', metaKey: true, shiftKey: true })
    expect(
      Array.from(objects.values()).some(
        (node) =>
          node.type === 'group' &&
          node.properties.containerRole === 'frame' &&
          Array.isArray(node.properties.memberIds) &&
          node.properties.memberIds.includes(page.id) &&
          node.properties.memberIds.includes(shape.id)
      )
    ).toBe(true)

    fireEvent.keyDown(surface, { key: 'Escape' })
    expect(screen.queryByRole('toolbar', { name: 'Canvas selection actions' })).toBeNull()
  })

  it('selects and resizes v3 objects from the keyboard with accessible dimensions', () => {
    const doc = createCanvasTestDoc()
    const onSelectionChange = vi.fn()

    render(
      <Canvas
        doc={doc}
        config={{ gridSize: 24 }}
        onSelectionChange={onSelectionChange}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const page = getNodeByTitle(doc, 'Research Page')
    const shape = getNodeByTitle(doc, 'Decision Box')
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const surface = screen.getByRole('application', { name: 'Canvas' })

    fireEvent.keyDown(surface, { key: 'Tab' })

    expect(onSelectionChange).toHaveBeenLastCalledWith({
      nodeIds: [page.id],
      edgeIds: []
    })

    fireEvent.keyDown(surface, { key: 'ArrowRight', altKey: true })
    fireEvent.keyDown(surface, { key: 'ArrowDown', altKey: true, shiftKey: true })

    expect(objects.get(page.id)?.position.width).toBe(261)
    expect(objects.get(page.id)?.position.height).toBe(184)

    const resizedPageIsland = screen.getByRole('group', {
      name: /Selected, Document, Research Page/
    })

    expect(resizedPageIsland?.getAttribute('aria-label')).toContain('Selected')
    expect(resizedPageIsland?.getAttribute('aria-label')).toContain('261 by 184')
    expect(resizedPageIsland?.getAttribute('aria-keyshortcuts')).toContain('Alt+ArrowRight')

    fireEvent.keyDown(surface, { key: 'Tab' })

    expect(onSelectionChange).toHaveBeenLastCalledWith({
      nodeIds: [shape.id],
      edgeIds: []
    })
    expect(
      screen
        .getByRole('group', { name: /Selected, Shape, Decision Box/ })
        .getAttribute('aria-roledescription')
    ).toBe('canvas shape')
  })

  it('keeps v3 selection toolbar popovers keyboard navigable without modal focus traps', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const onSelectionChange = vi.fn()

    render(<Canvas ref={ref} doc={doc} onSelectionChange={onSelectionChange} />)

    const page = getNodeByTitle(doc, 'Research Page')

    act(() => {
      ref.current?.selectNodes([page.id])
    })

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas selection actions' })
    const sizeButton = within(toolbar).getByRole('button', { name: 'Edit selection dimensions' })
    fireEvent.click(sizeButton)

    const popover = screen.getByRole('dialog', { name: 'Selection dimensions' })

    expect(popover.getAttribute('aria-modal')).toBeNull()
    expect(within(popover).getByRole('spinbutton', { name: 'Width' })).toBeTruthy()
    expect(within(popover).getByRole('spinbutton', { name: 'Height' })).toBeTruthy()

    onSelectionChange.mockClear()
    sizeButton.focus()
    fireEvent.keyDown(sizeButton, { key: 'Tab' })

    expect(onSelectionChange).not.toHaveBeenCalled()
  })

  it('moves a v3 object by dragging its DOM island', () => {
    const doc = createCanvasTestDoc()
    const onSceneMutation = vi.fn()

    render(
      <Canvas
        doc={doc}
        config={{ gridSize: 0 }}
        onSceneMutation={onSceneMutation}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const page = getNodeByTitle(doc, 'Research Page')
    const initialX = page.position.x
    const initialY = page.position.y
    const pageIsland = screen.getByText('Research Page').closest('[data-canvas-v3-object="true"]')
    const surface = screen.getByRole('application', { name: 'Canvas' })

    if (!pageIsland) {
      throw new Error('Expected Research Page DOM island')
    }

    const initialScreenLeft = Number.parseFloat((pageIsland as HTMLElement).style.left)
    const initialScreenTop = Number.parseFloat((pageIsland as HTMLElement).style.top)

    fireEvent.pointerDown(pageIsland, {
      button: 0,
      pointerId: 7,
      clientX: 480,
      clientY: 320
    })
    fireEvent.pointerMove(surface, {
      pointerId: 7,
      clientX: 520,
      clientY: 350
    })

    const previewed = getCanvasObjectsMap<CanvasNode>(doc).get(page.id)
    expect(previewed?.position.x).toBe(initialX)
    expect(previewed?.position.y).toBe(initialY)
    expect(Number.parseFloat((pageIsland as HTMLElement).style.left)).toBe(initialScreenLeft + 40)
    expect(Number.parseFloat((pageIsland as HTMLElement).style.top)).toBe(initialScreenTop + 30)
    expect(onSceneMutation).not.toHaveBeenCalled()

    fireEvent.pointerUp(surface, {
      pointerId: 7,
      clientX: 520,
      clientY: 350
    })

    const moved = getCanvasObjectsMap<CanvasNode>(doc).get(page.id)
    expect(moved?.position.x).toBe(initialX + 40)
    expect(moved?.position.y).toBe(initialY + 30)
    expect(onSceneMutation).toHaveBeenCalled()
  })

  it('does not move v3 objects when an embedded editor surface handles the pointer', () => {
    const doc = createCanvasTestDoc()
    const onSceneMutation = vi.fn()
    const onSelectionChange = vi.fn()

    render(
      <Canvas
        doc={doc}
        config={{ gridSize: 0 }}
        onSceneMutation={onSceneMutation}
        onSelectionChange={onSelectionChange}
        renderNode={(node) => (
          <div data-canvas-interactive="true" data-testid={`editor-surface-${node.id}`}>
            <div data-testid={`editor-whitespace-${node.id}`}>
              {node.properties.title as string}
            </div>
          </div>
        )}
      />
    )

    const page = getNodeByTitle(doc, 'Research Page')
    const initialX = page.position.x
    const initialY = page.position.y
    const editorWhitespace = screen.getByTestId(`editor-whitespace-${page.id}`)
    const surface = screen.getByRole('application', { name: 'Canvas' })

    fireEvent.pointerDown(editorWhitespace, {
      button: 0,
      pointerId: 71,
      clientX: 480,
      clientY: 320
    })
    fireEvent.pointerMove(surface, {
      pointerId: 71,
      clientX: 540,
      clientY: 365
    })
    fireEvent.pointerUp(surface, {
      pointerId: 71,
      clientX: 540,
      clientY: 365
    })

    const moved = getCanvasObjectsMap<CanvasNode>(doc).get(page.id)
    expect(moved?.position.x).toBe(initialX)
    expect(moved?.position.y).toBe(initialY)
    expect(onSelectionChange).not.toHaveBeenCalledWith({
      nodeIds: [page.id],
      edgeIds: []
    })
    expect(onSceneMutation).not.toHaveBeenCalled()
  })

  it('preserves embedded editor text selection when an editing surface handles the pointer', () => {
    const doc = createCanvasTestDoc()
    const onSceneMutation = vi.fn()
    const onSelectionChange = vi.fn()

    render(
      <Canvas
        doc={doc}
        config={{ gridSize: 0 }}
        onSceneMutation={onSceneMutation}
        onSelectionChange={onSelectionChange}
        renderNode={(node) => (
          <div data-canvas-editing-surface="true" data-testid={`editor-surface-${node.id}`}>
            <div data-testid={`editor-text-${node.id}`}>
              {node.properties.title as string} editable body
            </div>
          </div>
        )}
      />
    )

    const page = getNodeByTitle(doc, 'Research Page')
    const initialX = page.position.x
    const initialY = page.position.y
    const editorText = screen.getByTestId(`editor-text-${page.id}`)
    const textNode = editorText.firstChild
    const selection = window.getSelection()
    const surface = screen.getByRole('application', { name: 'Canvas' })

    if (!textNode || !selection) {
      throw new Error('Expected selectable editor text')
    }

    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 'Research'.length)
    selection.removeAllRanges()
    selection.addRange(range)

    expect(selection.toString()).toBe('Research')

    fireEvent.pointerDown(editorText, {
      button: 0,
      pointerId: 75,
      clientX: 480,
      clientY: 320
    })
    fireEvent.pointerMove(surface, {
      pointerId: 75,
      clientX: 545,
      clientY: 365
    })
    fireEvent.pointerUp(surface, {
      pointerId: 75,
      clientX: 545,
      clientY: 365
    })

    const moved = getCanvasObjectsMap<CanvasNode>(doc).get(page.id)
    expect(window.getSelection()?.toString()).toBe('Research')
    expect(moved?.position.x).toBe(initialX)
    expect(moved?.position.y).toBe(initialY)
    expect(onSelectionChange).not.toHaveBeenCalledWith({
      nodeIds: [page.id],
      edgeIds: []
    })
    expect(onSceneMutation).not.toHaveBeenCalled()

    selection.removeAllRanges()
  })

  it('ignores v3 DOM island drag jitter below the movement threshold', () => {
    const doc = createCanvasTestDoc()
    const onSceneMutation = vi.fn()

    render(
      <Canvas
        doc={doc}
        config={{ gridSize: 0 }}
        onSceneMutation={onSceneMutation}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const page = getNodeByTitle(doc, 'Research Page')
    const initialX = page.position.x
    const initialY = page.position.y
    const pageIsland = screen.getByText('Research Page').closest('[data-canvas-v3-object="true"]')
    const surface = screen.getByRole('application', { name: 'Canvas' })

    if (!pageIsland) {
      throw new Error('Expected Research Page DOM island')
    }

    fireEvent.pointerDown(pageIsland, {
      button: 0,
      pointerId: 70,
      clientX: 480,
      clientY: 320
    })
    fireEvent.pointerMove(surface, {
      pointerId: 70,
      clientX: 481,
      clientY: 321
    })
    fireEvent.pointerUp(surface, {
      pointerId: 70,
      clientX: 481,
      clientY: 321
    })

    const moved = getCanvasObjectsMap<CanvasNode>(doc).get(page.id)
    expect(moved?.position.x).toBe(initialX)
    expect(moved?.position.y).toBe(initialY)
    expect(onSceneMutation).not.toHaveBeenCalled()
  })

  it('moves large multi-selections with transform previews and one coalesced commit', () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const selectedNodes = Array.from({ length: 32 }, (_, index) =>
      createNode(
        'media',
        {
          x: -360 + (index % 8) * 100,
          y: -220 + Math.floor(index / 8) * 90,
          width: 80,
          height: 60
        },
        {
          title: `Media ${index + 1}`
        }
      )
    )
    const ref = React.createRef<CanvasHandle>()
    const onSceneMutation = vi.fn()

    selectedNodes.forEach((node) => nodes.set(node.id, node))

    render(
      <Canvas
        ref={ref}
        doc={doc}
        config={{ gridSize: 0 }}
        onSceneMutation={onSceneMutation}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    act(() => {
      ref.current?.selectNodes(selectedNodes.map((node) => node.id))
    })

    const surface = screen.getByRole('application', { name: 'Canvas' })
    const firstNode = selectedNodes[0]
    const firstIsland = firstNode
      ? (surface.querySelector(
          `[data-canvas-v3-object="true"][data-canvas-object-id="${firstNode.id}"]`
        ) as HTMLElement | null)
      : null

    if (!firstNode || !firstIsland) {
      throw new Error('Expected the first selected node to have a DOM island')
    }

    const initialPositions = new Map(
      selectedNodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }])
    )
    const initialScreenLeft = Number.parseFloat(firstIsland.style.left)
    const initialScreenTop = Number.parseFloat(firstIsland.style.top)

    fireEvent.pointerDown(firstIsland, {
      button: 0,
      pointerId: 72,
      clientX: 480,
      clientY: 320
    })
    fireEvent.pointerMove(surface, {
      pointerId: 72,
      clientX: 540,
      clientY: 360
    })

    selectedNodes.forEach((node) => {
      const current = nodes.get(node.id)
      const initial = initialPositions.get(node.id)

      expect(current?.position.x).toBe(initial?.x)
      expect(current?.position.y).toBe(initial?.y)
    })
    expect(Number.parseFloat(firstIsland.style.left)).toBe(initialScreenLeft + 60)
    expect(Number.parseFloat(firstIsland.style.top)).toBe(initialScreenTop + 40)
    expect(onSceneMutation).not.toHaveBeenCalled()

    fireEvent.pointerUp(surface, {
      pointerId: 72,
      clientX: 540,
      clientY: 360
    })

    selectedNodes.forEach((node) => {
      const current = nodes.get(node.id)
      const initial = initialPositions.get(node.id)

      expect(current?.position.x).toBe((initial?.x ?? 0) + 60)
      expect(current?.position.y).toBe((initial?.y ?? 0) + 40)
    })
    expect(onSceneMutation).toHaveBeenCalledOnce()
  })

  it('persists single-object and multi-selection drags across tile-sized boundaries after remount', () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const ref = React.createRef<CanvasHandle>()
    const onSceneMutation = vi.fn()
    const single = createNode(
      'page',
      { x: 980, y: 980, width: 180, height: 120 },
      {
        title: 'Boundary Page'
      }
    )
    const firstGroupNode = createNode(
      'database',
      { x: 940, y: 1180, width: 320, height: 220 },
      {
        title: 'Boundary Database'
      }
    )
    const secondGroupNode = createNode(
      'note',
      { x: 1280, y: 1180, width: 180, height: 120 },
      {
        title: 'Boundary Note'
      }
    )

    const boundaryNodes = [single, firstGroupNode, secondGroupNode]

    boundaryNodes.forEach((node) => {
      nodes.set(node.id, node)
    })

    const renderCanvas = () =>
      render(
        <Canvas
          ref={ref}
          doc={doc}
          config={{ gridSize: 0 }}
          initialViewport={{ x: 1100, y: 1100, zoom: 1 }}
          onSceneMutation={onSceneMutation}
          renderNode={(node) => <span>{node.properties.title as string}</span>}
        />
      )

    const { unmount } = renderCanvas()
    const surface = screen.getByRole('application', { name: 'Canvas' })
    const singleIsland = screen.getByText('Boundary Page').closest('[data-canvas-v3-object="true"]')

    if (!singleIsland) {
      throw new Error('Expected Boundary Page DOM island')
    }

    fireEvent.pointerDown(singleIsland, {
      button: 0,
      pointerId: 92,
      clientX: 480,
      clientY: 320
    })
    fireEvent.pointerMove(surface, {
      pointerId: 92,
      clientX: 620,
      clientY: 450
    })
    fireEvent.pointerUp(surface, {
      pointerId: 92,
      clientX: 620,
      clientY: 450
    })

    expect(nodes.get(single.id)?.position).toMatchObject({
      x: 1120,
      y: 1110
    })

    act(() => {
      ref.current?.selectNodes([firstGroupNode.id, secondGroupNode.id])
    })

    const groupIsland = screen
      .getByText('Boundary Database')
      .closest('[data-canvas-v3-object="true"]')

    if (!groupIsland) {
      throw new Error('Expected Boundary Database DOM island')
    }

    fireEvent.pointerDown(groupIsland, {
      button: 0,
      pointerId: 93,
      clientX: 500,
      clientY: 340
    })
    fireEvent.pointerMove(surface, {
      pointerId: 93,
      clientX: 660,
      clientY: 340
    })
    fireEvent.pointerUp(surface, {
      pointerId: 93,
      clientX: 660,
      clientY: 340
    })

    expect(nodes.get(firstGroupNode.id)?.position).toMatchObject({
      x: 1100,
      y: 1180
    })
    expect(nodes.get(secondGroupNode.id)?.position).toMatchObject({
      x: 1440,
      y: 1180
    })
    expect(onSceneMutation).toHaveBeenCalledTimes(2)

    unmount()
    renderCanvas()

    expect(
      screen.getByRole('group', { name: /Boundary Page/ }).getAttribute('aria-label')
    ).toContain('at x 1120, y 1110')
    expect(
      screen.getByRole('group', { name: /Boundary Database/ }).getAttribute('aria-label')
    ).toContain('at x 1100, y 1180')
  })

  it('shares v3 drag interactions through awareness without committing intermediate positions', () => {
    const doc = createCanvasTestDoc()
    const awareness = createMockAwareness()

    render(
      <Canvas
        doc={doc}
        config={{ gridSize: 0 }}
        awareness={awareness}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const page = getNodeByTitle(doc, 'Research Page')
    const pageIsland = screen.getByText('Research Page').closest('[data-canvas-v3-object="true"]')
    const surface = screen.getByRole('application', { name: 'Canvas' })

    if (!pageIsland) {
      throw new Error('Expected Research Page DOM island')
    }

    fireEvent.pointerDown(pageIsland, {
      button: 0,
      pointerId: 8,
      clientX: 480,
      clientY: 320
    })
    fireEvent.pointerMove(surface, {
      pointerId: 8,
      clientX: 520,
      clientY: 350
    })

    expect(awareness.setLocalStateField).toHaveBeenCalledWith(
      'canvasInteraction',
      expect.objectContaining({
        type: 'dragging',
        nodeIds: [page.id],
        bounds: expect.objectContaining({
          x: page.position.x + 40,
          y: page.position.y + 30,
          width: page.position.width,
          height: page.position.height
        })
      })
    )
    expect(getCanvasObjectsMap<CanvasNode>(doc).get(page.id)?.position.x).toBe(page.position.x)

    fireEvent.pointerUp(surface, {
      pointerId: 8,
      clientX: 520,
      clientY: 350
    })

    expect(awareness.setLocalStateField).toHaveBeenCalledWith('canvasInteraction', null)
  })

  it('renders remote v3 interaction outlines from awareness', () => {
    const doc = createCanvasTestDoc()
    const awareness = createMockAwareness()
    const page = getNodeByTitle(doc, 'Research Page')

    awareness.setRemoteState(2, {
      user: {
        did: 'did:key:remote',
        name: 'Remote',
        color: '#ef4444'
      },
      canvasInteraction: {
        type: 'dragging',
        nodeIds: [page.id],
        bounds: {
          x: page.position.x + 40,
          y: page.position.y + 30,
          width: page.position.width,
          height: page.position.height
        }
      }
    })

    render(<Canvas doc={doc} awareness={awareness} />)

    const surface = screen.getByRole('application', { name: 'Canvas' })
    const remoteInteraction = surface.querySelector('[data-canvas-v3-remote-interaction="true"]')

    expect(remoteInteraction?.getAttribute('data-canvas-remote-client-id')).toBe('2')
    expect(remoteInteraction?.getAttribute('data-canvas-remote-interaction-type')).toBe('dragging')
  })

  it('snaps v3 drag previews and commits to the configured grid', () => {
    const doc = createCanvasTestDoc()

    render(
      <Canvas
        doc={doc}
        config={{ gridSize: 20 }}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const page = getNodeByTitle(doc, 'Research Page')
    const initialX = page.position.x
    const initialY = page.position.y
    const pageIsland = screen.getByText('Research Page').closest('[data-canvas-v3-object="true"]')
    const surface = screen.getByRole('application', { name: 'Canvas' })

    if (!pageIsland) {
      throw new Error('Expected Research Page DOM island')
    }

    const initialScreenLeft = Number.parseFloat((pageIsland as HTMLElement).style.left)
    const initialScreenTop = Number.parseFloat((pageIsland as HTMLElement).style.top)

    fireEvent.pointerDown(pageIsland, {
      button: 0,
      pointerId: 11,
      clientX: 480,
      clientY: 320
    })
    fireEvent.pointerMove(surface, {
      pointerId: 11,
      clientX: 507,
      clientY: 351
    })

    expect(Number.parseFloat((pageIsland as HTMLElement).style.left)).toBe(initialScreenLeft + 20)
    expect(Number.parseFloat((pageIsland as HTMLElement).style.top)).toBe(initialScreenTop + 40)

    fireEvent.pointerUp(surface, {
      pointerId: 11,
      clientX: 507,
      clientY: 351
    })

    let moved = getCanvasObjectsMap<CanvasNode>(doc).get(page.id)
    expect(moved?.position.x).toBe(initialX + 20)
    expect(moved?.position.y).toBe(initialY + 40)

    fireEvent.pointerDown(pageIsland, {
      button: 0,
      pointerId: 12,
      clientX: 507,
      clientY: 351
    })
    fireEvent.pointerMove(surface, {
      altKey: true,
      pointerId: 12,
      clientX: 520,
      clientY: 362
    })
    fireEvent.pointerUp(surface, {
      altKey: true,
      pointerId: 12,
      clientX: 520,
      clientY: 362
    })

    moved = getCanvasObjectsMap<CanvasNode>(doc).get(page.id)
    expect(moved?.position.x).toBe(initialX + 33)
    expect(moved?.position.y).toBe(initialY + 51)
  })

  it('snaps v3 drag previews to smart object guides', () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const mover = createNode(
      'page',
      { x: 0, y: 0, width: 100, height: 80 },
      {
        title: 'Mover'
      }
    )
    const target = createNode(
      'page',
      { x: 206, y: 24, width: 120, height: 80 },
      {
        title: 'Target'
      }
    )

    nodes.set(mover.id, mover)
    nodes.set(target.id, target)

    render(
      <Canvas
        doc={doc}
        config={{ gridSize: 0 }}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const moverIsland = screen.getByText('Mover').closest('[data-canvas-v3-object="true"]')
    const surface = screen.getByRole('application', { name: 'Canvas' })

    if (!moverIsland) {
      throw new Error('Expected Mover DOM island')
    }

    const initialScreenLeft = Number.parseFloat((moverIsland as HTMLElement).style.left)

    fireEvent.pointerDown(moverIsland, {
      button: 0,
      pointerId: 21,
      clientX: 500,
      clientY: 340
    })
    fireEvent.pointerMove(surface, {
      pointerId: 21,
      clientX: 604,
      clientY: 340
    })

    expect(Number.parseFloat((moverIsland as HTMLElement).style.left)).toBe(initialScreenLeft + 106)

    const guide = surface.querySelector('[data-canvas-v3-snap-guide="true"]')
    expect(guide?.getAttribute('data-canvas-snap-guide-source')).toBe('object')
    expect(guide?.getAttribute('data-canvas-snap-guide-orientation')).toBe('vertical')

    fireEvent.pointerUp(surface, {
      pointerId: 21,
      clientX: 604,
      clientY: 340
    })

    const moved = nodes.get(mover.id)
    expect(moved?.position.x).toBe(106)
    expect(surface.querySelector('[data-canvas-v3-snap-guide="true"]')).toBeNull()
  })

  it('snaps v3 drag previews to frame-edge guides', () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const mover = createNode(
      'page',
      { x: 0, y: 0, width: 100, height: 80 },
      {
        title: 'Frame Mover'
      }
    )
    const frame = createCanvasFrameVariantNode({
      title: 'Target Frame',
      viewport: { x: 0, y: 0, zoom: 1 },
      variant: 'standard'
    })
    const frameNode: CanvasNode = {
      ...frame,
      id: 'target-frame-snap',
      position: { x: 300, y: -40, width: 460, height: 320 }
    }

    nodes.set(mover.id, mover)
    nodes.set(frameNode.id, frameNode)

    render(
      <Canvas
        doc={doc}
        config={{ gridSize: 0 }}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const moverIsland = screen.getByText('Frame Mover').closest('[data-canvas-v3-object="true"]')
    const surface = screen.getByRole('application', { name: 'Canvas' })

    if (!moverIsland) {
      throw new Error('Expected Frame Mover DOM island')
    }

    const initialScreenLeft = Number.parseFloat((moverIsland as HTMLElement).style.left)

    fireEvent.pointerDown(moverIsland, {
      button: 0,
      pointerId: 94,
      clientX: 500,
      clientY: 340
    })
    fireEvent.pointerMove(surface, {
      pointerId: 94,
      clientX: 796,
      clientY: 340
    })

    expect(Number.parseFloat((moverIsland as HTMLElement).style.left)).toBe(initialScreenLeft + 300)

    const guide = surface.querySelector('[data-canvas-v3-snap-guide="true"]')
    expect(guide?.getAttribute('data-canvas-snap-guide-source')).toBe('frame')
    expect(guide?.getAttribute('data-canvas-snap-guide-orientation')).toBe('vertical')

    fireEvent.pointerUp(surface, {
      pointerId: 94,
      clientX: 796,
      clientY: 340
    })

    expect(nodes.get(mover.id)?.position.x).toBe(300)
  })

  it('snaps v3 drag previews to equal-spacing guides', () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const mover = createNode(
      'page',
      { x: 0, y: 120, width: 100, height: 80 },
      {
        title: 'Spacing Mover'
      }
    )
    const left = createNode(
      'page',
      { x: 0, y: 0, width: 100, height: 80 },
      {
        title: 'Left Neighbor'
      }
    )
    const right = createNode(
      'page',
      { x: 300, y: 0, width: 100, height: 80 },
      {
        title: 'Right Neighbor'
      }
    )

    const snapNodes = [mover, left, right]

    snapNodes.forEach((node) => nodes.set(node.id, node))

    render(
      <Canvas
        doc={doc}
        config={{ gridSize: 0 }}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const moverIsland = screen.getByText('Spacing Mover').closest('[data-canvas-v3-object="true"]')
    const surface = screen.getByRole('application', { name: 'Canvas' })

    if (!moverIsland) {
      throw new Error('Expected Spacing Mover DOM island')
    }

    const initialScreenLeft = Number.parseFloat((moverIsland as HTMLElement).style.left)

    fireEvent.pointerDown(moverIsland, {
      button: 0,
      pointerId: 95,
      clientX: 500,
      clientY: 340
    })
    fireEvent.pointerMove(surface, {
      pointerId: 95,
      clientX: 648,
      clientY: 340
    })

    expect(Number.parseFloat((moverIsland as HTMLElement).style.left)).toBe(initialScreenLeft + 150)

    const guide = surface.querySelector('[data-canvas-v3-snap-guide="true"]')
    expect(guide?.getAttribute('data-canvas-snap-guide-source')).toBe('spacing')
    expect(guide?.getAttribute('data-canvas-snap-guide-orientation')).toBe('vertical')

    fireEvent.pointerUp(surface, {
      pointerId: 95,
      clientX: 648,
      clientY: 340
    })

    expect(nodes.get(mover.id)?.position.x).toBe(150)
  })

  it('limits smart guides to visible snap candidates during large drags', () => {
    const doc = createCanvasTestDoc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const offscreenTarget = createNode(
      'page',
      { x: 2046, y: -80, width: 120, height: 100 },
      { title: 'Offscreen Snap Target' }
    )

    nodes.set(offscreenTarget.id, offscreenTarget)

    render(
      <Canvas
        doc={doc}
        config={{ gridSize: 0 }}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const page = getNodeByTitle(doc, 'Research Page')
    const initialX = page.position.x
    const pageIsland = screen.getByText('Research Page').closest('[data-canvas-v3-object="true"]')
    const surface = screen.getByRole('application', { name: 'Canvas' })

    if (!pageIsland) {
      throw new Error('Expected Research Page DOM island')
    }

    fireEvent.pointerDown(pageIsland, {
      button: 0,
      pointerId: 73,
      clientX: 480,
      clientY: 320
    })
    fireEvent.pointerMove(surface, {
      pointerId: 73,
      clientX: 2384,
      clientY: 320
    })
    fireEvent.pointerUp(surface, {
      pointerId: 73,
      clientX: 2384,
      clientY: 320
    })

    const moved = nodes.get(page.id)

    expect(moved?.position.x).toBe(initialX + 1904)
    expect(moved?.position.x).not.toBe(initialX + 1906)
  })

  it('resizes a selected v3 object from a resize handle', () => {
    const doc = createCanvasTestDoc()
    const onSceneMutation = vi.fn()

    render(
      <Canvas
        doc={doc}
        onSceneMutation={onSceneMutation}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const page = getNodeByTitle(doc, 'Research Page')
    const initialWidth = page.position.width
    const initialHeight = page.position.height
    const pageIsland = screen.getByText('Research Page').closest('[data-canvas-v3-object="true"]')
    const surface = screen.getByRole('application', { name: 'Canvas' })

    if (!pageIsland) {
      throw new Error('Expected Research Page DOM island')
    }

    fireEvent.pointerDown(pageIsland, {
      button: 0,
      pointerId: 8,
      clientX: 480,
      clientY: 320
    })
    fireEvent.pointerUp(surface, {
      pointerId: 8,
      clientX: 480,
      clientY: 320
    })

    const resizeHandle = screen.getByRole('button', {
      name: 'Resize Research Page from bottom-right'
    })
    fireEvent.pointerDown(resizeHandle, {
      button: 0,
      pointerId: 9,
      clientX: 740,
      clientY: 480
    })
    fireEvent.pointerMove(surface, {
      pointerId: 9,
      clientX: 780,
      clientY: 510
    })

    const previewed = getCanvasObjectsMap<CanvasNode>(doc).get(page.id)
    expect(previewed?.position.width).toBe(initialWidth)
    expect(previewed?.position.height).toBe(initialHeight)
    expect(Number.parseFloat((pageIsland as HTMLElement).style.width)).toBe(initialWidth + 40)
    expect(Number.parseFloat((pageIsland as HTMLElement).style.height)).toBe(initialHeight + 30)
    expect(onSceneMutation).not.toHaveBeenCalled()

    fireEvent.pointerUp(surface, {
      pointerId: 9,
      clientX: 780,
      clientY: 510
    })

    const resized = getCanvasObjectsMap<CanvasNode>(doc).get(page.id)
    expect(resized?.position.width).toBe(initialWidth + 40)
    expect(resized?.position.height).toBe(initialHeight + 30)
    expect(onSceneMutation).toHaveBeenCalled()
  })

  it('resizes large multi-selections with previews and one coalesced commit', () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const selectedNodes = Array.from({ length: 24 }, (_, index) =>
      createNode(
        'shape',
        {
          x: -420 + (index % 8) * 110,
          y: -220 + Math.floor(index / 8) * 100,
          width: 180,
          height: 120
        },
        {
          title: `Resize Node ${index + 1}`
        }
      )
    )
    const ref = React.createRef<CanvasHandle>()
    const onSceneMutation = vi.fn()

    selectedNodes.forEach((node) => nodes.set(node.id, node))

    render(
      <Canvas
        ref={ref}
        doc={doc}
        config={{ gridSize: 0 }}
        onSceneMutation={onSceneMutation}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    act(() => {
      ref.current?.selectNodes(selectedNodes.map((node) => node.id))
    })

    const firstNode = selectedNodes[0]
    if (!firstNode) {
      throw new Error('Expected selected nodes')
    }

    const firstIsland = document.querySelector(
      `[data-canvas-v3-object="true"][data-canvas-object-id="${firstNode.id}"]`
    ) as HTMLElement | null
    const resizeHandle = screen.getByRole('button', {
      name: 'Resize Resize Node 1 from bottom-right'
    })
    const surface = screen.getByRole('application', { name: 'Canvas' })
    const initialPositions = new Map(
      selectedNodes.map((node) => [
        node.id,
        {
          width: node.position.width,
          height: node.position.height
        }
      ])
    )

    if (!firstIsland) {
      throw new Error('Expected first selected node DOM island')
    }

    fireEvent.pointerDown(resizeHandle, {
      button: 0,
      pointerId: 74,
      clientX: 720,
      clientY: 460
    })
    fireEvent.pointerMove(surface, {
      pointerId: 74,
      clientX: 756,
      clientY: 484
    })

    selectedNodes.forEach((node) => {
      const current = nodes.get(node.id)
      const initial = initialPositions.get(node.id)

      expect(current?.position.width).toBe(initial?.width)
      expect(current?.position.height).toBe(initial?.height)
    })
    expect(Number.parseFloat(firstIsland.style.width)).toBe(firstNode.position.width + 36)
    expect(Number.parseFloat(firstIsland.style.height)).toBe(firstNode.position.height + 24)
    expect(onSceneMutation).not.toHaveBeenCalled()

    fireEvent.pointerUp(surface, {
      pointerId: 74,
      clientX: 756,
      clientY: 484
    })

    selectedNodes.forEach((node) => {
      const current = nodes.get(node.id)
      const initial = initialPositions.get(node.id)

      expect(current?.position.width).toBe((initial?.width ?? 0) + 36)
      expect(current?.position.height).toBe((initial?.height ?? 0) + 24)
    })
    expect(onSceneMutation).toHaveBeenCalledOnce()
  })

  it('preserves media aspect ratio from v3 corner resize handles', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const media = createNode(
      'media',
      { x: 40, y: 40, width: 320, height: 160 },
      {
        title: 'Reference Image',
        kind: 'image'
      }
    )

    nodes.set(media.id, media)

    render(<Canvas ref={ref} doc={doc} />)

    const surface = screen.getByRole('application', { name: 'Canvas' })
    act(() => {
      ref.current?.selectNodes([media.id])
    })

    const resizeHandle = screen.getByRole('button', {
      name: 'Resize Reference Image from bottom-right'
    })
    fireEvent.pointerDown(resizeHandle, {
      button: 0,
      pointerId: 10,
      clientX: 680,
      clientY: 400
    })
    fireEvent.pointerMove(surface, {
      pointerId: 10,
      clientX: 690,
      clientY: 450
    })
    fireEvent.pointerUp(surface, {
      pointerId: 10,
      clientX: 690,
      clientY: 450
    })

    const resized = nodes.get(media.id)
    expect(resized?.position.width).toBe(420)
    expect(resized?.position.height).toBe(210)
  })

  it('applies object-specific v3 resize policy minimums', () => {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const database = createNode(
      'database',
      { x: 80, y: 80, width: 360, height: 260 },
      {
        title: 'Roadmap Database'
      }
    )

    nodes.set(database.id, database)

    render(<Canvas ref={ref} doc={doc} />)

    const surface = screen.getByRole('application', { name: 'Canvas' })
    act(() => {
      ref.current?.selectNodes([database.id])
    })

    const resizeHandle = screen.getByRole('button', {
      name: 'Resize Roadmap Database from left'
    })
    fireEvent.pointerDown(resizeHandle, {
      button: 0,
      pointerId: 11,
      clientX: 120,
      clientY: 300
    })
    fireEvent.pointerMove(surface, {
      pointerId: 11,
      clientX: 340,
      clientY: 300
    })
    fireEvent.pointerUp(surface, {
      pointerId: 11,
      clientX: 340,
      clientY: 300
    })

    const resized = nodes.get(database.id)
    expect(resized?.position.x).toBe(120)
    expect(resized?.position.width).toBe(320)
  })

  it('keeps every resize handle valid across images, PDFs, embeds, pages, databases, notes, frames, and shapes', () => {
    const frameBase = createCanvasFrameVariantNode({
      title: 'Resizable Frame',
      viewport: { x: 0, y: 0, zoom: 1 },
      variant: 'standard'
    })
    const resizeNodes: CanvasNode[] = [
      createNode(
        'media',
        { x: 100, y: 100, width: 640, height: 360 },
        {
          title: 'Resizable Image',
          kind: 'image',
          mimeType: 'image/png'
        }
      ),
      createNode(
        'media',
        { x: 100, y: 100, width: 360, height: 520 },
        {
          title: 'Resizable PDF',
          kind: 'pdf',
          mimeType: 'application/pdf'
        }
      ),
      createNode(
        'external-reference',
        { x: 100, y: 100, width: 480, height: 270 },
        {
          title: 'Resizable Embed',
          provider: 'youtube',
          kind: 'video'
        }
      ),
      createNode('page', { x: 100, y: 100, width: 360, height: 240 }, { title: 'Resizable Page' }),
      createNode(
        'database',
        { x: 100, y: 100, width: 460, height: 320 },
        { title: 'Resizable Database' }
      ),
      createNode('note', { x: 100, y: 100, width: 280, height: 180 }, { title: 'Resizable Note' }),
      {
        ...frameBase,
        id: 'resizable-frame',
        position: { x: 100, y: 100, width: 520, height: 360 }
      },
      createNode('shape', { x: 100, y: 100, width: 260, height: 180 }, { title: 'Resizable Shape' })
    ]

    for (const node of resizeNodes) {
      for (const handle of TEST_RESIZE_HANDLES) {
        const policy = getCanvasResizePolicy(node, handle)
        const update = createResizeUpdate(node, handle, { x: 48, y: 36 }, policy)
        const nextPosition = update.position as {
          x: number
          y: number
          width: number
          height: number
        }
        const touchesLeft = handle === 'left' || handle === 'top-left' || handle === 'bottom-left'
        const touchesTop = handle === 'top' || handle === 'top-left' || handle === 'top-right'

        expect(update.id).toBe(node.id)
        expect(Number.isFinite(nextPosition.x)).toBe(true)
        expect(Number.isFinite(nextPosition.y)).toBe(true)
        expect(Number.isFinite(nextPosition.width)).toBe(true)
        expect(Number.isFinite(nextPosition.height)).toBe(true)
        expect(nextPosition.width).toBeGreaterThanOrEqual(policy.minWidth ?? 96)
        expect(nextPosition.height).toBeGreaterThanOrEqual(policy.minHeight ?? 72)

        if (touchesLeft) {
          expect(nextPosition.x).not.toBe(node.position.x)
        } else {
          expect(nextPosition.x).toBe(node.position.x)
        }

        if (touchesTop) {
          expect(nextPosition.y).not.toBe(node.position.y)
        } else {
          expect(nextPosition.y).toBe(node.position.y)
        }
      }
    }
  })

  it('scales DOM island content with the canvas viewport', () => {
    const doc = createCanvasTestDoc()

    render(
      <Canvas
        doc={doc}
        initialViewport={{ x: 0, y: 0, zoom: 0.5 }}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const pageIsland = screen.getByText('Research Page').closest('[data-canvas-v3-object="true"]')

    expect(pageIsland).toBeTruthy()
    expect((pageIsland as HTMLElement).style.width).toBe('260px')
    expect((pageIsland as HTMLElement).style.height).toBe('160px')
    expect((pageIsland as HTMLElement).style.transform).toBe('scale(0.5)')
  })

  it('tracks live iframe budget separately from live DOM document budget', () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)

    Array.from({ length: 10 }, (_, index) => {
      const node = createNode(
        'external-reference',
        { x: index * 36 - 180, y: index * 12 - 60, width: 360, height: 180 },
        {
          title: `Video ${index}`,
          url: `https://www.youtube.com/watch?v=video${index}`,
          provider: 'youtube',
          embedUrl: `https://www.youtube.com/embed/video${index}`
        }
      )

      nodes.set(node.id, node)
      return node
    })

    render(
      <Canvas doc={doc} renderNode={(node) => <span>{node.properties.title as string}</span>} />
    )

    const surface = screen.getByRole('application', { name: 'Canvas' })
    const liveIframeIslands = document.querySelectorAll('[data-canvas-live-iframe="true"]')

    expect(surface.getAttribute('data-canvas-dom-live-count')).toBe('0')
    expect(surface.getAttribute('data-canvas-dom-live-iframe-count')).toBe('8')
    expect(liveIframeIslands).toHaveLength(8)
  })

  it('requires provider allow policies before activating live iframes', () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const allowed = createNode(
      'external-reference',
      { x: -120, y: -80, width: 360, height: 180 },
      {
        title: 'Allowed video',
        provider: 'youtube',
        embedUrl: 'https://www.youtube.com/embed/allowed'
      }
    )
    const spoofed = createNode(
      'external-reference',
      { x: 260, y: -80, width: 360, height: 180 },
      {
        title: 'Spoofed video',
        provider: 'youtube',
        embedUrl: 'https://evil.example.com/embed/spoofed'
      }
    )

    nodes.set(allowed.id, allowed)
    nodes.set(spoofed.id, spoofed)

    render(
      <Canvas doc={doc} renderNode={(node) => <span>{node.properties.title as string}</span>} />
    )

    const surface = screen.getByRole('application', { name: 'Canvas' })
    const liveIframeIslands = document.querySelectorAll('[data-canvas-live-iframe="true"]')

    expect(surface.getAttribute('data-canvas-dom-live-iframe-count')).toBe('1')
    expect(liveIframeIslands).toHaveLength(1)
    expect(liveIframeIslands[0]?.textContent).toContain('Allowed video')
  })

  it('exposes media, live embed, status, and connector labels to assistive technology', () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const connectors = getCanvasConnectorsMap<CanvasEdge>(doc)
    const media = createNode(
      'media',
      { x: -220, y: -120, width: 240, height: 160 },
      {
        title: 'Blocked file',
        kind: 'file',
        status: 'blocked'
      }
    )
    const embed = createNode(
      'external-reference',
      { x: 160, y: -120, width: 360, height: 180 },
      {
        title: 'Launch video',
        provider: 'youtube',
        embedUrl: 'https://www.youtube.com/embed/launch'
      }
    )
    const edge = {
      ...createEdge(media.id, embed.id),
      relationship: createCanvasEdgeRelationship({
        kind: 'references',
        label: 'Opens'
      })
    }

    nodes.set(media.id, media)
    nodes.set(embed.id, embed)
    connectors.set(edge.id, edge)

    render(<Canvas doc={doc} />)

    const surface = screen.getByRole('application', { name: 'Canvas' })
    const mediaIsland = screen.getByRole('group', { name: /Media card, Blocked file/ })
    const embedIsland = screen.getByRole('group', { name: /Live embed/ }) as HTMLElement

    expect(mediaIsland.getAttribute('aria-roledescription')).toBe('canvas media card')
    expect(mediaIsland.getAttribute('aria-label')).toContain('Status: Blocked')
    expect(screen.getByText('Blocked')).toBeTruthy()
    expect(embedIsland.getAttribute('aria-roledescription')).toBe('canvas embed')
    expect(embedIsland.getAttribute('aria-describedby')).toContain('canvas-v3-live-iframe-help')
    expect(screen.getByRole('img', { name: 'Connector label Opens' })).toBeTruthy()

    embedIsland.focus()
    fireEvent.keyDown(embedIsland, { key: 'Escape' })

    expect(document.activeElement).toBe(surface)
  })

  it('uses vector summaries instead of React card shells at placeholder zoom', () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)

    Array.from({ length: 120 }, (_, index) => {
      const node = createNode(
        index % 3 === 0 ? 'media' : index % 3 === 1 ? 'external-reference' : 'database',
        { x: (index % 20) * 180, y: Math.floor(index / 20) * 140, width: 160, height: 100 },
        {
          title: `Summary ${index}`,
          provider: index % 3 === 1 ? 'youtube' : undefined,
          url: index % 3 === 1 ? `https://www.youtube.com/watch?v=video${index}` : undefined
        }
      )

      nodes.set(node.id, node)
      return node
    })

    render(
      <Canvas
        doc={doc}
        initialViewport={{ x: 1_700, y: 350, zoom: 0.05 }}
        renderNode={(node) => <span>{node.properties.title as string}</span>}
      />
    )

    const surface = screen.getByRole('application', { name: 'Canvas' })

    expect(surface.getAttribute('data-canvas-object-count')).toBe('120')
    expect(surface.getAttribute('data-canvas-dom-live-count')).toBe('0')
    expect(surface.getAttribute('data-canvas-dom-shell-count')).toBe('0')
    expect(surface.getAttribute('data-canvas-dom-live-iframe-count')).toBe('0')
    expect(document.querySelectorAll('[data-canvas-v3-object="true"]')).toHaveLength(0)
    expect(
      document.querySelectorAll('[data-canvas-v3-vector-fallback="true"]').length
    ).toBeGreaterThan(0)
  })

  it('creates tile summaries from the temporary flat-doc migration adapter', () => {
    const scene = readCanvasV3MigrationSceneFromFlatDoc(createCanvasTestDoc())

    expect(scene.objects).toHaveLength(2)
    expect(scene.connectors).toHaveLength(1)
    expect(scene.minimapSummary.totalObjectCount).toBe(2)
    expect(scene.summaries.reduce((total, summary) => total + summary.objectCount, 0)).toBe(2)
  })

  it('summarizes all current v3 canvas object kinds for the minimap', () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const kinds = [
      'page',
      'database',
      'note',
      'external-reference',
      'media',
      'shape',
      'group'
    ] as const

    kinds.forEach((kind, index) => {
      nodes.set(
        `${kind}-${index}`,
        createNode(
          kind,
          { x: index * 180, y: index * 120, width: 140, height: 90 },
          {
            title: kind,
            containerRole: kind === 'group' ? 'frame' : undefined
          }
        )
      )
    })

    const scene = readCanvasV3MigrationSceneFromFlatDoc(doc)
    const typeCounts = scene.summaries.reduce<Record<string, number>>((counts, summary) => {
      Object.entries(summary.typeCounts).forEach(([kind, count]) => {
        counts[kind] = (counts[kind] ?? 0) + count
      })

      return counts
    }, {})

    expect(scene.minimapSummary.totalObjectCount).toBe(kinds.length)
    kinds.forEach((kind) => {
      expect(typeCounts[kind]).toBe(1)
    })
  })

  it('keeps a live DOM editor mounted while far-field summaries refresh', async () => {
    const doc = createCanvasTestDoc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const editingNode = Array.from(nodes.values()).find((node) => node.sourceNodeId)

    if (!editingNode) {
      throw new Error('Expected a source-backed node for live editing')
    }

    render(
      <Canvas
        doc={doc}
        presenceIntent={{ activity: 'editing', editingNodeId: editingNode.id }}
        renderNode={(node) => (
          <input
            aria-label={`${node.properties.title as string} live editor`}
            defaultValue={node.properties.title as string}
          />
        )}
      />
    )

    const editor = screen.getByLabelText('Research Page live editor') as HTMLInputElement
    const island = editor.closest('[data-canvas-v3-object="true"]')
    fireEvent.change(editor, { target: { value: 'Draft title' } })

    expect(island?.getAttribute('data-canvas-dom-island-tier')).toBe('live-dom')

    await act(async () => {
      await Promise.resolve()
      nodes.set(
        'far-summary-object',
        createNode(
          'shape',
          { x: 24_000, y: 24_000, width: 180, height: 120 },
          { title: 'Far Summary Object' }
        )
      )
    })

    const refreshedEditor = screen.getByLabelText('Research Page live editor') as HTMLInputElement
    const surface = screen.getByRole('application', { name: 'Canvas' })

    expect(refreshedEditor).toBe(editor)
    expect(refreshedEditor.value).toBe('Draft title')
    expect(refreshedEditor.closest('[data-canvas-v3-object="true"]')).toBe(island)
    expect(island?.getAttribute('data-canvas-dom-island-tier')).toBe('live-dom')
    expect(surface.getAttribute('data-canvas-object-count')).toBe('3')
  })
})

describe('Canvas v3 pinch zoom', () => {
  function renderPinchSurface() {
    const doc = createCanvasTestDoc()
    const ref = React.createRef<CanvasHandle>()

    render(<Canvas ref={ref} doc={doc} />)

    const surface = screen.getByRole('application', { name: 'Canvas' })
    act(() => {
      ref.current?.setViewportSnapshot({ x: 0, y: 0, zoom: 1 })
    })

    return { doc, ref, surface }
  }

  it('zooms with a two-finger touch pinch and hands off to a single-finger pan', () => {
    const { ref, surface } = renderPinchSurface()

    fireEvent.pointerDown(surface, {
      button: 0,
      pointerId: 11,
      pointerType: 'touch',
      clientX: 430,
      clientY: 320
    })
    fireEvent.pointerDown(surface, {
      button: 0,
      pointerId: 12,
      pointerType: 'touch',
      clientX: 530,
      clientY: 320
    })
    fireEvent.pointerMove(surface, {
      pointerId: 11,
      pointerType: 'touch',
      clientX: 380,
      clientY: 320
    })
    fireEvent.pointerMove(surface, {
      pointerId: 12,
      pointerType: 'touch',
      clientX: 580,
      clientY: 320
    })

    const pinched = ref.current?.getViewportSnapshot()
    expect(pinched?.zoom).toBeCloseTo(2)
    expect(pinched?.x).toBeCloseTo(0)
    expect(pinched?.y).toBeCloseTo(0)

    fireEvent.pointerUp(surface, {
      pointerId: 12,
      pointerType: 'touch',
      clientX: 580,
      clientY: 320
    })
    fireEvent.pointerMove(surface, {
      pointerId: 11,
      pointerType: 'touch',
      clientX: 360,
      clientY: 300
    })

    const panned = ref.current?.getViewportSnapshot()
    expect(panned?.zoom).toBeCloseTo(2)
    expect(panned?.x).toBeCloseTo(10)
    expect(panned?.y).toBeCloseTo(10)

    fireEvent.pointerUp(surface, {
      pointerId: 11,
      pointerType: 'touch',
      clientX: 360,
      clientY: 300
    })
  })

  it('converts a touch node drag into a pinch when a second finger lands', () => {
    const { doc, ref, surface } = renderPinchSurface()
    const pageIsland = screen.getByText('Research Page').closest('[data-canvas-v3-object="true"]')
    if (!pageIsland) {
      throw new Error('Expected Research Page DOM island')
    }

    const nodeBefore = JSON.stringify(getNodeByTitle(doc, 'Research Page'))

    fireEvent.pointerDown(pageIsland, {
      button: 0,
      pointerId: 21,
      pointerType: 'touch',
      clientX: 480,
      clientY: 320
    })
    fireEvent.pointerMove(surface, {
      pointerId: 21,
      pointerType: 'touch',
      clientX: 500,
      clientY: 340
    })
    fireEvent.pointerDown(surface, {
      button: 0,
      pointerId: 22,
      pointerType: 'touch',
      clientX: 600,
      clientY: 340
    })
    fireEvent.pointerMove(surface, {
      pointerId: 22,
      pointerType: 'touch',
      clientX: 700,
      clientY: 340
    })
    fireEvent.pointerUp(surface, {
      pointerId: 21,
      pointerType: 'touch',
      clientX: 500,
      clientY: 340
    })
    fireEvent.pointerUp(surface, {
      pointerId: 22,
      pointerType: 'touch',
      clientX: 700,
      clientY: 340
    })

    expect(ref.current?.getViewportSnapshot().zoom).toBeCloseTo(2)
    expect(JSON.stringify(getNodeByTitle(doc, 'Research Page'))).toBe(nodeBefore)
  })

  it('zooms with ctrl+wheel trackpad pinches around the cursor', () => {
    const { ref, surface } = renderPinchSurface()

    fireEvent.wheel(surface, { ctrlKey: true, deltaY: -12, clientX: 480, clientY: 320 })

    const centered = ref.current?.getViewportSnapshot()
    expect(centered?.zoom).toBeCloseTo(1.144)
    expect(centered?.x).toBeCloseTo(0)
    expect(centered?.y).toBeCloseTo(0)

    fireEvent.wheel(surface, { ctrlKey: true, deltaY: -12, clientX: 960, clientY: 320 })

    const offCenter = ref.current?.getViewportSnapshot()
    expect(offCenter?.zoom).toBeCloseTo(1.144 * 1.144)
    expect(offCenter?.x).toBeGreaterThan(0)
  })

  it('zooms with Safari trackpad gesture events', () => {
    const { ref, surface } = renderPinchSurface()

    const dispatchGesture = (type: string, scale: number) => {
      const gesture = new Event(type, { cancelable: true })
      Object.assign(gesture, { scale, clientX: 480, clientY: 320 })
      act(() => {
        surface.dispatchEvent(gesture)
      })
    }

    dispatchGesture('gesturestart', 1)
    dispatchGesture('gesturechange', 1.5)
    expect(ref.current?.getViewportSnapshot().zoom).toBeCloseTo(1.5)

    dispatchGesture('gesturechange', 3)
    expect(ref.current?.getViewportSnapshot().zoom).toBeCloseTo(3)

    dispatchGesture('gestureend', 3)
    dispatchGesture('gesturestart', 1)
    dispatchGesture('gesturechange', 1.2)
    expect(ref.current?.getViewportSnapshot().zoom).toBeCloseTo(3.6)
  })
})
