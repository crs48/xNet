/**
 * Semantic relationship helper tests.
 */

import { describe, expect, it } from 'vitest'
import { createEdge } from '../store'
import {
  applyCanvasEdgeRelationship,
  createCanvasEdgeRelationship,
  createCanvasSemanticRelationshipRecord,
  getCanvasConnectorKindForRelationship,
  normalizeCanvasEdgeRelationship
} from './relationships'

describe('semantic connector relationships', () => {
  it('normalizes relationship metadata with default direction semantics', () => {
    expect(createCanvasEdgeRelationship({ kind: 'relates-to' })).toEqual({
      kind: 'relates-to',
      direction: 'undirected'
    })
    expect(
      createCanvasEdgeRelationship({
        kind: 'depends-on',
        label: 'Needs',
        sourceRole: 'dependent',
        targetRole: 'dependency',
        properties: { strength: 'hard' }
      })
    ).toEqual({
      kind: 'depends-on',
      direction: 'directed',
      label: 'Needs',
      sourceRole: 'dependent',
      targetRole: 'dependency',
      properties: { strength: 'hard' }
    })
  })

  it('falls back invalid relationship payloads to relates-to', () => {
    expect(
      normalizeCanvasEdgeRelationship({
        kind: 'unknown',
        direction: 'sideways'
      } as never)
    ).toEqual({
      kind: 'relates-to',
      direction: 'undirected'
    })
  })

  it('maps relationships to tile connector kinds', () => {
    expect(getCanvasConnectorKindForRelationship({ kind: 'references' })).toBe('reference')
    expect(getCanvasConnectorKindForRelationship({ kind: 'depends-on' })).toBe('dependency')
    expect(getCanvasConnectorKindForRelationship({ kind: 'parent-child' })).toBe('dependency')
    expect(getCanvasConnectorKindForRelationship({ kind: 'relates-to' })).toBe('line')
  })

  it('creates durable semantic relationship records from edges', () => {
    const edge = applyCanvasEdgeRelationship(
      createEdge('source', 'target'),
      createCanvasEdgeRelationship({
        kind: 'parent-child',
        label: 'Contains',
        sourceRole: 'parent',
        targetRole: 'child'
      })
    )

    expect(createCanvasSemanticRelationshipRecord(edge)).toEqual({
      id: edge.id,
      sourceObjectId: 'source',
      targetObjectId: 'target',
      kind: 'parent-child',
      direction: 'directed',
      label: 'Contains',
      sourceRole: 'parent',
      targetRole: 'child'
    })
  })
})
