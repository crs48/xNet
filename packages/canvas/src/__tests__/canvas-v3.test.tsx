/**
 * Canvas v3 active renderer tests.
 */

import type { CanvasHandle, CanvasNode } from '../index'
import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { Canvas, createEdge, createNode, getCanvasObjectsMap } from '../index'
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
