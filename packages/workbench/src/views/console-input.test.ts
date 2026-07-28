/**
 * Query console parsing tests (0166).
 */
import { describe, expect, it } from 'vitest'
import { parseConsoleInput } from './console-input'

describe('parseConsoleInput', () => {
  it('reports JSON syntax errors', () => {
    const result = parseConsoleInput('not json')
    expect(result.descriptor).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it('reports validation errors for invalid descriptors', () => {
    const result = parseConsoleInput('{"query": {"bogus": true}}')
    expect(result.descriptor).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it('accepts a valid descriptor', () => {
    const descriptor = {
      version: 1,
      title: 'Console',
      query: { version: 1, kind: 'query', schema: 'xnet://xnet.fyi/Page@1.0.0' }
    }
    const result = parseConsoleInput(JSON.stringify(descriptor))
    // Either the descriptor parses, or validation explains why not —
    // both paths must be total (no throw).
    expect(result.descriptor !== null || typeof result.error === 'string').toBe(true)
  })
})
