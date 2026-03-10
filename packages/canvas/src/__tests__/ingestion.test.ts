import { DatabaseSchema, PageSchema } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  CANVAS_INTERNAL_NODE_MIME,
  createCanvasPrimitiveNode,
  createSourceBackedCanvasNode,
  describeExternalReference,
  extractCanvasIngressPayloads,
  getCanvasObjectKindFromSchema,
  getExternalReferenceRect,
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

    expect(describeExternalReference('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({
      provider: 'youtube',
      kind: 'video',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
    })

    expect(
      describeExternalReference('https://x.com/storybookjs/status/1606321052308658177')
    ).toMatchObject({
      provider: 'twitter',
      kind: 'social',
      embedUrl: 'https://platform.twitter.com/embed/Tweet.html?id=1606321052308658177'
    })

    expect(
      describeExternalReference('https://www.figma.com/file/abc123def/storybook-rich-editor-spec')
    ).toMatchObject({
      provider: 'figma',
      kind: 'design',
      embedUrl:
        'https://www.figma.com/embed?embed_host=xnet&url=https://www.figma.com/file/abc123def'
    })

    expect(describeExternalReference('https://www.instagram.com/p/C-qi579y7M9/')).toMatchObject({
      provider: 'instagram',
      kind: 'social',
      embedUrl: 'https://www.instagram.com/p/C-qi579y7M9/embed/captioned'
    })

    expect(
      describeExternalReference('https://www.tiktok.com/@scout2015/video/6718335390845095173')
    ).toMatchObject({
      provider: 'tiktok',
      kind: 'social',
      embedUrl: 'https://www.tiktok.com/player/v1/6718335390845095173'
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

  it('sizes embeddable external references using shared provider metadata', () => {
    const youtubeRect = getExternalReferenceRect({
      provider: 'youtube',
      kind: 'video',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
    })
    const twitterRect = getExternalReferenceRect({
      provider: 'twitter',
      kind: 'social',
      embedUrl: 'https://platform.twitter.com/embed/Tweet.html?id=1606321052308658177'
    })
    const instagramRect = getExternalReferenceRect({
      provider: 'instagram',
      kind: 'social',
      embedUrl: 'https://www.instagram.com/p/C-qi579y7M9/embed/captioned'
    })
    const tiktokRect = getExternalReferenceRect({
      provider: 'tiktok',
      kind: 'social',
      embedUrl: 'https://www.tiktok.com/player/v1/6718335390845095173'
    })
    const genericRect = getExternalReferenceRect({
      provider: 'generic',
      kind: 'link',
      embedUrl: null
    })

    expect(youtubeRect).toEqual({ width: 420, height: 352 })
    expect(twitterRect).toEqual({ width: 360, height: 420 })
    expect(instagramRect).toEqual({ width: 360, height: 420 })
    expect(tiktokRect).toEqual({ width: 360, height: 420 })
    expect(genericRect).toEqual({ width: 360, height: 180 })
  })

  it('creates source-backed embed nodes with provider-aware default placement rects', () => {
    const youtubeNode = createSourceBackedCanvasNode({
      objectKind: 'external-reference',
      viewport: { x: 400, y: 300, zoom: 1 },
      title: 'YouTube video',
      properties: {
        provider: 'youtube',
        kind: 'video',
        embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
      }
    })

    expect(youtubeNode.position).toMatchObject({
      width: 420,
      height: 352,
      x: 190,
      y: 124
    })
  })

  it('creates primitive canvas nodes with shape and frame defaults', () => {
    const shapeNode = createCanvasPrimitiveNode({
      objectKind: 'shape',
      viewport: { x: 400, y: 300, zoom: 1 },
      title: 'Rectangle'
    })
    const frameNode = createCanvasPrimitiveNode({
      objectKind: 'group',
      viewport: { x: 400, y: 300, zoom: 1 },
      title: 'Frame'
    })

    expect(shapeNode.type).toBe('shape')
    expect(shapeNode.position).toMatchObject({
      width: 240,
      height: 160,
      x: 280,
      y: 220
    })
    expect(shapeNode.properties).toMatchObject({
      title: 'Rectangle',
      label: 'Rectangle',
      shapeType: 'rectangle'
    })

    expect(frameNode.type).toBe('group')
    expect(frameNode.position).toMatchObject({
      width: 640,
      height: 420,
      x: 80,
      y: 90
    })
    expect(frameNode.properties).toMatchObject({
      title: 'Frame',
      containerRole: 'frame',
      memberIds: [],
      memberCount: 0
    })
  })

  it('maps schemas and media sizing to canvas primitives', () => {
    expect(getCanvasObjectKindFromSchema(PageSchema._schemaId)).toBe('page')
    expect(getCanvasObjectKindFromSchema(DatabaseSchema._schemaId)).toBe('database')
    expect(getMediaRect({ width: 1920, height: 1080 })).toEqual({ width: 420, height: 236 })
  })
})
