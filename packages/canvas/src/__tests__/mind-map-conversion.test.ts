/**
 * Mind-map conversion command tests.
 */

import { DatabaseRowSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { createNode, type CanvasNode } from '../index'
import {
  createCanvasMindMapBranchToObjectConversionCommand,
  createCanvasNodeToMindMapBranchConversionCommand,
  getCanvasMindMapConvertibleKind
} from '../mind-map/conversion'
import {
  createCanvasMindMapBranchProperties,
  createCanvasMindMapRootProperties
} from '../mind-map/creation'

function createSourceBackedNode(
  id: string,
  type: CanvasNode['type'],
  sourceSchemaId: string,
  title: string
): CanvasNode {
  return {
    ...createNode(type, { x: 0, y: 0, width: 240, height: 120 }, { title }),
    id,
    sourceNodeId: `source-${id}`,
    sourceSchemaId
  }
}

function createMindMapBranch(): CanvasNode {
  const root = createCanvasMindMapRootProperties({
    mapId: 'mindmap-plan'
  })

  return {
    ...createNode(
      'shape',
      { x: 280, y: 0, width: 220, height: 88 },
      createCanvasMindMapBranchProperties({
        title: 'Launch checklist',
        mapId: root.mindMap.mapId,
        parentId: 'root',
        depth: 1,
        index: 2
      })
    ),
    id: 'branch'
  }
}

describe('getCanvasMindMapConvertibleKind', () => {
  it('identifies supported source-backed and mind-map nodes', () => {
    expect(
      getCanvasMindMapConvertibleKind(
        createSourceBackedNode('page', 'page', PageSchema._schemaId, 'Page')
      )
    ).toBe('page')
    expect(
      getCanvasMindMapConvertibleKind(
        createSourceBackedNode('task', 'note', TaskSchema._schemaId, 'Task')
      )
    ).toBe('task')
    expect(
      getCanvasMindMapConvertibleKind(
        createSourceBackedNode('row', 'note', DatabaseRowSchema._schemaId, 'Row')
      )
    ).toBe('database-row')
    expect(getCanvasMindMapConvertibleKind(createNode('note', {}, { title: 'Note' }))).toBe('note')
    expect(getCanvasMindMapConvertibleKind(createMindMapBranch())).toBe('mind-map-branch')
    expect(getCanvasMindMapConvertibleKind(createNode('shape'))).toBeNull()
  })
})

describe('createCanvasNodeToMindMapBranchConversionCommand', () => {
  it('creates a shape-backed branch update while preserving source references', () => {
    const page = createSourceBackedNode('page', 'page', PageSchema._schemaId, 'Launch plan')
    const command = createCanvasNodeToMindMapBranchConversionCommand({
      node: page,
      mapId: 'mindmap-plan',
      parentId: 'root',
      depth: 1,
      index: 4
    })

    expect(command.validation.valid).toBe(true)
    expect(command.sourceKind).toBe('page')
    expect(command.targetKind).toBe('mind-map-branch')
    expect(command.canvasNodeUpdate).toEqual(
      expect.objectContaining({
        id: page.id,
        type: 'shape',
        sourceNodeId: page.sourceNodeId,
        sourceSchemaId: PageSchema._schemaId,
        properties: expect.objectContaining({
          title: 'Launch plan',
          label: 'Launch plan',
          shapeType: 'rounded-rectangle',
          convertedFrom: expect.objectContaining({
            from: 'page',
            nodeId: page.id
          })
        })
      })
    )
    expect(command.canvasNodeUpdate?.properties.mindMap).toEqual(
      expect.objectContaining({
        mapId: 'mindmap-plan',
        parentId: 'root',
        depth: 1,
        index: 4
      })
    )
  })

  it('returns validation errors for unsupported nodes', () => {
    const command = createCanvasNodeToMindMapBranchConversionCommand({
      node: createNode('shape'),
      mapId: '',
      parentId: '',
      depth: 1
    })

    expect(command.validation.valid).toBe(false)
    expect(command.validation.errors).toHaveLength(3)
    expect(command.canvasNodeUpdate).toBeNull()
  })
})

describe('createCanvasMindMapBranchToObjectConversionCommand', () => {
  it('creates page and task drafts from a branch', () => {
    const branch = createMindMapBranch()
    const pageCommand = createCanvasMindMapBranchToObjectConversionCommand({
      node: branch,
      targetKind: 'page',
      sourceNodeId: 'source-page'
    })
    const taskCommand = createCanvasMindMapBranchToObjectConversionCommand({
      node: branch,
      targetKind: 'task',
      sourceNodeId: 'source-task'
    })

    expect(pageCommand.validation.valid).toBe(true)
    expect(pageCommand.sourceNodeDraft).toEqual({
      schemaId: PageSchema._schemaId,
      properties: { title: 'Launch checklist' }
    })
    expect(pageCommand.canvasNodeUpdate).toEqual(
      expect.objectContaining({
        type: 'page',
        sourceNodeId: 'source-page',
        sourceSchemaId: PageSchema._schemaId
      })
    )

    expect(taskCommand.sourceNodeDraft).toEqual({
      schemaId: TaskSchema._schemaId,
      properties: {
        title: 'Launch checklist',
        completed: false,
        status: 'todo',
        source: 'canvas'
      }
    })
    expect(taskCommand.canvasNodeUpdate).toEqual(
      expect.objectContaining({
        type: 'note',
        sourceNodeId: 'source-task',
        sourceSchemaId: TaskSchema._schemaId
      })
    )
  })

  it('requires a target database when creating database row drafts', () => {
    const invalid = createCanvasMindMapBranchToObjectConversionCommand({
      node: createMindMapBranch(),
      targetKind: 'database-row'
    })
    const valid = createCanvasMindMapBranchToObjectConversionCommand({
      node: createMindMapBranch(),
      targetKind: 'database-row',
      databaseId: 'database-1',
      sortKey: 'm'
    })

    expect(invalid.validation.valid).toBe(false)
    expect(invalid.canvasNodeUpdate).toBeNull()
    expect(valid.sourceNodeDraft).toEqual({
      schemaId: DatabaseRowSchema._schemaId,
      properties: {
        database: 'database-1',
        sortKey: 'm',
        title: 'Launch checklist'
      }
    })
    expect(valid.canvasNodeUpdate).toEqual(
      expect.objectContaining({
        type: 'note',
        sourceSchemaId: DatabaseRowSchema._schemaId
      })
    )
  })
})
