import type { EditorContribution } from './contributions'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  findEditorSchemaRisks,
  isSchemaDefiningExtension,
  warnOnEditorSchemaRisks
} from './editor-schema-safety'

// EditorContribution.extension is a TipTap Extension; fake the shape we read.
function contribution(id: string, type: string, name: string): EditorContribution {
  return { id, extension: { type, name } as unknown as EditorContribution['extension'] }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('editor-schema-safety', () => {
  it('classifies nodes and marks as schema-defining', () => {
    expect(isSchemaDefiningExtension({ type: 'node' })).toBe(true)
    expect(isSchemaDefiningExtension({ type: 'mark' })).toBe(true)
    expect(isSchemaDefiningExtension({ type: 'extension' })).toBe(false)
    expect(isSchemaDefiningExtension({})).toBe(false)
  })

  it('finds schema-defining contributions and ignores behavior ones', () => {
    const risks = findEditorSchemaRisks([
      contribution('a', 'node', 'customBlock'),
      contribution('b', 'extension', 'slashCommand'),
      contribution('c', 'mark', 'highlight')
    ])
    expect(risks).toEqual([
      { id: 'a', kind: 'node', name: 'customBlock' },
      { id: 'c', kind: 'mark', name: 'highlight' }
    ])
  })

  it('returns no risks for behavior-only contributions', () => {
    expect(findEditorSchemaRisks([contribution('a', 'extension', 'keymap')])).toEqual([])
  })

  it('warns once per risky contribution in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    try {
      const risks = warnOnEditorSchemaRisks('fyi.xnet.test', [
        contribution('a', 'node', 'customBlock'),
        contribution('b', 'extension', 'toolbar')
      ])
      expect(risks).toHaveLength(1)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]?.[0]).toContain('customBlock')
    } finally {
      process.env.NODE_ENV = prev
    }
  })

  it('does not warn in production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      warnOnEditorSchemaRisks('fyi.xnet.test', [contribution('a', 'node', 'customBlock')])
      expect(warn).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = prev
    }
  })
})
