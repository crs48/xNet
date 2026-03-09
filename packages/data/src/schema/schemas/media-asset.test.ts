import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import { MediaAssetSchema } from './media-asset'

describe('MediaAssetSchema', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

  it('has the expected schema identity', () => {
    expect(MediaAssetSchema.schema['@id']).toBe('xnet://xnet.fyi/MediaAsset@1.0.0')
    expect(MediaAssetSchema.schema.name).toBe('MediaAsset')
    expect(MediaAssetSchema.schema.version).toBe('1.0.0')
  })

  it('defines file-backed media properties', () => {
    const propIds = MediaAssetSchema.schema.properties.map((prop) => prop['@id'])

    expect(propIds).toContain('xnet://xnet.fyi/MediaAsset@1.0.0#title')
    expect(propIds).toContain('xnet://xnet.fyi/MediaAsset@1.0.0#file')
    expect(propIds).toContain('xnet://xnet.fyi/MediaAsset@1.0.0#kind')
    expect(propIds).toContain('xnet://xnet.fyi/MediaAsset@1.0.0#width')
    expect(propIds).toContain('xnet://xnet.fyi/MediaAsset@1.0.0#height')
  })

  it('creates a valid image media node', () => {
    const media = MediaAssetSchema.create(
      {
        title: 'Screenshot',
        kind: 'image',
        alt: 'Canvas screenshot',
        width: 1920,
        height: 1080,
        file: {
          cid: 'cid:blake3:test-image',
          name: 'screenshot.png',
          mimeType: 'image/png',
          size: 2048
        }
      },
      { createdBy: testDID }
    )

    const file = media.file

    expect(media.kind).toBe('image')
    expect(file).toBeDefined()
    expect(file?.mimeType).toBe('image/png')
    expect(media.width).toBe(1920)
    expect(media.height).toBe(1080)
  })
})
