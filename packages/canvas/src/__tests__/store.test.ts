/**
 * Tests for canvas store
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as Y from 'yjs'
import {
  CanvasStore,
  createCanvasStore,
  createCanvasDoc,
  createNode,
  createEdge,
  generateNodeId,
  generateEdgeId
} from '../store'
// Types used via store API

describe('CanvasStore', () => {
  let doc: Y.Doc
  let store: CanvasStore

  beforeEach(() => {
    doc = createCanvasDoc('test-canvas', 'Test Canvas')
    store = createCanvasStore(doc)
  })

  describe('node operations', () => {
    it('should add a node', () => {
      const node = createNode('card', { x: 100, y: 100 }, { title: 'Test' })
      store.addNode(node)
      expect(store.nodeCount()).toBe(1)
      expect(store.getNode(node.id)).toEqual(node)
    })

    it('should get all nodes', () => {
      const node1 = createNode('card', { x: 0, y: 0 })
      const node2 = createNode('card', { x: 100, y: 100 })
      store.addNode(node1)
      store.addNode(node2)

      const nodes = store.getNodes()
      expect(nodes).toHaveLength(2)
    })

    it('should update node position', () => {
      const node = createNode('card', { x: 0, y: 0 })
      store.addNode(node)

      store.updateNodePosition(node.id, { x: 100, y: 50 })

      const updated = store.getNode(node.id)
      expect(updated?.position.x).toBe(100)
      expect(updated?.position.y).toBe(50)
    })

    it('should update multiple node positions', () => {
      const node1 = createNode('card', { x: 0, y: 0 })
      const node2 = createNode('card', { x: 100, y: 100 })
      store.addNode(node1)
      store.addNode(node2)

      store.updateNodePositions([
        { id: node1.id, position: { x: 50 } },
        { id: node2.id, position: { y: 200 } }
      ])

      expect(store.getNode(node1.id)?.position.x).toBe(50)
      expect(store.getNode(node2.id)?.position.y).toBe(200)
    })

    it('should remove a node', () => {
      const node = createNode('card')
      store.addNode(node)
      expect(store.removeNode(node.id)).toBe(true)
      expect(store.nodeCount()).toBe(0)
    })

    it('should return false when removing non-existent node', () => {
      expect(store.removeNode('nonexistent')).toBe(false)
    })

    it('should remove connected edges when removing a node', () => {
      const node1 = createNode('card')
      const node2 = createNode('card')
      const edge = createEdge(node1.id, node2.id)

      store.addNode(node1)
      store.addNode(node2)
      store.addEdge(edge)

      store.removeNode(node1.id)
      expect(store.edgeCount()).toBe(0)
    })
  })

  describe('edge operations', () => {
    it('should add an edge', () => {
      const node1 = createNode('card')
      const node2 = createNode('card')
      const edge = createEdge(node1.id, node2.id)

      store.addNode(node1)
      store.addNode(node2)
      store.addEdge(edge)

      expect(store.edgeCount()).toBe(1)
      expect(store.getEdge(edge.id)).toEqual(edge)
    })

    it('should get all edges', () => {
      const node1 = createNode('card')
      const node2 = createNode('card')
      const node3 = createNode('card')

      store.addNode(node1)
      store.addNode(node2)
      store.addNode(node3)
      store.addEdge(createEdge(node1.id, node2.id))
      store.addEdge(createEdge(node2.id, node3.id))

      expect(store.getEdges()).toHaveLength(2)
    })

    it('should get edges for a node', () => {
      const node1 = createNode('card')
      const node2 = createNode('card')
      const node3 = createNode('card')

      store.addNode(node1)
      store.addNode(node2)
      store.addNode(node3)
      store.addEdge(createEdge(node1.id, node2.id))
      store.addEdge(createEdge(node2.id, node3.id))

      const edges = store.getNodeEdges(node2.id)
      expect(edges).toHaveLength(2)
    })

    it('should remove an edge', () => {
      const edge = createEdge('a', 'b')
      store.addEdge(edge)
      expect(store.removeEdge(edge.id)).toBe(true)
      expect(store.edgeCount()).toBe(0)
    })
  })

  describe('spatial queries', () => {
    it('should find visible nodes', () => {
      const node1 = createNode('card', { x: 0, y: 0, width: 100, height: 50 })
      const node2 = createNode('card', { x: 500, y: 500, width: 100, height: 50 })

      store.addNode(node1)
      store.addNode(node2)

      const visible = store.getVisibleNodes({ x: -50, y: -50, width: 200, height: 200 })
      expect(visible).toHaveLength(1)
      expect(visible[0].id).toBe(node1.id)
    })

    it('should find node at point', () => {
      const node = createNode('card', { x: 0, y: 0, width: 100, height: 50 })
      store.addNode(node)

      const found = store.findNodeAt(50, 25)
      expect(found?.id).toBe(node.id)
    })

    it('should return undefined for empty area', () => {
      const node = createNode('card', { x: 0, y: 0, width: 100, height: 50 })
      store.addNode(node)

      const found = store.findNodeAt(500, 500)
      expect(found).toBeUndefined()
    })

    it('should get bounds of all nodes', () => {
      const node1 = createNode('card', { x: 0, y: 0, width: 100, height: 50 })
      const node2 = createNode('card', { x: 200, y: 100, width: 50, height: 50 })

      store.addNode(node1)
      store.addNode(node2)

      const bounds = store.getBounds()
      expect(bounds).toEqual({ x: 0, y: 0, width: 250, height: 150 })
    })
  })

  describe('metadata', () => {
    it('should get canvas title', () => {
      expect(store.getTitle()).toBe('Test Canvas')
    })

    it('should set canvas title', () => {
      store.setTitle('New Title')
      expect(store.getTitle()).toBe('New Title')
    })
  })

  describe('events', () => {
    it('should notify on node changes', () => {
      const events: string[] = []
      store.subscribe((event) => {
        events.push(event.type)
      })

      const node = createNode('card')
      store.addNode(node)

      // Store triggers update event via Y.Map observer
      expect(events.length).toBeGreaterThan(0)
    })
  })

  describe('clear', () => {
    it('should remove all nodes and edges', () => {
      const node1 = createNode('card')
      const node2 = createNode('card')
      store.addNode(node1)
      store.addNode(node2)
      store.addEdge(createEdge(node1.id, node2.id))

      store.clear()
      expect(store.nodeCount()).toBe(0)
      expect(store.edgeCount()).toBe(0)
    })
  })
})

describe('helper functions', () => {
  describe('generateNodeId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateNodeId()
      const id2 = generateNodeId()
      expect(id1).not.toBe(id2)
    })

    it('should start with "node_"', () => {
      expect(generateNodeId()).toMatch(/^node_/)
    })
  })

  describe('generateEdgeId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateEdgeId()
      const id2 = generateEdgeId()
      expect(id1).not.toBe(id2)
    })

    it('should start with "edge_"', () => {
      expect(generateEdgeId()).toMatch(/^edge_/)
    })
  })

  describe('createNode', () => {
    it('should create node with defaults', () => {
      const node = createNode('card')
      expect(node.id).toBeDefined()
      expect(node.type).toBe('card')
      expect(node.position.x).toBe(0)
      expect(node.position.y).toBe(0)
      expect(node.position.width).toBe(200)
      expect(node.position.height).toBe(100)
    })

    it('should accept custom position', () => {
      const node = createNode('card', { x: 100, y: 50, width: 300 })
      expect(node.position.x).toBe(100)
      expect(node.position.y).toBe(50)
      expect(node.position.width).toBe(300)
    })

    it('should accept properties', () => {
      const node = createNode('card', {}, { title: 'My Card' })
      expect(node.properties.title).toBe('My Card')
    })
  })

  describe('createEdge', () => {
    it('should create edge between nodes', () => {
      const edge = createEdge('source', 'target')
      expect(edge.id).toBeDefined()
      expect(edge.sourceId).toBe('source')
      expect(edge.targetId).toBe('target')
    })

    it('should accept optional properties', () => {
      const edge = createEdge('source', 'target', {
        label: 'connects to',
        style: { stroke: '#ff0000' }
      })
      expect(edge.label).toBe('connects to')
      expect(edge.style?.stroke).toBe('#ff0000')
    })
  })

  describe('createCanvasDoc', () => {
    it('should create a Y.Doc with metadata', () => {
      const doc = createCanvasDoc('canvas-1', 'My Canvas')
      expect(doc.guid).toBe('canvas-1')

      const meta = doc.getMap('metadata')
      expect(meta.get('title')).toBe('My Canvas')
      expect(meta.get('created')).toBeDefined()
    })
  })
})
