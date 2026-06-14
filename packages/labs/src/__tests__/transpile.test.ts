import { describe, expect, it } from 'vitest'
import { createSwcTranspiler, identityTranspiler, isJsTranspilable } from '../runtime/transpile'

describe('identityTranspiler', () => {
  it('passes JavaScript through untouched', async () => {
    expect(await identityTranspiler.transpile('return 1', 'javascript')).toBe('return 1')
  })

  it('refuses TypeScript (needs a real transpiler)', async () => {
    await expect(
      identityTranspiler.transpile('const x: number = 1', 'typescript')
    ).rejects.toThrow()
  })

  it('refuses compiled languages', async () => {
    await expect(identityTranspiler.transpile('int main(){}', 'c')).rejects.toThrow()
  })
})

describe('createSwcTranspiler', () => {
  it('delegates TypeScript to the injected swc module', async () => {
    const transpiler = createSwcTranspiler({
      transformSync: (code) => ({ code: code.replace(/: number/g, '') })
    })
    expect(await transpiler.transpile('const x: number = 1', 'typescript')).toBe('const x = 1')
  })

  it('passes JavaScript through without invoking swc', async () => {
    let called = false
    const transpiler = createSwcTranspiler({
      transformSync: () => {
        called = true
        return { code: '' }
      }
    })
    expect(await transpiler.transpile('return 1', 'javascript')).toBe('return 1')
    expect(called).toBe(false)
  })
})

describe('isJsTranspilable', () => {
  it('is true only for JS/TS', () => {
    expect(isJsTranspilable('javascript')).toBe(true)
    expect(isJsTranspilable('typescript')).toBe(true)
    expect(isJsTranspilable('python')).toBe(false)
    expect(isJsTranspilable('rust')).toBe(false)
  })
})
