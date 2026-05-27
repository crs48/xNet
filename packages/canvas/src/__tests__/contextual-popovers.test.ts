import type { CanvasNode } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createCanvasContextPopoverDefinitions,
  getEnabledCanvasContextPopovers
} from '../selection/contextual-popovers'

function createNode(input: Partial<CanvasNode> & Pick<CanvasNode, 'id' | 'type'>): CanvasNode {
  return {
    position: { x: 0, y: 0, width: 240, height: 160 },
    properties: {},
    ...input
  } as CanvasNode
}

describe('contextual popovers', () => {
  it('enables dimensions, media, PDF, alias, references, and comments for a selected PDF', () => {
    const node = createNode({
      id: 'pdf-1',
      type: 'media',
      sourceNodeId: 'source-pdf-1',
      properties: {
        kind: 'pdf',
        mimeType: 'application/pdf'
      }
    })

    expect(
      getEnabledCanvasContextPopovers({
        nodes: [node],
        hasAliasHandler: true,
        hasReferencesPanel: true,
        hasCommentHandler: true
      }).map((definition) => definition.kind)
    ).toEqual(['style', 'dimensions', 'crop-fit', 'pdf-page', 'alias', 'references', 'comments'])
  })

  it('disables editing popovers for locked nodes while keeping comments available', () => {
    const node = createNode({
      id: 'shape-1',
      type: 'shape',
      locked: true
    })
    const definitions = createCanvasContextPopoverDefinitions({
      nodes: [node],
      hasCommentHandler: true
    })

    expect(definitions.find((definition) => definition.kind === 'dimensions')).toMatchObject({
      enabled: false,
      reason: 'Select one unlocked object to edit dimensions.'
    })
    expect(definitions.find((definition) => definition.kind === 'comments')).toMatchObject({
      enabled: true
    })
  })

  it('enables edge type popovers for selected edges or two selected objects', () => {
    const first = createNode({ id: 'node-1', type: 'page' })
    const second = createNode({ id: 'node-2', type: 'database' })

    expect(
      getEnabledCanvasContextPopovers({
        nodes: [first, second]
      }).some((definition) => definition.kind === 'edge-type')
    ).toBe(true)
    expect(
      getEnabledCanvasContextPopovers({
        nodes: [],
        edgeIds: ['edge-1']
      }).some((definition) => definition.kind === 'edge-type')
    ).toBe(true)
  })

  it('enables source bulk actions for multi-source selections', () => {
    const first = createNode({ id: 'page-1', type: 'page', sourceNodeId: 'source-1' })
    const second = createNode({ id: 'page-2', type: 'page', sourceNodeId: 'source-2' })
    const shape = createNode({ id: 'shape-1', type: 'shape' })

    expect(
      getEnabledCanvasContextPopovers({
        nodes: [first, second, shape],
        hasSourceBulkActions: true
      }).some((definition) => definition.kind === 'source-bulk')
    ).toBe(true)
    expect(
      getEnabledCanvasContextPopovers({
        nodes: [first, shape],
        hasSourceBulkActions: true
      }).some((definition) => definition.kind === 'source-bulk')
    ).toBe(false)
  })

  it('detects plugin field popovers from explicit counts or node metadata', () => {
    const pluginNode = createNode({
      id: 'plugin-1',
      type: 'external-reference',
      properties: {
        pluginFields: ['accountId']
      }
    })

    expect(
      getEnabledCanvasContextPopovers({
        nodes: [pluginNode]
      }).some((definition) => definition.kind === 'plugin-fields')
    ).toBe(true)
    expect(
      getEnabledCanvasContextPopovers({
        nodes: [],
        pluginFieldCount: 2
      }).some((definition) => definition.kind === 'plugin-fields')
    ).toBe(true)
  })
})
