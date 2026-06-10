import type { CanvasIngressPayload } from '../ingestion'
import type { CanvasIngestor } from '../ingestors'
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
  inferMediaKind,
  normalizeExternalReferenceUrl,
  serializeCanvasInternalNodeDragData
} from '../ingestion'
import {
  dedupeCanvasIngressPayloads,
  getCanvasIngressPayloadDedupeKey,
  ingestCanvasPayloadBatch,
  resolveCanvasIngestOptions,
  selectCanvasIngestor
} from '../ingestors'

describe('canvas ingestion utilities', () => {
  it('normalizes bare URLs and strips hashes', () => {
    expect(normalizeExternalReferenceUrl('example.com/path#section')).toBe(
      'https://example.com/path'
    )
    expect(normalizeExternalReferenceUrl('mailto:test@example.com')).toBeNull()
  })

  it('describes provider-aware URLs', () => {
    const cases = [
      [
        'https://github.com/openai/openai/issues/123',
        {
          provider: 'github',
          kind: 'issue',
          refId: 'openai/openai#123',
          title: 'openai#123'
        }
      ],
      [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        {
          provider: 'youtube',
          kind: 'video',
          embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
        }
      ],
      [
        'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
        {
          provider: 'spotify',
          kind: 'audio',
          refId: 'playlist/37i9dQZF1DXcBWIGoYBM5M',
          embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M'
        }
      ],
      [
        'https://vimeo.com/76979871',
        {
          provider: 'vimeo',
          kind: 'video',
          embedUrl: 'https://player.vimeo.com/video/76979871'
        }
      ],
      [
        'https://www.loom.com/share/abcdef1234567890',
        {
          provider: 'loom',
          kind: 'video',
          embedUrl: 'https://www.loom.com/embed/abcdef1234567890'
        }
      ],
      [
        'https://www.figma.com/file/abc123def/storybook-rich-editor-spec',
        {
          provider: 'figma',
          kind: 'design',
          embedUrl:
            'https://www.figma.com/embed?embed_host=xnet&url=https://www.figma.com/file/abc123def'
        }
      ],
      [
        'https://www.example.com/some/path',
        {
          provider: 'generic',
          kind: 'link',
          title: 'example.com'
        }
      ]
    ] as const

    for (const [url, expected] of cases) {
      expect(describeExternalReference(url)).toMatchObject(expected)
    }

    expect(
      describeExternalReference('https://x.com/storybookjs/status/1606321052308658177')
    ).toMatchObject({
      provider: 'twitter',
      kind: 'social',
      embedUrl: 'https://platform.twitter.com/embed/Tweet.html?id=1606321052308658177'
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
  })

  it('infers file media kinds across canvas-supported file families', () => {
    expect(inferMediaKind(new File(['x'], 'photo.png', { type: 'image/png' }))).toBe('image')
    expect(inferMediaKind(new File(['x'], 'clip.mp4', { type: 'video/mp4' }))).toBe('video')
    expect(inferMediaKind(new File(['x'], 'track.mp3', { type: 'audio/mpeg' }))).toBe('audio')
    expect(inferMediaKind(new File(['x'], 'brief.pdf', { type: 'application/pdf' }))).toBe(
      'document'
    )
    expect(
      inferMediaKind(
        new File(['x'], 'report.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        })
      )
    ).toBe('document')
    expect(
      inferMediaKind(
        new File(['x'], 'slides.pptx', {
          type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        })
      )
    ).toBe('document')
    expect(
      inferMediaKind(
        new File(['x'], 'sheet.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        })
      )
    ).toBe('document')
    expect(inferMediaKind(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toBe('document')
    expect(inferMediaKind(new File(['x'], 'archive.zip', { type: 'application/zip' }))).toBe('file')
  })

  it('extracts internal node and file payloads from data transfer', () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    const dataTransfer = {
      files: [file],
      getData(type: string) {
        if (type === CANVAS_INTERNAL_NODE_MIME) {
          return serializeCanvasInternalNodeDragData({
            nodeId: 'social-actor-1',
            schemaId: 'xnet://xnet.fyi/SocialActor@1.0.0',
            title: 'Dragged actor',
            canvasKind: 'external-reference',
            subtitle: 'instagram',
            description: 'Imported profile',
            href: 'https://instagram.com/example',
            badges: ['instagram', 'actor', 'actor']
          })
        }

        return ''
      }
    } as unknown as DataTransfer

    expect(extractCanvasIngressPayloads(dataTransfer)).toEqual([
      {
        kind: 'internal-node',
        data: {
          nodeId: 'social-actor-1',
          schemaId: 'xnet://xnet.fyi/SocialActor@1.0.0',
          title: 'Dragged actor',
          canvasKind: 'external-reference',
          subtitle: 'instagram',
          description: 'Imported profile',
          href: 'https://instagram.com/example',
          badges: ['instagram', 'actor']
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

    const socialCard = createSourceBackedCanvasNode({
      objectKind: 'external-reference',
      viewport: { x: 400, y: 300, zoom: 1 },
      sourceNodeId: 'social-actor-1',
      sourceSchemaId: 'xnet://xnet.fyi/SocialActor@1.0.0',
      title: 'Dragged actor',
      properties: {
        provider: 'instagram',
        kind: 'social',
        url: 'https://instagram.com/example'
      }
    })

    expect(socialCard.type).toBe('external-reference')
    expect(socialCard.sourceNodeId).toBe('social-actor-1')
    expect(socialCard.sourceSchemaId).toBe('xnet://xnet.fyi/SocialActor@1.0.0')
    expect(socialCard.properties).toMatchObject({
      title: 'Dragged actor',
      provider: 'instagram',
      kind: 'social',
      url: 'https://instagram.com/example'
    })
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
    expect(
      getCanvasObjectKindFromSchema('xnet://xnet.fyi/SocialActor@1.0.0', 'external-reference')
    ).toBe('external-reference')
    expect(getMediaRect({ width: 1920, height: 1080 })).toEqual({ width: 420, height: 236 })
  })

  it('selects canvas ingestors by priority with deterministic tie-breaking', () => {
    const payload: CanvasIngressPayload = {
      kind: 'text',
      text: 'https://example.com'
    }
    const ingest = async () => ({ canvasNodeId: 'node-1' })
    const ingestors: CanvasIngestor[] = [
      { id: 'beta', priority: 10, matches: () => true, ingest },
      { id: 'alpha', priority: 10, matches: () => true, ingest },
      { id: 'preferred', priority: 20, matches: () => true, ingest },
      { id: 'ignored', priority: 100, matches: () => false, ingest }
    ]

    expect(selectCanvasIngestor(payload, ingestors)?.id).toBe('preferred')
    expect(selectCanvasIngestor(payload, ingestors.slice(0, 2))?.id).toBe('alpha')
    expect(selectCanvasIngestor(payload, ingestors.slice(3))).toBeNull()
    expect(
      resolveCanvasIngestOptions({
        canvasPoint: { x: 12, y: 24 },
        spreadIndex: 3
      })
    ).toEqual({
      canvasPoint: { x: 12, y: 24 },
      spreadIndex: 3
    })
  })

  it('deduplicates file, URL, text URL, and internal node ingestion payloads', () => {
    const file = new File(['hello'], 'hello.txt', {
      type: 'text/plain',
      lastModified: 123
    })
    const duplicateFile = new File(['hello'], 'hello.txt', {
      type: 'text/plain',
      lastModified: 123
    })
    const payloads: CanvasIngressPayload[] = [
      { kind: 'url', url: 'https://example.com/path#section' },
      { kind: 'text', text: 'example.com/path' },
      { kind: 'file', file },
      { kind: 'file', file: duplicateFile },
      {
        kind: 'internal-node',
        data: {
          nodeId: 'page-1',
          schemaId: PageSchema._schemaId,
          title: 'Page'
        }
      },
      {
        kind: 'internal-node',
        data: {
          nodeId: 'page-1',
          schemaId: PageSchema._schemaId,
          title: 'Page copy'
        }
      },
      { kind: 'text', text: 'Loose note' }
    ]

    expect(payloads.map(getCanvasIngressPayloadDedupeKey)).toEqual([
      'url:https://example.com/path',
      'url:https://example.com/path',
      'file:hello.txt:text/plain:5:123',
      'file:hello.txt:text/plain:5:123',
      `internal-node:${PageSchema._schemaId}:page-1`,
      `internal-node:${PageSchema._schemaId}:page-1`,
      'text:Loose note'
    ])
    expect(dedupeCanvasIngressPayloads(payloads)).toEqual([
      payloads[0],
      payloads[2],
      payloads[4],
      payloads[6]
    ])
  })

  it('batch-ingests deduplicated payloads while recording unsupported payloads and errors', async () => {
    const file = new File(['hello'], 'hello.txt', {
      type: 'text/plain',
      lastModified: 123
    })
    const ingestors: CanvasIngestor[] = [
      {
        id: 'url',
        priority: 10,
        matches: (payload) =>
          (payload.kind === 'url' || payload.kind === 'text') &&
          getCanvasIngressPayloadDedupeKey(payload)?.startsWith('url:') === true,
        ingest: async (payload, options) => {
          if (payload.kind === 'url' && payload.url.includes('bad.example')) {
            throw new Error('provider denied metadata')
          }

          return {
            canvasNodeId: `url-${options.spreadIndex}`
          }
        }
      },
      {
        id: 'file',
        priority: 5,
        matches: (payload) => payload.kind === 'file',
        ingest: async (_payload, options) => ({
          canvasNodeId: `file-${options.spreadIndex}`
        })
      }
    ]

    const result = await ingestCanvasPayloadBatch(
      [
        { kind: 'url', url: 'https://example.com/path#section' },
        { kind: 'text', text: 'https://example.com/path' },
        { kind: 'file', file },
        { kind: 'file', file },
        { kind: 'url', url: 'https://bad.example/resource' },
        { kind: 'text', text: 'Loose note' }
      ],
      ingestors
    )

    expect(result.cancelled).toBe(false)
    expect(result.results).toEqual([{ canvasNodeId: 'url-0' }, { canvasNodeId: 'file-1' }])
    expect(result.skipped).toMatchObject([
      { index: 1, reason: 'duplicate' },
      { index: 3, reason: 'duplicate' },
      { index: 5, reason: 'unsupported' }
    ])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({
      index: 4,
      ingestorId: 'url'
    })
    expect(result.errors[0]?.error.message).toBe('provider denied metadata')
  })

  it('stops batch ingestion when the active signal is cancelled', async () => {
    const controller = new AbortController()
    const calls: string[] = []
    const ingestors: CanvasIngestor[] = [
      {
        id: 'text',
        priority: 1,
        matches: (payload) => payload.kind === 'text',
        ingest: async (payload, options) => {
          if (payload.kind !== 'text') {
            return null
          }

          calls.push(`${payload.text}:${options.spreadIndex}`)
          if (payload.text === 'stop') {
            controller.abort()
          }

          return {
            canvasNodeId: payload.text
          }
        }
      }
    ]

    const result = await ingestCanvasPayloadBatch(
      [
        { kind: 'text', text: 'first' },
        { kind: 'text', text: 'stop' },
        { kind: 'text', text: 'after' }
      ],
      ingestors,
      {
        signal: controller.signal
      }
    )

    expect(calls).toEqual(['first:0', 'stop:1'])
    expect(result.results).toEqual([{ canvasNodeId: 'first' }])
    expect(result.cancelled).toBe(true)
    expect(result.skipped).toMatchObject([{ index: 2, reason: 'cancelled' }])
  })
})
