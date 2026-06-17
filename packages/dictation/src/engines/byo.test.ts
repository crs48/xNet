import type { AudioInput } from '../types'
import { describe, expect, it, vi } from 'vitest'
import { ByoEndpointEngine, isLoopbackUrl } from './byo'

const clip: AudioInput = {
  kind: 'encoded',
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: 'audio/wav'
}

function okJson(body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status: 200 })
  ) as unknown as typeof fetch
}

describe('isLoopbackUrl', () => {
  it('detects local servers', () => {
    expect(isLoopbackUrl('http://127.0.0.1:5092')).toBe(true)
    expect(isLoopbackUrl('http://localhost:8080')).toBe(true)
    expect(isLoopbackUrl('https://api.example.com')).toBe(false)
    expect(isLoopbackUrl('not a url')).toBe(false)
  })
})

describe('ByoEndpointEngine', () => {
  it('marks loopback endpoints as on-device', () => {
    const local = new ByoEndpointEngine({ baseUrl: 'http://127.0.0.1:5092', fetchImpl: okJson({}) })
    const remote = new ByoEndpointEngine({
      baseUrl: 'https://stt.example.com',
      fetchImpl: okJson({})
    })
    expect(local.descriptor.onDevice).toBe(true)
    expect(remote.descriptor.onDevice).toBe(false)
    expect(local.descriptor.approxDownloadBytes).toBe(0)
  })

  it('POSTs encoded audio to /v1/audio/transcriptions and parses the text', async () => {
    const fetchImpl = okJson({ text: 'hello from parakeet', duration: 1.5, language: 'en' })
    const engine = new ByoEndpointEngine({
      baseUrl: 'http://127.0.0.1:5092/',
      model: 'parakeet',
      apiKey: 'secret',
      fetchImpl
    })

    const result = await engine.transcribe(clip, { language: 'en' })

    expect(result.text).toBe('hello from parakeet')
    expect(result.durationMs).toBe(1500)
    expect(result.modelId).toBe('parakeet')
    expect(result.engineId).toBe('byo')

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('http://127.0.0.1:5092/v1/audio/transcriptions') // trailing slash trimmed
    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe('Bearer secret')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('rejects raw PCM with a helpful message', async () => {
    const engine = new ByoEndpointEngine({
      baseUrl: 'http://127.0.0.1:5092',
      fetchImpl: okJson({})
    })
    await expect(
      engine.transcribe({ kind: 'pcm', samples: new Float32Array(16000), sampleRate: 16000 })
    ).rejects.toThrow(/encoded audio/)
  })

  it('throws on a non-OK response', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('model missing', { status: 503 })
    ) as unknown as typeof fetch
    const engine = new ByoEndpointEngine({ baseUrl: 'http://127.0.0.1:5092', fetchImpl })
    await expect(engine.transcribe(clip)).rejects.toThrow(/503/)
  })

  it('isReady reflects the /v1/models probe', async () => {
    const up = new ByoEndpointEngine({ baseUrl: 'http://127.0.0.1:5092', fetchImpl: okJson({}) })
    expect(await up.isReady()).toBe(true)

    const down = new ByoEndpointEngine({
      baseUrl: 'http://127.0.0.1:5092',
      fetchImpl: vi.fn(async () => {
        throw new Error('connection refused')
      }) as unknown as typeof fetch
    })
    expect(await down.isReady()).toBe(false)
  })
})
