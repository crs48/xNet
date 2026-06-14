import { describe, expect, it } from 'vitest'
import { isQuickjsAvailable, runQuickjs } from '../runtime/quickjs'

describe('runQuickjs', () => {
  it('is available in this environment', async () => {
    expect(await isQuickjsAvailable()).toBe(true)
  })

  it('returns the value and captures console output', async () => {
    const result = await runQuickjs({
      code: 'console.log("from quickjs", 1); return [1, 2, 3].reduce((a, b) => a + b, 0)',
      language: 'javascript'
    })
    expect(result.ok).toBe(true)
    expect(result.value).toBe(6)
    expect(result.engine).toBe('quickjs')
    expect(result.logs.map((l) => l.message)).toContain('from quickjs 1')
  })

  it('has no ambient host globals', async () => {
    const result = await runQuickjs({
      code: 'return typeof fetch + "," + typeof window',
      language: 'javascript'
    })
    expect(result.ok).toBe(true)
    expect(result.value).toBe('undefined,undefined')
  })

  it('kills an infinite loop via the deadline interrupt handler', async () => {
    const result = await runQuickjs({
      code: 'while (true) {}',
      language: 'javascript',
      timeoutMs: 150
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/interrupt/i)
  })

  it('enforces the memory ceiling', async () => {
    const result = await runQuickjs({
      code: 'const a = []; while (true) { a.push(new Array(10000).fill(0)) } return a.length',
      language: 'javascript',
      timeoutMs: 2000,
      memoryBytes: 1024 * 1024
    })
    expect(result.ok).toBe(false)
  })
})
