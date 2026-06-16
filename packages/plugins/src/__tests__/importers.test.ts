import type { ImporterContribution } from '../contributions'
import { describe, expect, it } from 'vitest'
import { importerAdapters, resolveImporters } from '../importers'

describe('importerAdapters', () => {
  it('extracts the adapter object from each contribution', () => {
    const igAdapter = { id: 'instagram', detect: () => 1 }
    const contributions: ImporterContribution[] = [
      {
        id: 'fyi.xnet.import.instagram',
        platform: 'instagram',
        version: '1.0.0',
        adapter: igAdapter
      }
    ]
    expect(importerAdapters(contributions)).toEqual([igAdapter])
  })
})

describe('resolveImporters', () => {
  it('merges built-ins with contributed, deduped by id (contributed wins)', () => {
    const builtIns = [
      { id: 'instagram', src: 'builtin' },
      { id: 'youtube', src: 'builtin' }
    ]
    const contributed = [
      { id: 'instagram', src: 'plugin' }, // overrides the built-in
      { id: 'tiktok', src: 'plugin' }
    ]
    const merged = resolveImporters(builtIns, contributed)
    expect(merged.find((m) => m.id === 'instagram')?.src).toBe('plugin')
    expect(merged.find((m) => m.id === 'youtube')?.src).toBe('builtin')
    expect(merged.map((m) => m.id).sort()).toEqual(['instagram', 'tiktok', 'youtube'])
  })

  it('returns the built-ins unchanged when there are no contributions', () => {
    const builtIns = [{ id: 'a' }, { id: 'b' }]
    expect(resolveImporters(builtIns, [])).toEqual(builtIns)
  })
})
