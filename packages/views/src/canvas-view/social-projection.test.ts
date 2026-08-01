/**
 * The two halves of canvas projection compose, and the plan lands on a doc
 * (exploration 0419).
 */

import type { SavedViewCanvasProjectionNode } from '@xnetjs/react'
import { getCanvasConnectorsMap, getCanvasObjectsMap } from '@xnetjs/canvas'
import { createSocialCanvasProjectionPlan } from '@xnetjs/social'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  applySocialCanvasProjectionPlan,
  describeSocialCanvasProjection
} from './social-projection'

function projectionNode(id: string, overrides: Partial<SavedViewCanvasProjectionNode> = {}) {
  return {
    id,
    schemaId: 'xnet://xnet.fyi/social/SocialContent@1.0.0',
    kind: 'content' as const,
    title: `Video ${id}`,
    platform: 'youtube',
    privacyClass: 'public',
    groupKey: 'youtube',
    ...overrides
  }
}

function planFor(nodeIds: readonly string[], edges: Parameters<
  typeof createSocialCanvasProjectionPlan
>[0]['edges'] = []) {
  return createSocialCanvasProjectionPlan({
    nodes: nodeIds.map((id) => projectionNode(id)),
    edges,
    options: { title: 'YouTube Playlists', lensId: 'social.feed.youtube-playlists' }
  })
}

describe('social canvas projection', () => {
  it('accepts the extractor output from @xnetjs/react without a shim', () => {
    // The point of the pair: react extracts, social lays out. If these types
    // ever drift apart this stops compiling.
    const nodes: SavedViewCanvasProjectionNode[] = [projectionNode('a'), projectionNode('b')]
    const plan = createSocialCanvasProjectionPlan({
      nodes,
      options: { title: 'Lens' }
    })

    expect(plan.nodeCount).toBe(2)
    expect(plan.nodes[0]?.sourceNodeId).toBe('a')
    expect(plan.nodes[0]?.type).toBe('external-reference')
  })

  it('writes objects and connectors into the canvas doc', () => {
    const doc = new Y.Doc()
    const plan = planFor(
      ['a', 'b'],
      [{ sourceId: 'a', targetId: 'b', relationshipKind: 'contains' }]
    )

    const result = applySocialCanvasProjectionPlan(doc, plan)

    expect(result.nodeCount).toBe(2)
    expect(result.edgeCount).toBe(1)
    expect(getCanvasObjectsMap(doc).size).toBe(2)
    expect(getCanvasConnectorsMap(doc).size).toBe(1)
  })

  it('keeps each card source-backed so it can resolve its own node', () => {
    const doc = new Y.Doc()
    applySocialCanvasProjectionPlan(doc, planFor(['a']))

    const objects = getCanvasObjectsMap<{ properties: Record<string, unknown> }>(doc)
    const placed = [...objects.values()][0]

    expect(placed?.properties.sourceNodeId).toBe('a')
    expect(placed?.properties.sourceSchemaId).toBe('xnet://xnet.fyi/social/SocialContent@1.0.0')
    expect(placed?.properties.sourceCardRole).toBe('social-projection')
  })

  it('re-projecting the same lens overwrites rather than duplicating', () => {
    const doc = new Y.Doc()
    const plan = planFor(['a', 'b'])

    applySocialCanvasProjectionPlan(doc, plan)
    applySocialCanvasProjectionPlan(doc, plan)

    expect(getCanvasObjectsMap(doc).size).toBe(2)
  })

  it('offsets the whole projection from a given origin', () => {
    const doc = new Y.Doc()
    applySocialCanvasProjectionPlan(doc, planFor(['a']), { origin: { x: 500, y: 250 } })

    const objects = getCanvasObjectsMap<{ position: { x: number; y: number } }>(doc)
    const placed = [...objects.values()][0]

    expect(placed?.position.x).toBe(500)
    expect(placed?.position.y).toBe(250)
  })

  it('drops edges whose endpoints were not placed', () => {
    const doc = new Y.Doc()
    const plan = planFor(
      ['a'],
      [{ sourceId: 'a', targetId: 'missing', relationshipKind: 'related' }]
    )

    const result = applySocialCanvasProjectionPlan(doc, plan)
    expect(result.edgeCount).toBe(0)
    expect(getCanvasConnectorsMap(doc).size).toBe(0)
  })

  it('names what the caps left out instead of implying the graph is whole', () => {
    const plan = createSocialCanvasProjectionPlan({
      nodes: Array.from({ length: 5 }, (_, index) => projectionNode(`n${index}`)),
      options: { title: 'Lens', maxNodes: 2 }
    })
    const doc = new Y.Doc()
    const result = applySocialCanvasProjectionPlan(doc, plan)

    expect(result.omittedNodeCount).toBe(3)
    expect(describeSocialCanvasProjection(result)).toContain('3 more not shown')
  })

  it('says nothing about omissions when nothing was omitted', () => {
    const doc = new Y.Doc()
    const result = applySocialCanvasProjectionPlan(doc, planFor(['a']))
    expect(describeSocialCanvasProjection(result)).toBe('Projected 1 cards, 0 connections.')
  })
})
