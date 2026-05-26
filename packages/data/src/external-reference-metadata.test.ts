import { describe, expect, it, vi } from 'vitest'
import {
  getExternalReferenceOEmbedEndpoint,
  parseOpenGraphMetadata,
  resolveExternalReferenceMetadata
} from './external-reference-metadata'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  })
}

function htmlResponse(value: string, status = 200): Response {
  return new Response(value, {
    status,
    headers: {
      'content-type': 'text/html'
    }
  })
}

describe('external reference metadata pipeline', () => {
  it('creates provider-specific oEmbed endpoints', () => {
    expect(
      getExternalReferenceOEmbedEndpoint({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        provider: 'youtube'
      })
    ).toBe(
      'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&format=json'
    )

    expect(
      getExternalReferenceOEmbedEndpoint({
        url: 'https://vimeo.com/76979871',
        provider: 'vimeo'
      })
    ).toBe('https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F76979871')

    expect(
      getExternalReferenceOEmbedEndpoint({
        url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
        provider: 'spotify'
      })
    ).toBe(
      'https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Fplaylist%2F37i9dQZF1DXcBWIGoYBM5M'
    )

    expect(
      getExternalReferenceOEmbedEndpoint({
        url: 'https://x.com/storybookjs/status/1606321052308658177',
        provider: 'twitter'
      })
    ).toBe(
      'https://publish.x.com/oembed?url=https%3A%2F%2Fx.com%2Fstorybookjs%2Fstatus%2F1606321052308658177&omit_script=true'
    )
  })

  it('resolves oEmbed metadata before trying Open Graph', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        title: 'Tiny Desk Concert',
        author_name: 'NPR Music',
        provider_name: 'YouTube',
        thumbnail_url: 'https://i.ytimg.com/vi/example/hqdefault.jpg'
      })
    )

    const result = await resolveExternalReferenceMetadata({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      provider: 'youtube',
      fetcher,
      allowOpenGraph: true
    })

    expect(result).toMatchObject({
      status: 'resolved',
      metadata: {
        source: 'oembed',
        title: 'Tiny Desk Concert',
        subtitle: 'NPR Music',
        providerName: 'YouTube',
        imageUrl: 'https://i.ytimg.com/vi/example/hqdefault.jpg'
      }
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('normalizes Open Graph metadata from HTML', () => {
    expect(
      parseOpenGraphMetadata(`
        <html>
          <head>
            <title>Fallback title</title>
            <meta property="og:title" content="Roadmap &amp; planning" />
            <meta name="description" content="A planning workspace" />
            <meta property="og:image" content="https://example.com/preview.png" />
            <meta property="og:site_name" content="Example Docs" />
          </head>
        </html>
      `)
    ).toEqual({
      title: 'Roadmap & planning',
      description: 'A planning workspace',
      imageUrl: 'https://example.com/preview.png',
      siteName: 'Example Docs'
    })
  })

  it('falls back to Open Graph when oEmbed metadata is unavailable', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes('/oembed')
        ? jsonResponse({}, 404)
        : htmlResponse(`
            <html>
              <head>
                <meta property="og:title" content="Workspace planning" />
                <meta property="og:description" content="Project map" />
                <meta property="og:site_name" content="Example" />
              </head>
            </html>
          `)
    )

    const result = await resolveExternalReferenceMetadata({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      provider: 'youtube',
      fetcher,
      allowOpenGraph: true,
      openGraphProxyUrl: 'https://metadata.local/resolve'
    })

    expect(result).toMatchObject({
      status: 'resolved',
      metadata: {
        source: 'open-graph',
        sourceUrl:
          'https://metadata.local/resolve?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ',
        title: 'Workspace planning',
        subtitle: 'Example',
        description: 'Project map'
      }
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not fall through to Open Graph when provider metadata is blocked', async () => {
    const fetcher = vi.fn(async () => jsonResponse({}, 403))

    const result = await resolveExternalReferenceMetadata({
      url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      provider: 'spotify',
      fetcher,
      allowOpenGraph: true
    })

    expect(result).toMatchObject({
      status: 'blocked',
      metadata: null,
      source: 'oembed'
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
