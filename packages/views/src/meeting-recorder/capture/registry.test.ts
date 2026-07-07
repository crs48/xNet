/**
 * Meeting engine registry tests (exploration 0279): IPC engines register from
 * the bridge, the BYO endpoint joins (PCM→WAV adapted), and the persisted
 * preference wins the default slot.
 */

import type { AudioInput, DictationEngine, TranscriptResult } from '@xnetjs/dictation'
import { describe, expect, it, vi } from 'vitest'
import { PcmToWavEngine, buildMeetingEngineRegistry } from './registry'
import { fakeMeetingsBridge as fakeBridge } from './test-bridge'

describe('buildMeetingEngineRegistry', () => {
  it('registers every bridge engine and defaults to the first ready one', async () => {
    const registry = await buildMeetingEngineRegistry({ bridge: fakeBridge(), prefs: {} })
    expect(registry.list().map((d) => d.id)).toEqual(['parakeet-sherpa', 'whisper-cpp'])
    expect(registry.getDefaultId()).toBe('whisper-cpp')
  })

  it('is empty (not throwing) when there is no bridge and no BYO endpoint', async () => {
    const registry = await buildMeetingEngineRegistry({ bridge: null, prefs: {} })
    expect(registry.list()).toEqual([])
  })

  it('registers the BYO endpoint when configured, wrapped for PCM input', async () => {
    const registry = await buildMeetingEngineRegistry({
      bridge: null,
      prefs: { byoEndpoint: 'http://127.0.0.1:5092' }
    })
    const descriptors = registry.list()
    expect(descriptors).toHaveLength(1)
    expect(descriptors[0]!.id).toBe('byo')
    // Loopback URL ⇒ still on-device.
    expect(descriptors[0]!.onDevice).toBe(true)
    expect(registry.get('byo')).toBeInstanceOf(PcmToWavEngine)
  })

  it('honors the persisted preferred engine as the default', async () => {
    const registry = await buildMeetingEngineRegistry({
      bridge: fakeBridge(),
      prefs: { preferredEngineId: 'parakeet-sherpa' }
    })
    expect(registry.getDefaultId()).toBe('parakeet-sherpa')
  })

  it('ignores a preferred engine that is not installed', async () => {
    const registry = await buildMeetingEngineRegistry({
      bridge: fakeBridge(),
      prefs: { preferredEngineId: 'apple-speech' }
    })
    expect(registry.getDefaultId()).toBe('whisper-cpp')
  })

  it('degrades to the BYO engine when the bridge is broken', async () => {
    const bridge = fakeBridge()
    ;(bridge.engines as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ipc down'))
    const registry = await buildMeetingEngineRegistry({
      bridge,
      prefs: { byoEndpoint: 'http://127.0.0.1:5092' }
    })
    expect(registry.list().map((d) => d.id)).toEqual(['byo'])
  })
})

describe('PcmToWavEngine', () => {
  it('encodes PCM to a WAV blob before delegating', async () => {
    let received: AudioInput | null = null
    const inner: DictationEngine = {
      descriptor: {
        id: 'byo',
        name: 'Custom endpoint',
        languages: ['*'],
        approxDownloadBytes: 0,
        onDevice: true
      },
      isReady: async () => true,
      ensureModel: async () => undefined,
      transcribe: async (audio): Promise<TranscriptResult> => {
        received = audio
        return { text: 'ok', durationMs: 0, engineId: 'byo', modelId: 'whisper-1' }
      }
    }
    const engine = new PcmToWavEngine(inner)
    await engine.transcribe({ kind: 'pcm', samples: new Float32Array(160), sampleRate: 16_000 })
    expect(received).not.toBeNull()
    expect(received!.kind).toBe('encoded')
    if (received!.kind === 'encoded') {
      expect(received!.mimeType).toBe('audio/wav')
      expect(received!.bytes.length).toBe(44 + 160 * 2)
    }
  })

  it('passes already-encoded audio through untouched', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    let received: AudioInput | null = null
    const inner: DictationEngine = {
      descriptor: {
        id: 'byo',
        name: 'Custom endpoint',
        languages: ['*'],
        approxDownloadBytes: 0,
        onDevice: true
      },
      isReady: async () => true,
      ensureModel: async () => undefined,
      transcribe: async (audio): Promise<TranscriptResult> => {
        received = audio
        return { text: 'ok', durationMs: 0, engineId: 'byo', modelId: 'whisper-1' }
      }
    }
    await new PcmToWavEngine(inner).transcribe({ kind: 'encoded', bytes, mimeType: 'audio/webm' })
    expect(received!.kind).toBe('encoded')
    if (received!.kind === 'encoded') expect(received!.bytes).toBe(bytes)
  })
})
