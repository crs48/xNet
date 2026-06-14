/**
 * Lab transpilation (exploration 0180).
 *
 * JS engines (SES / QuickJS) only run JavaScript, so TypeScript/JSX Labs must
 * be transpiled first. The `Transpiler` interface is the seam: the default
 * `identityTranspiler` passes JavaScript through untouched, and the browser
 * lazily supplies a real one backed by `@swc/wasm-web` via
 * `createSwcTranspiler(initializedSwcModule)`. The module is INJECTED (it is
 * loaded + `initialize()`-d by the caller) so this file stays node-safe and
 * deterministically testable — the same pattern as the WebLLM provider.
 */

import type { LabLanguage } from './types'

export interface Transpiler {
  /** Transpile `code` for `language` to runnable JavaScript. */
  transpile(code: string, language: LabLanguage): Promise<string>
}

/** A language the JS rungs can run after transpilation. */
export function isJsTranspilable(language: LabLanguage): boolean {
  return language === 'javascript' || language === 'typescript'
}

/** Passes JavaScript through; rejects anything that genuinely needs a compiler. */
export const identityTranspiler: Transpiler = {
  async transpile(code, language) {
    if (language === 'javascript') return code
    if (language === 'typescript') {
      throw new Error('TypeScript Labs require a transpiler (none configured)')
    }
    throw new Error(`identityTranspiler cannot handle ${language}`)
  }
}

/** Minimal structural shape of the initialized `@swc/wasm-web` module. */
export interface SwcModuleLike {
  transformSync: (code: string, options: Record<string, unknown>) => { code: string }
}

/**
 * Build a transpiler over an already-initialized `@swc/wasm-web` module.
 * Strips types and lowers JSX to plain JS; leaves plain JavaScript untouched.
 */
export function createSwcTranspiler(swc: SwcModuleLike): Transpiler {
  return {
    async transpile(code, language) {
      if (language === 'javascript') return code
      if (language !== 'typescript') {
        throw new Error(`swc transpiler cannot handle ${language}`)
      }
      const out = swc.transformSync(code, {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          target: 'es2022'
        },
        module: { type: 'es6' }
      })
      return out.code
    }
  }
}
