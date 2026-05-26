import { describe, expect, it } from 'vitest'
import {
  createCanvasPreviewSourceFingerprint,
  shouldInvalidateCanvasPreviewCache
} from '../preview/cache-invalidation'

describe('canvas preview cache invalidation', () => {
  it('creates stable fingerprints independent of object key order and blob hash order', () => {
    const first = createCanvasPreviewSourceFingerprint({
      sourceRef: {
        nodeId: 'source-1',
        schemaId: 'xnet://xnet.fyi/MediaAsset@1.0.0',
        version: 2,
        contentHash: 'hash-1'
      },
      fields: {
        title: 'Launch video',
        nested: {
          width: 1920,
          height: 1080
        }
      },
      blobHashes: ['poster-hash', 'media-hash']
    })
    const second = createCanvasPreviewSourceFingerprint({
      sourceRef: {
        nodeId: 'source-1',
        schemaId: 'xnet://xnet.fyi/MediaAsset@1.0.0',
        version: 2,
        contentHash: 'hash-1'
      },
      fields: {
        nested: {
          height: 1080,
          width: 1920
        },
        title: 'Launch video'
      },
      blobHashes: ['media-hash', 'poster-hash']
    })

    expect(first).toBe(second)
  })

  it('invalidates previews when source versions, fields, or blob hashes change', () => {
    const base = {
      sourceRef: {
        nodeId: 'pdf-1',
        version: 1,
        contentHash: 'hash-1'
      },
      fields: {
        title: 'Research packet',
        pageCount: 12
      },
      blobHashes: ['bytes-a']
    }

    expect(shouldInvalidateCanvasPreviewCache(base, base)).toBe(false)
    expect(
      shouldInvalidateCanvasPreviewCache(base, {
        ...base,
        sourceRef: {
          ...base.sourceRef,
          version: 2
        }
      })
    ).toBe(true)
    expect(
      shouldInvalidateCanvasPreviewCache(base, {
        ...base,
        fields: {
          ...base.fields,
          pageCount: 13
        }
      })
    ).toBe(true)
    expect(
      shouldInvalidateCanvasPreviewCache(base, {
        ...base,
        blobHashes: ['bytes-b']
      })
    ).toBe(true)
  })
})
