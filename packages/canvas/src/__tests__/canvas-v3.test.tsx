/**
 * Canvas v3 active renderer tests.
 */

import type { CanvasHandle, CanvasNode } from '../index'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import {
  Canvas,
  createEdge,
  createNode,
  getCanvasConnectorsMap,
  getCanvasObjectsMap
} from '../index'
import { readCanvasV3MigrationSceneFromFlatDoc } from '../scene/flat-doc-v3-migration'

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

  it('routes creation shortcuts through app entry callbacks', () => {
    const doc = createCanvasTestDoc()
    const onCreateObject = vi.fn()

    render(<Canvas doc={doc} onCreateObject={onCreateObject} />)

    const surface = screen.getByRole('application', { name: 'Canvas' })
    fireEvent.keyDown(surface, { key: 'r' })
    fireEvent.keyDown(surface, { key: 'f' })
    fireEvent.keyDown(surface, { key: 'n' })

    expect(onCreateObject).toHaveBeenNthCalledWith(1, 'shape')
    expect(onCreateObject).toHaveBeenNthCalledWith(2, 'frame')
    expect(onCreateObject).toHaveBeenNthCalledWith(3, 'note')
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
