import { describe, it, expect } from 'vitest'
import type { PluginConfigField } from './first-party-catalog'
import {
  clearPluginConfig,
  isPluginConfigured,
  onPluginConfigChange,
  readPluginConfig,
  writePluginConfig,
  type KeyValueStore
} from './plugin-config'

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k)
  }
}

describe('plugin config storage', () => {
  it('round-trips values per plugin', () => {
    const store = memoryStore()
    writePluginConfig('a.b.c', { TOKEN: 't1', owner: 'acme' }, store)
    writePluginConfig('a.b.other', { TOKEN: 't2' }, store)
    expect(readPluginConfig('a.b.c', store)).toEqual({ TOKEN: 't1', owner: 'acme' })
    expect(readPluginConfig('a.b.other', store)).toEqual({ TOKEN: 't2' })
  })

  it('drops empty values and removes the key when nothing remains', () => {
    const store = memoryStore()
    writePluginConfig('a.b.c', { TOKEN: 't', owner: '  ' }, store)
    expect(readPluginConfig('a.b.c', store)).toEqual({ TOKEN: 't' })
    writePluginConfig('a.b.c', { TOKEN: '' }, store)
    expect(readPluginConfig('a.b.c', store)).toEqual({})
  })

  it('clears config on demand', () => {
    const store = memoryStore()
    writePluginConfig('a.b.c', { TOKEN: 't' }, store)
    clearPluginConfig('a.b.c', store)
    expect(readPluginConfig('a.b.c', store)).toEqual({})
  })

  it('returns {} for corrupt or non-object payloads', () => {
    const store = memoryStore()
    store.setItem('xnet.pluginConfig.a.b.c', 'not json')
    expect(readPluginConfig('a.b.c', store)).toEqual({})
    store.setItem('xnet.pluginConfig.a.b.c', '[1,2]')
    expect(readPluginConfig('a.b.c', store)).toEqual({})
  })

  it('notifies listeners on write and clear', () => {
    const store = memoryStore()
    const seen: string[] = []
    const off = onPluginConfigChange((id) => seen.push(id))
    writePluginConfig('a.b.c', { TOKEN: 't' }, store)
    clearPluginConfig('a.b.c', store)
    off()
    writePluginConfig('a.b.c', { TOKEN: 't2' }, store)
    expect(seen).toEqual(['a.b.c', 'a.b.c'])
  })
})

describe('isPluginConfigured', () => {
  const fields: PluginConfigField[] = [
    { key: 'TOKEN', label: 'Token', kind: 'secret', required: true },
    { key: 'note', label: 'Note', kind: 'text' }
  ]

  it('requires every required field to be non-empty', () => {
    expect(isPluginConfigured(fields, {})).toBe(false)
    expect(isPluginConfigured(fields, { TOKEN: '  ' })).toBe(false)
    expect(isPluginConfigured(fields, { TOKEN: 't' })).toBe(true)
  })

  it('is true with no spec', () => {
    expect(isPluginConfigured(undefined, {})).toBe(true)
  })
})
