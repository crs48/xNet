import type { EditorContribution } from './contributions'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  findEditorSchemaRisks,
  isSchemaDefiningContribution,
  warnOnEditorSchemaRisks
} from './editor-schema-safety'

const spec = {} as unknown

afterEach(() => {
  vi.restoreAllMocks()
})

describe('editor-schema-safety (BlockNote specs, 0312)', () => {
  it('classifies spec-carrying contributions as schema-defining', () => {
    expect(isSchemaDefiningContribution({ id: 'a', blockSpecs: { mermaid: spec } })).toBe(true)
    expect(isSchemaDefiningContribution({ id: 'b', inlineContentSpecs: { mention: spec } })).toBe(
      true
    )
    expect(isSchemaDefiningContribution({ id: 'c', styleSpecs: { aiGenerated: spec } })).toBe(true)
    expect(isSchemaDefiningContribution({ id: 'd', slashMenuItems: [] })).toBe(false)
    expect(isSchemaDefiningContribution({ id: 'e' })).toBe(false)
  })

  it('flags specs that are not statically bundled', () => {
    const contributions: EditorContribution[] = [
      { id: 'a', blockSpecs: { mermaid: spec, customBlock: spec } },
      { id: 'b', slashMenuItems: [] },
      { id: 'c', styleSpecs: { highlight: spec } }
    ]
    const risks = findEditorSchemaRisks(contributions, ['mermaid'])
    expect(risks).toEqual([
      { id: 'a', kind: 'block', name: 'customBlock' },
      { id: 'c', kind: 'style', name: 'highlight' }
    ])
  })

  it('returns no risks when every spec is bundled or behavior-only', () => {
    expect(
      findEditorSchemaRisks(
        [
          { id: 'a', blockSpecs: { mermaid: spec } },
          { id: 'b', slashMenuItems: [] }
        ],
        ['mermaid']
      )
    ).toEqual([])
  })

  it('warns once per risky spec in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    try {
      const risks = warnOnEditorSchemaRisks(
        'fyi.xnet.test',
        [
          { id: 'a', blockSpecs: { customBlock: spec } },
          { id: 'b', slashMenuItems: [] }
        ],
        ['mermaid']
      )
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
      warnOnEditorSchemaRisks('fyi.xnet.test', [{ id: 'a', blockSpecs: { x: spec } }], [])
      expect(warn).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = prev
    }
  })
})
