import type { CanvasEdge, CanvasNode } from '../types'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createChunkManager, createFlatCanvasChunkStore } from '../chunks'
import { getCanvasConnectorsMap, getCanvasObjectsMap } from '../scene/doc-layout'
import { Viewport } from '../spatial'

function createNode(id: string, x: number, y: number, width = 120, height = 80): CanvasNode {
  return {
    id,
    type: 'page',
    position: { x, y, width, height },
    properties: { title: id }
  }
}

function createEdge(id: string, sourceId: string, targetId: string): CanvasEdge {
  return {
    id,
    sourceId,
    targetId
  }
}

describe('FlatCanvasChunkStore', () => {
  it('loads chunk-local nodes and cross-chunk edges from flat canvas maps', async () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const edges = getCanvasConnectorsMap<CanvasEdge>(doc)

    const leftA = createNode('left-a', 100, 120)
    const leftB = createNode('left-b', 320, 200)
    const right = createNode('right', 2200, 180)

    nodes.set(leftA.id, leftA)
    nodes.set(leftB.id, leftB)
    nodes.set(right.id, right)
    edges.set('edge-local', createEdge('edge-local', leftA.id, leftB.id))
    edges.set('edge-cross', createEdge('edge-cross', leftA.id, right.id))

    const store = createFlatCanvasChunkStore(doc)

    expect(store.getNodeChunk(leftA.id)).toBe('0,0')
    expect(store.getNodeChunk(right.id)).toBe('1,0')

    const leftChunk = await store.loadChunk('0,0')
    expect(leftChunk.nodes.map((node) => node.id).sort()).toEqual(['left-a', 'left-b'])
    expect(leftChunk.edges.map((edge) => edge.id)).toEqual(['edge-local'])

    const crossEdges = await store.loadCrossChunkEdgesFor('0,0')
    expect(crossEdges.map((edge) => edge.id)).toEqual(['edge-cross'])

    store.dispose()
  })

  it('reclassifies edges when node movement changes chunk membership', async () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const edges = getCanvasConnectorsMap<CanvasEdge>(doc)

    const left = createNode('left', 120, 120)
    const right = createNode('right', 2200, 180)

    nodes.set(left.id, left)
    nodes.set(right.id, right)
    edges.set('edge-cross', createEdge('edge-cross', left.id, right.id))

    const store = createFlatCanvasChunkStore(doc)

    expect((await store.loadChunk('0,0')).edges).toHaveLength(0)
    expect((await store.loadCrossChunkEdgesFor('0,0')).map((edge) => edge.id)).toEqual([
      'edge-cross'
    ])

    store.updateNodePosition('right', {
      x: 420,
      y: 240,
      width: right.position.width,
      height: right.position.height
    })

    const localChunk = await store.loadChunk('0,0')
    expect(localChunk.nodes.map((node) => node.id).sort()).toEqual(['left', 'right'])
    expect(localChunk.edges.map((edge) => edge.id)).toEqual(['edge-cross'])
    expect(await store.loadCrossChunkEdgesFor('0,0')).toHaveLength(0)

    store.dispose()
  })

  it('persists width and height updates for nodes inserted directly into the doc', async () => {
    const doc = new Y.Doc()
    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    const store = createFlatCanvasChunkStore(doc)
    const manager = createChunkManager(store)
    const node = createNode('resizable', 120, 120, 320, 180)

    manager.updateViewport(new Viewport({ x: 0, y: 0, zoom: 1, width: 1280, height: 720 }))

    nodes.set(node.id, node)
    await manager.refreshLoadedChunks()

    manager.moveNode(node.id, {
      ...node.position,
      width: 416,
      height: 252
    })

    expect(nodes.get(node.id)?.position).toEqual({
      x: 120,
      y: 120,
      width: 416,
      height: 252
    })

    manager.dispose()
    store.dispose()
  })
})
