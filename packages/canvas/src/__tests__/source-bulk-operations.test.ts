import type { CanvasNode } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createCanvasSourceBulkOperationDefinitions,
  createCanvasSourceBulkOperationPlan,
  getCanvasSourceBackedCardRef,
  getCanvasSourceBackedSelection,
  isCanvasSourceBackedNode
} from '../selection/source-bulk-operations'

function createNode(input: Partial<CanvasNode> & Pick<CanvasNode, 'id' | 'type'>): CanvasNode {
  return {
    position: { x: 0, y: 0, width: 240, height: 160 },
    properties: {},
    ...input
  } as CanvasNode
}

describe('source-backed selection bulk operations', () => {
  it('identifies source-backed cards and normalizes source refs', () => {
    const externalReference = createNode({
      id: 'youtube-card',
      type: 'external-reference',
      sourceNodeId: 'external-ref-source',
      sourceSchemaId: 'xnet://xnet.fyi/ExternalReference@1.0.0',
      alias: 'Launch video',
      properties: {
        title: 'Original title',
        url: 'https://youtube.com/watch?v=abc',
        provider: 'youtube',
        kind: 'video'
      }
    })
    const legacyPage = createNode({
      id: 'legacy-page',
      type: 'page',
      linkedNodeId: 'page-source',
      properties: { title: 'Planning page' }
    })
    const shape = createNode({ id: 'shape-1', type: 'shape' })

    expect(isCanvasSourceBackedNode(externalReference)).toBe(true)
    expect(isCanvasSourceBackedNode(shape)).toBe(false)
    expect(getCanvasSourceBackedSelection([shape, externalReference, legacyPage])).toEqual([
      {
        canvasNodeId: 'youtube-card',
        sourceNodeId: 'external-ref-source',
        sourceSchemaId: 'xnet://xnet.fyi/ExternalReference@1.0.0',
        sourceUri: 'https://youtube.com/watch?v=abc',
        title: 'Launch video',
        type: 'external-reference',
        provider: 'youtube',
        kind: 'video',
        locked: false
      },
      {
        canvasNodeId: 'legacy-page',
        sourceNodeId: 'page-source',
        sourceUri: 'xnet://node/page-source',
        title: 'Planning page',
        type: 'page',
        locked: false
      }
    ])
    expect(getCanvasSourceBackedCardRef(shape)).toBeNull()
  })

  it('derives availability definitions for selected source-backed cards', () => {
    const nodes = [
      createNode({
        id: 'page-1',
        type: 'page',
        sourceNodeId: 'source-1'
      }),
      createNode({
        id: 'page-2',
        type: 'page',
        sourceNodeId: 'source-2',
        locked: true
      })
    ]

    const definitions = createCanvasSourceBulkOperationDefinitions({
      nodes,
      canCopySourceLinks: false
    })

    expect(definitions.find((definition) => definition.kind === 'open-sources')).toMatchObject({
      enabled: true,
      sourceCount: 2,
      affectedCanvasNodeIds: ['page-1', 'page-2']
    })
    expect(definitions.find((definition) => definition.kind === 'copy-source-links')).toMatchObject(
      {
        enabled: false,
        reason: 'Clipboard access is unavailable.'
      }
    )
    expect(definitions.find((definition) => definition.kind === 'set-status')).toMatchObject({
      enabled: true,
      sourceCount: 1,
      affectedCanvasNodeIds: ['page-1']
    })
  })

  it('creates metadata update plans while skipping locked and non-source cards', () => {
    const nodes = [
      createNode({
        id: 'account-card',
        type: 'external-reference',
        sourceNodeId: 'account-source',
        properties: {
          title: 'Account',
          tags: ['enterprise', 'renewal']
        }
      }),
      createNode({
        id: 'invoice-card',
        type: 'external-reference',
        sourceNodeId: 'invoice-source',
        locked: true,
        properties: {
          title: 'Invoice',
          tags: ['finance']
        }
      }),
      createNode({ id: 'shape-1', type: 'shape' })
    ]

    expect(
      createCanvasSourceBulkOperationPlan(nodes, {
        kind: 'add-tags',
        tags: ['review', 'enterprise', '']
      })
    ).toMatchObject({
      skippedNodeIds: ['shape-1'],
      lockedNodeIds: ['invoice-card'],
      updates: [
        {
          id: 'account-card',
          properties: {
            tags: ['enterprise', 'renewal', 'review']
          }
        }
      ],
      actions: [],
      warnings: ['1 locked source-backed card(s) were skipped.']
    })

    expect(
      createCanvasSourceBulkOperationPlan(nodes, {
        kind: 'set-status',
        status: 'Needs review'
      }).updates
    ).toEqual([
      {
        id: 'account-card',
        properties: {
          status: 'Needs review'
        }
      }
    ])
  })

  it('creates external action plans and display updates for selected sources', () => {
    const nodes = [
      createNode({
        id: 'video-card',
        type: 'external-reference',
        sourceNodeId: 'video-source',
        sourceSchemaId: 'external-reference',
        properties: {
          url: 'https://youtu.be/abc'
        }
      }),
      createNode({
        id: 'row-card',
        type: 'database',
        sourceNodeId: 'row-source',
        locked: true
      })
    ]

    expect(createCanvasSourceBulkOperationPlan(nodes, { kind: 'open-sources' }).actions).toEqual([
      {
        kind: 'open-source',
        canvasNodeId: 'video-card',
        sourceNodeId: 'video-source',
        sourceSchemaId: 'external-reference',
        sourceUri: 'https://youtu.be/abc'
      },
      {
        kind: 'open-source',
        canvasNodeId: 'row-card',
        sourceNodeId: 'row-source',
        sourceUri: 'xnet://node/row-source'
      }
    ])
    expect(
      createCanvasSourceBulkOperationPlan(
        nodes,
        { kind: 'set-display-density', previewDensity: 'far' },
        { respectLocks: false }
      ).updates
    ).toEqual([
      {
        id: 'video-card',
        display: { previewDensity: 'far' }
      },
      {
        id: 'row-card',
        display: { previewDensity: 'far' }
      }
    ])
  })
})
