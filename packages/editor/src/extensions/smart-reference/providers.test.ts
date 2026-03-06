import { describe, expect, it } from 'vitest'
import { parseSmartReferenceUrl } from './providers'

describe('parseSmartReferenceUrl', () => {
  it('parses GitHub issue URLs', () => {
    const parsed = parseSmartReferenceUrl('https://github.com/openai/openai/issues/123')

    expect(parsed).toMatchObject({
      provider: 'github',
      kind: 'issue',
      refId: 'openai/openai#123',
      title: 'openai#123'
    })
  })

  it('parses GitHub PR URLs', () => {
    const parsed = parseSmartReferenceUrl('https://github.com/openai/openai/pull/456')

    expect(parsed).toMatchObject({
      provider: 'github',
      kind: 'pull-request',
      refId: 'openai/openai#456',
      title: 'openai PR #456'
    })
  })

  it('reuses embed providers for Figma URLs', () => {
    const parsed = parseSmartReferenceUrl('https://www.figma.com/file/abc123def')

    expect(parsed).toMatchObject({
      provider: 'figma',
      kind: 'design',
      refId: 'file/abc123def'
    })
  })

  it('reuses embed providers for YouTube URLs', () => {
    const parsed = parseSmartReferenceUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')

    expect(parsed).toMatchObject({
      provider: 'youtube',
      kind: 'video',
      refId: 'dQw4w9WgXcQ'
    })
  })

  it('returns null for unsupported URLs', () => {
    expect(parseSmartReferenceUrl('https://example.com/docs/123')).toBeNull()
  })
})
