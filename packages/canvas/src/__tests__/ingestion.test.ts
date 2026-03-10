import { DatabaseSchema, PageSchema } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  CANVAS_INTERNAL_NODE_MIME,
  createSourceBackedCanvasNode,
  describeExternalReference,
  extractCanvasIngressPayloads,
  getCanvasObjectKindFromSchema,
  getMediaRect,
  normalizeExternalReferenceUrl,
  serializeCanvasInternalNodeDragData
} from '../ingestion'

describe('canvas ingestion utilities', () => {
  it('normalizes bare URLs and strips hashes', () => {
    expect(normalizeExternalReferenceUrl('example.com/path#section')).toBe(
      'https://example.com/path'
    )
    expect(normalizeExternalReferenceUrl('mailto:test@example.com')).toBeNull()
  })

  it('describes provider-aware URLs', () => {
    expect(describeExternalReference('https://github.com/openai/openai/issues/123')).toMatchObject({
      provider: 'github',
      kind: 'issue',
      refId: 'openai/openai#123',
      title: 'openai#123'
    })

    expect(describeExternalReference('https://www.example.com/some/path')).toMatchObject({
      provider: 'generic',
      kind: 'link',
      title: 'example.com'
    })
  })

  it('extracts internal node and file payloads from data transfer', () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    const dataTransfer = {
      files: [file],
      getData(type: string) {
        if (type === CANVAS_INTERNAL_NODE_MIME) {
          return serializeCanvasInternalNodeDragData({
            nodeId: 'page-1',
            schemaId: PageSchema._schemaId,
            title: 'Dragged page'
          })
        }

        return ''
      }
    } as unknown as DataTransfer

    expect(extractCanvasIngressPayloads(dataTransfer)).toEqual([
      {
        kind: 'internal-node',
        data: {
          nodeId: 'page-1',
          schemaId: PageSchema._schemaId,
          title: 'Dragged page'
        }
      },
      {
        kind: 'file',
        file
      }
    ])
  })

  it('creates source-backed canvas nodes around the viewport center', () => {
    const node = createSourceBackedCanvasNode({
      objectKind: 'page',
      viewport: { x: 400, y: 300, zoom: 1 },
      sourceNodeId: 'page-1',
      sourceSchemaId: PageSchema._schemaId,
      title: 'Canvas page'
    })

    expect(node.type).toBe('page')
    expect(node.sourceNodeId).toBe('page-1')
    expect(node.sourceSchemaId).toBe(PageSchema._schemaId)
    expect(node.position.width).toBe(360)
    expect(node.position.height).toBe(220)
    expect(node.position.x).toBe(220)
    expect(node.position.y).toBe(190)
  })

  it('maps schemas and media sizing to canvas primitives', () => {
    expect(getCanvasObjectKindFromSchema(PageSchema._schemaId)).toBe('page')
    expect(getCanvasObjectKindFromSchema(DatabaseSchema._schemaId)).toBe('database')
    expect(getMediaRect({ width: 1920, height: 1080 })).toEqual({ width: 420, height: 236 })
  })
})
