import { describe, it, expect } from 'vitest'
import { EMBED_PROVIDERS, detectProvider, parseEmbedUrl } from './providers'

describe('EMBED_PROVIDERS', () => {
  it('should have 7 providers', () => {
    expect(EMBED_PROVIDERS).toHaveLength(7)
  })

  it('each provider should have required fields', () => {
    for (const provider of EMBED_PROVIDERS) {
      expect(provider.name).toBeTruthy()
      expect(provider.displayName).toBeTruthy()
      expect(provider.icon).toBeTruthy()
      expect(provider.patterns.length).toBeGreaterThan(0)
      expect(typeof provider.extractId).toBe('function')
      expect(typeof provider.getEmbedUrl).toBe('function')
    }
  })
})

describe('detectProvider', () => {
  it('should detect YouTube watch URL', () => {
    const provider = detectProvider('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(provider?.name).toBe('youtube')
  })

  it('should detect YouTube short URL', () => {
    const provider = detectProvider('https://youtu.be/dQw4w9WgXcQ')
    expect(provider?.name).toBe('youtube')
  })

  it('should detect YouTube embed URL', () => {
    const provider = detectProvider('https://www.youtube.com/embed/dQw4w9WgXcQ')
    expect(provider?.name).toBe('youtube')
  })

  it('should detect YouTube Shorts URL', () => {
    const provider = detectProvider('https://youtube.com/shorts/abc123')
    expect(provider?.name).toBe('youtube')
  })

  it('should detect Vimeo URL', () => {
    const provider = detectProvider('https://vimeo.com/123456789')
    expect(provider?.name).toBe('vimeo')
  })

  it('should detect Vimeo player URL', () => {
    const provider = detectProvider('https://player.vimeo.com/video/123456789')
    expect(provider?.name).toBe('vimeo')
  })

  it('should detect Spotify track URL', () => {
    const provider = detectProvider('https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh')
    expect(provider?.name).toBe('spotify')
  })

  it('should detect Spotify album URL', () => {
    const provider = detectProvider('https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3')
    expect(provider?.name).toBe('spotify')
  })

  it('should detect Spotify playlist URL', () => {
    const provider = detectProvider('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
    expect(provider?.name).toBe('spotify')
  })

  it('should detect Twitter URL', () => {
    const provider = detectProvider('https://twitter.com/user/status/1234567890')
    expect(provider?.name).toBe('twitter')
  })

  it('should detect X.com URL', () => {
    const provider = detectProvider('https://x.com/user/status/1234567890')
    expect(provider?.name).toBe('twitter')
  })

  it('should detect Figma file URL', () => {
    const provider = detectProvider('https://www.figma.com/file/abc123def')
    expect(provider?.name).toBe('figma')
  })

  it('should detect Figma proto URL', () => {
    const provider = detectProvider('https://www.figma.com/proto/abc123def')
    expect(provider?.name).toBe('figma')
  })

  it('should detect CodeSandbox URL', () => {
    const provider = detectProvider('https://codesandbox.io/s/my-sandbox-abc123')
    expect(provider?.name).toBe('codesandbox')
  })

  it('should detect CodeSandbox embed URL', () => {
    const provider = detectProvider('https://codesandbox.io/embed/my-sandbox-abc123')
    expect(provider?.name).toBe('codesandbox')
  })

  it('should detect Loom share URL', () => {
    const provider = detectProvider('https://www.loom.com/share/abc123def456')
    expect(provider?.name).toBe('loom')
  })

  it('should detect Loom embed URL', () => {
    const provider = detectProvider('https://www.loom.com/embed/abc123def456')
    expect(provider?.name).toBe('loom')
  })

  it('should return null for unknown URLs', () => {
    expect(detectProvider('https://example.com')).toBeNull()
    expect(detectProvider('https://google.com/search?q=test')).toBeNull()
    expect(detectProvider('')).toBeNull()
  })
})

describe('parseEmbedUrl', () => {
  describe('YouTube', () => {
    it('should extract video ID from watch URL', () => {
      const result = parseEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      expect(result?.id).toBe('dQw4w9WgXcQ')
      expect(result?.embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
      expect(result?.provider.name).toBe('youtube')
    })

    it('should extract video ID from short URL', () => {
      const result = parseEmbedUrl('https://youtu.be/dQw4w9WgXcQ')
      expect(result?.id).toBe('dQw4w9WgXcQ')
      expect(result?.embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('should extract video ID from shorts URL', () => {
      const result = parseEmbedUrl('https://youtube.com/shorts/abc123xyz')
      expect(result?.id).toBe('abc123xyz')
      expect(result?.embedUrl).toBe('https://www.youtube.com/embed/abc123xyz')
    })
  })

  describe('Vimeo', () => {
    it('should extract video ID', () => {
      const result = parseEmbedUrl('https://vimeo.com/123456789')
      expect(result?.id).toBe('123456789')
      expect(result?.embedUrl).toBe('https://player.vimeo.com/video/123456789')
    })
  })

  describe('Spotify', () => {
    it('should extract track ID', () => {
      const result = parseEmbedUrl('https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh')
      expect(result?.id).toBe('track/4iV5W9uYEdYUVa79Axb7Rh')
      expect(result?.embedUrl).toBe('https://open.spotify.com/embed/track/4iV5W9uYEdYUVa79Axb7Rh')
    })

    it('should extract playlist ID', () => {
      const result = parseEmbedUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
      expect(result?.id).toBe('playlist/37i9dQZF1DXcBWIGoYBM5M')
      expect(result?.embedUrl).toBe(
        'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M'
      )
    })
  })

  describe('Twitter', () => {
    it('should extract tweet ID', () => {
      const result = parseEmbedUrl('https://twitter.com/user/status/1234567890')
      expect(result?.id).toBe('1234567890')
      expect(result?.embedUrl).toBe('https://platform.twitter.com/embed/Tweet.html?id=1234567890')
    })

    it('should handle x.com URLs', () => {
      const result = parseEmbedUrl('https://x.com/someone/status/9876543210')
      expect(result?.id).toBe('9876543210')
    })
  })

  describe('Figma', () => {
    it('should extract file ID', () => {
      const result = parseEmbedUrl('https://www.figma.com/file/abc123def')
      expect(result?.id).toBe('file/abc123def')
      expect(result?.embedUrl).toContain('figma.com/embed')
      expect(result?.embedUrl).toContain('file/abc123def')
    })
  })

  describe('CodeSandbox', () => {
    it('should extract sandbox ID', () => {
      const result = parseEmbedUrl('https://codesandbox.io/s/my-sandbox-abc123')
      expect(result?.id).toBe('my-sandbox-abc123')
      expect(result?.embedUrl).toContain('codesandbox.io/embed/my-sandbox-abc123')
    })
  })

  describe('Loom', () => {
    it('should extract video ID', () => {
      const result = parseEmbedUrl('https://www.loom.com/share/abc123def456')
      expect(result?.id).toBe('abc123def456')
      expect(result?.embedUrl).toBe('https://www.loom.com/embed/abc123def456')
    })
  })

  describe('unknown URLs', () => {
    it('should return null for unsupported URLs', () => {
      expect(parseEmbedUrl('https://example.com')).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(parseEmbedUrl('')).toBeNull()
    })

    it('should return null for non-URL text', () => {
      expect(parseEmbedUrl('not a url')).toBeNull()
    })
  })
})
