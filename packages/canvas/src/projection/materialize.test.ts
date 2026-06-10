import { describe, expect, it } from 'vitest'
import { materializeCanvasProjectionPlan } from './materialize'

describe('materializeCanvasProjectionPlan', () => {
  it('converts projection plan drafts into source-backed canvas nodes and semantic edges', () => {
    const projection = materializeCanvasProjectionPlan({
      nodes: [
        {
          id: 'canvas-node:self',
          type: 'external-reference',
          sourceNodeId: 'actor:self',
          sourceSchemaId: 'xnet://xnet.fyi/SocialActor@1.0.0',
          locked: false,
          position: { x: 0, y: 0, width: 260, height: 132, zIndex: 0 },
          properties: {
            title: 'Self',
            sourceCardRole: 'social-projection',
            kind: 'source-record',
            status: 'ready',
            socialKind: 'actor',
            platform: 'instagram'
          }
        },
        {
          id: 'canvas-node:creator',
          type: 'external-reference',
          sourceNodeId: 'actor:creator',
          sourceSchemaId: 'xnet://xnet.fyi/SocialActor@1.0.0',
          locked: false,
          position: { x: 356, y: 0, width: 260, height: 132, zIndex: 1 },
          properties: {
            title: 'Creator',
            sourceCardRole: 'social-projection',
            kind: 'source-record',
            status: 'ready',
            socialKind: 'actor',
            platform: 'instagram'
          }
        }
      ],
      edges: [
        {
          id: 'canvas-edge:self-creator',
          sourceId: 'canvas-node:self',
          targetId: 'canvas-node:creator',
          source: { objectId: 'canvas-node:self', placement: 'right' },
          target: { objectId: 'canvas-node:creator', placement: 'left' },
          label: 'follows',
          relationship: {
            kind: 'relates-to',
            direction: 'directed',
            label: 'follows',
            sourceRole: 'actor',
            targetRole: 'actor',
            properties: {
              socialRelationshipKind: 'follows',
              sourceNodeId: 'actor:self',
              targetNodeId: 'actor:creator'
            }
          }
        }
      ]
    })

    expect(projection.nodes).toHaveLength(2)
    expect(projection.nodes[0]).toMatchObject({
      id: 'canvas-node:self',
      type: 'external-reference',
      sourceNodeId: 'actor:self',
      sourceSchemaId: 'xnet://xnet.fyi/SocialActor@1.0.0',
      properties: {
        title: 'Self',
        sourceCardRole: 'social-projection',
        socialKind: 'actor'
      }
    })
    expect(projection.edges).toEqual([
      expect.objectContaining({
        id: 'canvas-edge:self-creator',
        sourceId: 'canvas-node:self',
        targetId: 'canvas-node:creator',
        source: expect.objectContaining({ objectId: 'canvas-node:self', placement: 'right' }),
        target: expect.objectContaining({ objectId: 'canvas-node:creator', placement: 'left' }),
        relationship: expect.objectContaining({
          kind: 'relates-to',
          label: 'follows',
          properties: expect.objectContaining({
            socialRelationshipKind: 'follows',
            sourceNodeId: 'actor:self',
            targetNodeId: 'actor:creator'
          })
        })
      })
    ])
  })
})
