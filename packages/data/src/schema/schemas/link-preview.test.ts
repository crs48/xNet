import { describe, expect, it } from 'vitest'
import { sanitizeLinkPreviews } from './link-preview'

describe('stored chat previews', () => {
  it('preserves sender-owned media references through the existing preview field', () => {
    const media = {
      cid: 'bafy-example',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      size: 123
    }
    const preview = {
      url: 'https://example.com/report.pdf',
      kind: 'external',
      title: 'Report',
      domain: 'example.com',
      resolvedAt: 42,
      media
    }
    expect(sanitizeLinkPreviews(JSON.parse(JSON.stringify([preview])))).toEqual([preview])
  })
  it('rejects malformed entries and bounds snapshots from remote authors', () => {
    expect(sanitizeLinkPreviews([null, {}, { url: 42 }])).toEqual([])
    const preview = {
      url: 'https://example.com',
      kind: 'external',
      title: 'Example',
      domain: 'example.com',
      resolvedAt: 42
    }
    expect(sanitizeLinkPreviews(Array.from({ length: 100 }, () => preview))).toHaveLength(3)
  })
})
