import { EngineRegistry, FakeDictationEngine } from '@xnetjs/dictation'
import { describe, expect, it } from 'vitest'
import { selectEngine } from './select'

const registryWith = (...engines: FakeDictationEngine[]) => {
  const registry = new EngineRegistry()
  for (const engine of engines) registry.register(engine)
  return registry
}

// Parakeet v2 is the poster child: English-only, on-device.
const parakeet = () => new FakeDictationEngine({ id: 'parakeet-sherpa', language: 'en' })
const whisper = () => new FakeDictationEngine({ id: 'whisper-cpp' }) // languages: ['*']

describe('selectEngine', () => {
  it('returns undefined on an empty registry', () => {
    expect(selectEngine(new EngineRegistry())).toBeUndefined()
  })

  it('honors the preference when it speaks the session language', () => {
    const registry = registryWith(whisper(), parakeet())
    const selection = selectEngine(registry, {
      language: 'en-US',
      preferredEngineId: 'parakeet-sherpa'
    })
    expect(selection?.engine.descriptor.id).toBe('parakeet-sherpa')
    expect(selection?.reason).toBe('preferred')
  })

  it('falls back VISIBLY when the preferred engine cannot speak the language', () => {
    const registry = registryWith(parakeet(), whisper())
    const selection = selectEngine(registry, {
      language: 'de',
      preferredEngineId: 'parakeet-sherpa'
    })
    expect(selection?.engine.descriptor.id).toBe('whisper-cpp')
    expect(selection?.reason).toBe('language-fallback')
    expect(selection?.fallbackFrom?.id).toBe('parakeet-sherpa')
  })

  it('keeps the preference (still flagged) when nothing speaks the language', () => {
    const registry = registryWith(parakeet())
    const selection = selectEngine(registry, {
      language: 'de',
      preferredEngineId: 'parakeet-sherpa'
    })
    expect(selection?.engine.descriptor.id).toBe('parakeet-sherpa')
    expect(selection?.reason).toBe('language-fallback')
  })

  it('uses the registry default when no preference is set', () => {
    const registry = registryWith(whisper(), parakeet())
    const selection = selectEngine(registry, { language: 'en' })
    expect(selection?.engine.descriptor.id).toBe('whisper-cpp') // first registered = default
    expect(selection?.reason).toBe('default')
  })
})
