import type { CanvasNode } from '../types'
import {
  DatabaseRowSchema,
  DatabaseSchema,
  ExternalReferenceSchema,
  PageSchema
} from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { createCanvasSemanticEdgeDraft, getCanvasSemanticEndpointRole } from './source-semantics'

function createNode(input: CanvasNode): CanvasNode {
  return input
}

describe('source-aware semantic edge helpers', () => {
  it('infers roles from canvas type and source schema metadata', () => {
    const page = createNode({
      id: 'page-1',
      type: 'page',
      sourceSchemaId: PageSchema._schemaId,
      position: { x: 0, y: 0, width: 240, height: 160 },
      properties: { title: 'Page' }
    })
    const row = createNode({
      id: 'row-1',
      type: 'note',
      sourceSchemaId: DatabaseRowSchema._schemaId,
      position: { x: 280, y: 0, width: 240, height: 160 },
      properties: { title: 'Row' }
    })
    const database = createNode({
      id: 'db-1',
      type: 'database',
      sourceSchemaId: DatabaseSchema._schemaId,
      position: { x: 560, y: 0, width: 240, height: 160 },
      properties: { title: 'Database' }
    })
    const external = createNode({
      id: 'ref-1',
      type: 'external-reference',
      sourceSchemaId: ExternalReferenceSchema._schemaId,
      position: { x: 840, y: 0, width: 240, height: 160 },
      properties: { title: 'Reference' }
    })

    expect(getCanvasSemanticEndpointRole(page)).toBe('page')
    expect(getCanvasSemanticEndpointRole(row)).toBe('database-row')
    expect(getCanvasSemanticEndpointRole(database)).toBe('database')
    expect(getCanvasSemanticEndpointRole(external)).toBe('external-reference')
  })

  it('creates source-aware relationships and PDF page endpoints', () => {
    const page = createNode({
      id: 'page-1',
      type: 'page',
      sourceNodeId: 'source-page-1',
      sourceSchemaId: PageSchema._schemaId,
      position: { x: 0, y: 0, width: 240, height: 160 },
      properties: { title: 'Page' }
    })
    const pdf = createNode({
      id: 'pdf-1',
      type: 'media',
      sourceNodeId: 'source-pdf-1',
      position: { x: 280, y: 0, width: 300, height: 220 },
      properties: {
        title: 'Brief.pdf',
        mimeType: 'application/pdf',
        pageNumber: 3
      }
    })

    const draft = createCanvasSemanticEdgeDraft({
      sourceNode: page,
      targetNode: pdf,
      sourcePlacement: 'right',
      targetPlacement: 'left'
    })

    expect(draft.source).toMatchObject({
      objectId: 'page-1',
      placement: 'right'
    })
    expect(draft.target).toMatchObject({
      objectId: 'pdf-1',
      pageNumber: 3,
      placement: 'left'
    })
    expect(draft.target?.anchorId).toContain('page:3')
    expect(draft.relationship).toEqual({
      kind: 'references',
      direction: 'directed',
      sourceRole: 'page',
      targetRole: 'pdf-page',
      properties: {
        sourceRole: 'page',
        targetRole: 'pdf-page',
        sourceSchemaId: PageSchema._schemaId,
        sourceNodeId: 'source-page-1',
        targetNodeId: 'source-pdf-1',
        targetPageNumber: 3
      }
    })
  })

  it('creates semantic references between database rows and external sources', () => {
    const row = createNode({
      id: 'row-1',
      type: 'note',
      sourceNodeId: 'source-row-1',
      sourceSchemaId: DatabaseRowSchema._schemaId,
      position: { x: 0, y: 0, width: 260, height: 140 },
      properties: { title: 'Customer row' }
    })
    const external = createNode({
      id: 'external-1',
      type: 'external-reference',
      sourceNodeId: 'source-ref-1',
      sourceSchemaId: ExternalReferenceSchema._schemaId,
      position: { x: 320, y: 0, width: 320, height: 180 },
      properties: {
        title: 'CRM source',
        url: 'https://example.com/customer'
      }
    })

    const draft = createCanvasSemanticEdgeDraft({
      sourceNode: row,
      targetNode: external
    })

    expect(draft.relationship).toEqual({
      kind: 'references',
      direction: 'directed',
      sourceRole: 'database-row',
      targetRole: 'external-reference',
      properties: {
        sourceRole: 'database-row',
        targetRole: 'external-reference',
        sourceSchemaId: DatabaseRowSchema._schemaId,
        targetSchemaId: ExternalReferenceSchema._schemaId,
        sourceNodeId: 'source-row-1',
        targetNodeId: 'source-ref-1'
      }
    })
  })
})
