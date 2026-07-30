/**
 * Scene-mutation dispatcher tests for the canvas v3 renderer.
 */

import type { CanvasNode } from '../types'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import {
  applyCanvasSceneUpdates,
  mergeCanvasNodeLockUpdate,
  mergeCanvasNodePositionUpdate,
  mergeCanvasNodePropertiesUpdate
} from '../renderer/scene-mutations'
import { getCanvasObjectsMap } from '../scene/doc-layout'

function createNode(id: string, overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id,
    type: 'page',
    position: { x: 10, y: 20, width: 120, height: 80, zIndex: 0 },
    properties: { title: id },
    ...overrides
  }
}

function createDocWithNodes(nodes: readonly CanvasNode[]): Y.Doc {
  const doc = new Y.Doc()
  const objects = getCanvasObjectsMap<CanvasNode>(doc)

  doc.transact(() => {
    for (const node of nodes) {
      objects.set(node.id, node)
    }
  })

  return doc
}

describe('applyCanvasSceneUpdates', () => {
  it('returns false without touching the doc for an empty batch', () => {
    const doc = createDocWithNodes([createNode('a')])
    const onSceneMutation = vi.fn()
    const merge = vi.fn(mergeCanvasNodeLockUpdate)

    const changed = applyCanvasSceneUpdates({ doc, updates: [], merge, onSceneMutation })

    expect(changed).toBe(false)
    expect(merge).not.toHaveBeenCalled()
    expect(onSceneMutation).not.toHaveBeenCalled()
  })

  it('skips updates whose node is missing and stays silent when nothing changed', () => {
    const doc = createDocWithNodes([createNode('a')])
    const onSceneMutation = vi.fn()

    const changed = applyCanvasSceneUpdates({
      doc,
      updates: [{ id: 'ghost', locked: true }],
      merge: mergeCanvasNodeLockUpdate,
      onSceneMutation
    })

    expect(changed).toBe(false)
    expect(onSceneMutation).not.toHaveBeenCalled()
    expect(getCanvasObjectsMap<CanvasNode>(doc).get('a')?.locked).toBeUndefined()
  })

  it('applies every matched update and notifies onSceneMutation once', () => {
    const doc = createDocWithNodes([createNode('a'), createNode('b')])
    const onSceneMutation = vi.fn()

    const changed = applyCanvasSceneUpdates({
      doc,
      updates: [
        { id: 'a', locked: true },
        { id: 'ghost', locked: true },
        { id: 'b', locked: true }
      ],
      merge: mergeCanvasNodeLockUpdate,
      onSceneMutation
    })

    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    expect(changed).toBe(true)
    expect(onSceneMutation).toHaveBeenCalledTimes(1)
    expect(objects.get('a')?.locked).toBe(true)
    expect(objects.get('b')?.locked).toBe(true)
  })

  it('batches the whole update set into a single doc transaction', () => {
    const doc = createDocWithNodes([createNode('a'), createNode('b')])
    let updateEvents = 0
    doc.on('update', () => {
      updateEvents += 1
    })

    applyCanvasSceneUpdates({
      doc,
      updates: [
        { id: 'a', locked: true },
        { id: 'b', locked: false }
      ],
      merge: mergeCanvasNodeLockUpdate
    })

    expect(updateEvents).toBe(1)
  })
})

describe('mergeCanvasNodePositionUpdate', () => {
  it('merges partial positions over the existing position', () => {
    const node = createNode('a')

    const next = mergeCanvasNodePositionUpdate(node, { id: 'a', position: { x: 300 } })

    expect(next.position).toEqual({ x: 300, y: 20, width: 120, height: 80, zIndex: 0 })
    expect(node.position.x).toBe(10)
  })
})

describe('mergeCanvasNodeLockUpdate', () => {
  it('replaces the lock flag and keeps the rest of the node', () => {
    const node = createNode('a')

    const next = mergeCanvasNodeLockUpdate(node, { id: 'a', locked: true })

    expect(next.locked).toBe(true)
    expect(next.position).toEqual(node.position)
    expect(next.properties).toEqual(node.properties)
  })
})

describe('mergeCanvasNodePropertiesUpdate', () => {
  it('merges new properties over the existing properties', () => {
    const node = createNode('a', { properties: { title: 'a', label: 'Label' } })

    const next = mergeCanvasNodePropertiesUpdate(node, {
      id: 'a',
      properties: { title: 'renamed' }
    })

    expect(next.properties).toEqual({ title: 'renamed', label: 'Label' })
    expect(node.properties.title).toBe('a')
  })
})
