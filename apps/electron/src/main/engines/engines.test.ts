/**
 * Native STT engine behavior WITHOUT the optional addons installed — the
 * common case in CI and on fresh machines. The engines must degrade politely
 * (not-ready + instructive error), never crash, so the registry can route to
 * another engine (exploration 0279 swappable-model contract).
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ParakeetSherpaEngine } from './parakeet-sherpa'
import { WhisperCppEngine } from './whisper-cpp'

const dir = mkdtempSync(join(tmpdir(), 'xnet-engines-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('ParakeetSherpaEngine (addon absent)', () => {
  const engine = new ParakeetSherpaEngine({ modelDir: join(dir, 'parakeet') })

  it('describes itself as the on-device English engine with attribution', () => {
    expect(engine.descriptor.id).toBe('parakeet-sherpa')
    expect(engine.descriptor.languages).toEqual(['en'])
    expect(engine.descriptor.onDevice).toBe(true)
    // CC-BY-4.0 attribution MUST surface in Settings when active.
    expect(engine.descriptor.attribution).toContain('CC-BY-4.0')
    expect(engine.descriptor.approxDownloadBytes).toBeGreaterThan(500_000_000)
  })

  it('reports not-ready instead of crashing', async () => {
    await expect(engine.isReady()).resolves.toBe(false)
  })

  it('ensureModel explains how to enable the engine', async () => {
    await expect(engine.ensureModel()).rejects.toThrow(/sherpa-onnx-node/)
  })
})

describe('WhisperCppEngine (addon absent)', () => {
  const engine = new WhisperCppEngine({ modelDir: join(dir, 'whisper') })

  it('is the multilingual fallback', () => {
    expect(engine.descriptor.id).toBe('whisper-cpp')
    expect(engine.descriptor.languages).toEqual(['*'])
    expect(engine.descriptor.onDevice).toBe(true)
  })

  it('reports not-ready and explains the missing addon', async () => {
    await expect(engine.isReady()).resolves.toBe(false)
    await expect(engine.ensureModel()).rejects.toThrow(/smart-whisper/)
  })

  it('rejects encoded audio up front (PCM-only port usage)', async () => {
    await expect(
      engine.transcribe({ kind: 'encoded', bytes: new Uint8Array(4), mimeType: 'audio/wav' })
    ).rejects.toThrow(/PCM/)
  })
})
