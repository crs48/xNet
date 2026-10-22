import { describe, expect, it } from 'vitest'
import { chatUrls, fileMimeType, previewKind, publicChatUrl, youtubeEmbed } from './chat-media'

describe('chat media policy', () => {
  it('never fetches code examples, private hosts, credentials or non-web schemes', () => {
    expect(
      chatUrls(
        '`https://example.com/code`\n```js\nhttps://example.com/fence\n```\nhttps://example.com/live'
      )
    ).toEqual(['https://example.com/live'])
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'http://127.1/',
      'http://[::1]/',
      'http://100.64.1.2/',
      'https://user:secret@example.com'
    ])
      expect(publicChatUrl(url)).toBeNull()
  })
  it('deduplicates Markdown and bare links and caps the number of fetches', () => {
    expect(
      chatUrls(
        '[one](https://example.com/a) https://example.com/a ![image](https://example.com/b.png) https://example.com/c https://example.com/d'
      )
    ).toEqual(['https://example.com/a', 'https://example.com/b.png', 'https://example.com/c'])
  })
  it('only embeds exact YouTube hosts and validated video IDs', () => {
    expect(youtubeEmbed('https://youtu.be/jNQXAC9IVRw?t=1m2s')).toContain(
      '/embed/jNQXAC9IVRw?autoplay=1&start=62'
    )
    expect(youtubeEmbed('https://www.youtube.com/shorts/jNQXAC9IVRw')).toContain(
      '/embed/jNQXAC9IVRw'
    )
    expect(youtubeEmbed('https://youtube.com.evil.test/watch?v=jNQXAC9IVRw')).toBeNull()
    expect(youtubeEmbed('https://youtube.com/watch?v=%22onload%3Devil')).toBeNull()
  })
  it('recognizes common missing MIME types without treating active content as a preview', () => {
    expect(fileMimeType('report.PDF', '')).toBe('application/pdf')
    expect(fileMimeType('photo.png', 'application/octet-stream')).toBe('image/png')
    expect(previewKind('image/svg+xml')).toBe('file')
    expect(previewKind('text/html')).toBe('file')
    expect(previewKind('text/markdown')).toBe('text')
  })
})
