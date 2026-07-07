/**
 * IpcDictationEngine tests (exploration 0279) — a fake preload bridge stands
 * in for `window.xnetMeetings`; the engine must mirror the descriptor, gate
 * on PCM input, and round-trip ensureModel progress over the IPC seam.
 */

import type { MeetingsBridge, MeetingsBridgeEngine } from './bridge'
import type { ModelDownloadProgress, TranscriptResult } from '@xnetjs/dictation'
import { describe, expect, it, vi } from 'vitest'
import { IpcDictationEngine } from './ipc-engine'

const PARAKEET: MeetingsBridgeEngine = {
  id: 'parakeet-sherpa',
  name: 'NVIDIA Parakeet',
  languages: ['en'],
  approxDownloadBytes: 600_000_000,
  onDevice: true,
  attribution: 'NVIDIA Parakeet — CC-BY-4.0',
  ready: false
}

function fakeBridge(overrides: Partial<MeetingsBridge> = {}): MeetingsBridge {
  return {
    captureStatus: vi.fn(async () => ({
      systemAudioAvailable: true,
      platform: 'darwin',
      loopbackArmed: false
    })),
    armLoopback: vi.fn(async () => undefined),
    disarmLoopback: vi.fn(async () => undefined),
    engines: vi.fn(async () => [PARAKEET]),
    ensureEngine: vi.fn(async () => undefined),
    onEngineProgress: vi.fn(() => () => undefined),
    transcribe: vi.fn(
      async (): Promise<TranscriptResult> => ({
        text: 'hello world',
        durationMs: 1200,
        engineId: 'parakeet-sherpa',
        modelId: 'parakeet-tdt-0.6b-v2'
      })
    ),
    ...overrides
  }
}

describe('IpcDictationEngine', () => {
  it('mirrors the main-process descriptor, attribution included', () => {
    const engine = new IpcDictationEngine(fakeBridge(), PARAKEET, false)
    expect(engine.descriptor.id).toBe('parakeet-sherpa')
    expect(engine.descriptor.attribution).toBe('NVIDIA Parakeet — CC-BY-4.0')
    expect(engine.descriptor.onDevice).toBe(true)
    // The bridge-only `ready` flag must not leak into the descriptor.
    expect('ready' in engine.descriptor).toBe(false)
  })

  it('reports readiness from construction and flips it after ensureModel', async () => {
    const bridge = fakeBridge()
    const engine = new IpcDictationEngine(bridge, PARAKEET, false)
    await expect(engine.isReady()).resolves.toBe(false)
    await engine.ensureModel()
    expect(bridge.ensureEngine).toHaveBeenCalledWith('parakeet-sherpa')
    await expect(engine.isReady()).resolves.toBe(true)
  })

  it('subscribes progress for the download and unsubscribes after', async () => {
    const unsubscribe = vi.fn()
    let captured: ((progress: ModelDownloadProgress) => void) | null = null
    const bridge = fakeBridge({
      onEngineProgress: vi.fn((_engineId, handler) => {
        captured = handler
        return unsubscribe
      }),
      ensureEngine: vi.fn(async () => {
        captured?.({ fraction: 0.5 })
      })
    })
    const engine = new IpcDictationEngine(bridge, PARAKEET)
    const onProgress = vi.fn()
    await engine.ensureModel(onProgress)
    expect(onProgress).toHaveBeenCalledWith({ fraction: 0.5 })
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('unsubscribes progress even when the download fails', async () => {
    const unsubscribe = vi.fn()
    const bridge = fakeBridge({
      onEngineProgress: vi.fn(() => unsubscribe),
      ensureEngine: vi.fn(async () => {
        throw new Error('download failed')
      })
    })
    const engine = new IpcDictationEngine(bridge, PARAKEET)
    await expect(engine.ensureModel(vi.fn())).rejects.toThrow('download failed')
    expect(unsubscribe).toHaveBeenCalledOnce()
    await expect(engine.isReady()).resolves.toBe(false)
  })

  it('forwards PCM transcriptions over the bridge with the language hint', async () => {
    const bridge = fakeBridge()
    const engine = new IpcDictationEngine(bridge, PARAKEET, true)
    const samples = new Float32Array([0, 0.1, -0.1])
    const result = await engine.transcribe(
      { kind: 'pcm', samples, sampleRate: 16_000 },
      { language: 'en' }
    )
    expect(bridge.transcribe).toHaveBeenCalledWith({
      engineId: 'parakeet-sherpa',
      samples,
      sampleRate: 16_000,
      language: 'en'
    })
    expect(result.text).toBe('hello world')
  })

  it('rejects encoded audio — the capture session only emits PCM', async () => {
    const engine = new IpcDictationEngine(fakeBridge(), PARAKEET, true)
    await expect(
      engine.transcribe({ kind: 'encoded', bytes: new Uint8Array(4), mimeType: 'audio/wav' })
    ).rejects.toThrow(/PCM/)
  })
})
