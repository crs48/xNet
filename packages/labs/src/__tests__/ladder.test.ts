import { describe, expect, it } from 'vitest'
import { LabRuntimeError, RuntimeLadder } from '../runtime/ladder'
import { appRuntime, sesRuntime, createDefaultLadder } from '../runtime/runtimes'
import type { Transpiler } from '../runtime/transpile'

describe('RuntimeLadder.pick', () => {
  const ladder = new RuntimeLadder([sesRuntime, appRuntime])

  it('picks a sandbox JS runtime', () => {
    expect(ladder.pick({ language: 'javascript', tier: 'sandbox' }).id).toBe('ses')
  })

  it('treats TypeScript as a JS rung', () => {
    expect(ladder.pick({ language: 'typescript', tier: 'sandbox' }).id).toBe('ses')
  })

  it('picks the app rung when asked', () => {
    expect(ladder.pick({ language: 'javascript', tier: 'app' }).id).toBe('app')
  })

  it('refuses a non-deterministic rung when determinism is required', () => {
    expect(() =>
      ladder.pick({ language: 'javascript', tier: 'app', requireDeterministic: true })
    ).toThrow(LabRuntimeError)
  })

  it('throws when no runtime supports the language/tier', () => {
    expect(() => ladder.pick({ language: 'rust', tier: 'sandbox' })).toThrow(LabRuntimeError)
  })
})

describe('RuntimeLadder.tiersForLanguage', () => {
  it('reports the tiers a language can run on', () => {
    const ladder = new RuntimeLadder([sesRuntime, appRuntime])
    expect(ladder.tiersForLanguage('javascript').sort()).toEqual(['app', 'sandbox'])
    expect(ladder.tiersForLanguage('python')).toEqual([])
  })
})

describe('RuntimeLadder.run', () => {
  it('transpiles TypeScript before running on a JS rung', async () => {
    const stripTypes: Transpiler = {
      async transpile(code) {
        return code.replace(/: number/g, '')
      }
    }
    const ladder = new RuntimeLadder([sesRuntime], stripTypes)
    const result = await ladder.run({
      code: 'const x: number = 21; return x * 2',
      language: 'typescript',
      tier: 'sandbox'
    })
    expect(result.ok).toBe(true)
    expect(result.value).toBe(42)
  })
})

describe('createDefaultLadder', () => {
  it('always includes SES and adds opt-in rungs', () => {
    const ids = createDefaultLadder()
      .list()
      .map((r) => r.id)
    expect(ids).toContain('ses')
    expect(ids).toContain('quickjs')

    const minimal = createDefaultLadder({ includeQuickjs: false, includeApp: false, includePython: false })
      .list()
      .map((r) => r.id)
    expect(minimal).toEqual(['ses'])
  })

  it('adds a server rung when a backend is supplied', () => {
    const ladder = createDefaultLadder({
      server: { backend: { supports: () => true, exec: async () => ({ kind: 'stdout', logs: [] }) } }
    })
    expect(ladder.list().some((r) => r.tier === 'server')).toBe(true)
  })
})
