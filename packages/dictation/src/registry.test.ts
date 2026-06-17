import { describe, expect, it } from 'vitest'
import { FakeDictationEngine } from './engines/fake'
import { EngineRegistry } from './registry'

describe('EngineRegistry', () => {
  it('registers, looks up, and lists descriptors', () => {
    const registry = new EngineRegistry()
    const whisper = new FakeDictationEngine({ id: 'whisper', name: 'Whisper' })
    const parakeet = new FakeDictationEngine({ id: 'parakeet', name: 'Parakeet' })
    registry.register(whisper)
    registry.register(parakeet)

    expect(registry.has('whisper')).toBe(true)
    expect(registry.get('parakeet')).toBe(parakeet)
    expect(registry.list().map((d) => d.id)).toEqual(['whisper', 'parakeet'])
  })

  it('makes the first registered engine the default', () => {
    const registry = new EngineRegistry()
    registry.register(new FakeDictationEngine({ id: 'a' }))
    registry.register(new FakeDictationEngine({ id: 'b' }))
    expect(registry.getDefaultId()).toBe('a')
  })

  it('honors makeDefault and setDefault', () => {
    const registry = new EngineRegistry()
    registry.register(new FakeDictationEngine({ id: 'a' }))
    registry.register(new FakeDictationEngine({ id: 'b' }), { makeDefault: true })
    expect(registry.getDefaultId()).toBe('b')

    registry.setDefault('a')
    expect(registry.getDefaultId()).toBe('a')
    expect(() => registry.setDefault('missing')).toThrow(/unregistered/)
  })

  it('resolve prefers explicit id, then default', () => {
    const registry = new EngineRegistry()
    const a = new FakeDictationEngine({ id: 'a' })
    const b = new FakeDictationEngine({ id: 'b' })
    registry.register(a)
    registry.register(b)
    expect(registry.resolve('b')).toBe(b)
    expect(registry.resolve('nope')).toBe(a) // falls back to default
    expect(registry.resolve()).toBe(a)
  })

  it('unregistering the default falls back to the next engine', () => {
    const registry = new EngineRegistry()
    registry.register(new FakeDictationEngine({ id: 'a' }))
    registry.register(new FakeDictationEngine({ id: 'b' }))
    registry.unregister('a')
    expect(registry.getDefaultId()).toBe('b')
    registry.unregister('b')
    expect(registry.getDefaultId()).toBeNull()
    expect(registry.getDefault()).toBeUndefined()
  })
})
