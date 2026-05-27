/**
 * Mind-map branch visibility and style helper tests.
 */

import { describe, expect, it } from 'vitest'
import { createNode, type CanvasNode } from '../index'
import {
  createCanvasMindMapCollapseUpdates,
  createCanvasMindMapInheritedStyleMap,
  createCanvasMindMapInheritedStyleUpdates,
  createCanvasMindMapVisibilityState,
  getCanvasMindMapDescendantIds,
  getCanvasMindMapMetadata,
  resolveCanvasMindMapBranchStyle
} from '../mind-map/branches'
import {
  createCanvasMindMapBranchProperties,
  createCanvasMindMapRootProperties
} from '../mind-map/creation'

function createMindMapNode(
  id: string,
  properties: CanvasNode['properties'],
  x: number
): CanvasNode {
  return {
    ...createNode('shape', { x, y: 0, width: 220, height: 88 }, properties),
    id
  }
}

function createFixtureNodes(): CanvasNode[] {
  const rootProperties = createCanvasMindMapRootProperties({
    title: 'Plan',
    mapId: 'mindmap-plan'
  })
  const branchAProperties = createCanvasMindMapBranchProperties({
    title: 'Branch A',
    mapId: rootProperties.mindMap.mapId,
    parentId: 'root',
    depth: 1,
    index: 0
  })
  const branchBProperties = createCanvasMindMapBranchProperties({
    title: 'Branch B',
    mapId: rootProperties.mindMap.mapId,
    parentId: 'root',
    depth: 1,
    index: 1
  })
  const leafProperties = createCanvasMindMapBranchProperties({
    title: 'Leaf',
    mapId: rootProperties.mindMap.mapId,
    parentId: 'branch-a',
    depth: 2,
    index: 0
  })

  return [
    createMindMapNode('root', rootProperties, 0),
    createMindMapNode('branch-a', branchAProperties, 260),
    createMindMapNode('branch-b', branchBProperties, 260),
    createMindMapNode('leaf', leafProperties, 520)
  ]
}

describe('mind map branch metadata', () => {
  it('reads valid mind-map metadata from canvas nodes', () => {
    const [root] = createFixtureNodes()

    expect(getCanvasMindMapMetadata(root)).toEqual(
      expect.objectContaining({
        mapId: 'mindmap-plan',
        role: 'root',
        collapsed: false
      })
    )
    expect(
      getCanvasMindMapMetadata(createNode('shape', { x: 0, y: 0, width: 100, height: 80 }, {}))
    ).toBeNull()
  })
})

describe('mind map branch visibility', () => {
  it('returns descendants in branch order', () => {
    expect(getCanvasMindMapDescendantIds(createFixtureNodes(), 'root')).toEqual([
      'branch-a',
      'leaf',
      'branch-b'
    ])
  })

  it('hides descendants of collapsed branches while keeping the branch visible', () => {
    const nodes = createFixtureNodes()
    const [collapseUpdate] = createCanvasMindMapCollapseUpdates(nodes, 'branch-a', true)
    nodes[1] = {
      ...nodes[1],
      properties: collapseUpdate.properties
    }

    const visibility = createCanvasMindMapVisibilityState(nodes)

    expect(Array.from(visibility.collapsedBranchIds)).toEqual(['branch-a'])
    expect(Array.from(visibility.hiddenNodeIds)).toEqual(['leaf'])
    expect(Array.from(visibility.visibleNodeIds)).toEqual(['root', 'branch-a', 'branch-b'])
  })
})

describe('mind map inherited branch styles', () => {
  it('resolves style from root through branch ancestors', () => {
    const nodes = createFixtureNodes()
    nodes[0] = {
      ...nodes[0],
      properties: {
        ...nodes[0].properties,
        fill: '#dbeafe',
        stroke: '#2563eb',
        strokeWidth: 3
      }
    }
    nodes[1] = {
      ...nodes[1],
      properties: {
        ...nodes[1].properties,
        fill: '#dcfce7'
      }
    }

    expect(resolveCanvasMindMapBranchStyle(nodes, 'leaf')).toEqual({
      fill: '#dcfce7',
      stroke: '#2563eb',
      strokeWidth: 3
    })
  })

  it('creates inherited style maps and materialized updates', () => {
    const nodes = createFixtureNodes()
    nodes[0] = {
      ...nodes[0],
      properties: {
        ...nodes[0].properties,
        labelColor: '#111827',
        stroke: '#0f766e'
      }
    }

    const styles = createCanvasMindMapInheritedStyleMap(nodes)
    const updates = createCanvasMindMapInheritedStyleUpdates(nodes)

    expect(styles.get('leaf')).toEqual({
      labelColor: '#111827',
      stroke: '#0f766e'
    })
    expect(updates.map((update) => update.id)).toEqual(['branch-a', 'branch-b', 'leaf'])
    expect(updates[0]?.properties).toEqual(
      expect.objectContaining({
        labelColor: '#111827',
        stroke: '#0f766e'
      })
    )
  })
})
