import type { AudioInput } from '../types'
import { describe, expect, it } from 'vitest'
import { FakeDictationEngine } from './fake'

const pcm: AudioInput = { kind: 'pcm', samples: new Float32Array(32000), sampleRate: 16000 }

describe('FakeDictationEngine', () => {
  it('transcribes with the default script and derives duration from PCM', async () => {
    const engine = new FakeDictationEngine()
    const result = await engine.transcribe(pcm)
    expect(result.text).toBe('hello world')
    expect(result.durationMs).toBe(2000) // 32000 samples / 16000 Hz
    expect(result.engineId).toBe('fake')
    expect(result.modelId).toBe('fake-model')
    expect(engine.calls).toHaveLength(1)
  })

  it('supports a scripted function and a language hint', async () => {
    const engine = new FakeDictationEngine({
      id: 'scripted',
      script: (audio) => (audio.kind === 'pcm' ? 'pcm clip' : 'encoded clip')
    })
    const result = await engine.transcribe(pcm, { language: 'fr' })
    expect(result.text).toBe('pcm clip')
    expect(result.language).toBe('fr')
  })

  it('starts un-ready and becomes ready after ensureModel, reporting progress', async () => {
    const engine = new FakeDictationEngine({ ready: false })
    expect(await engine.isReady()).toBe(false)
    await expect(engine.transcribe(pcm)).rejects.toThrow(/not ready/)

    const progress: number[] = []
    await engine.ensureModel((p) => progress.push(p.fraction))
    expect(progress).toEqual([0, 1])
    expect(engine.ensureModelCalls).toBe(1)
    expect(await engine.isReady()).toBe(true)

    const result = await engine.transcribe(pcm)
    expect(result.text).toBe('hello world')
  })

  it('exposes a descriptor with declared language', () => {
    const engine = new FakeDictationEngine({ language: 'en', approxDownloadBytes: 123 })
    expect(engine.descriptor.languages).toEqual(['en'])
    expect(engine.descriptor.approxDownloadBytes).toBe(123)
    expect(engine.descriptor.onDevice).toBe(true)
  })
})
