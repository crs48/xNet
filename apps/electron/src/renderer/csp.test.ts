/**
 * Content-Security-Policy contract for the shipped HTML shells (0394).
 *
 * These policies are single-line meta tags that are easy to edit by accident
 * and impossible to notice regressing — the on-device AI tiers fail at
 * runtime, in a packaged build, with a console error nobody is watching.
 * The named consumer for this check is the connector ladder: every host and
 * directive asserted below is one a tier actually needs.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(__dirname, '../../../..')

function cspOf(htmlPath: string): string {
  const html = readFileSync(join(REPO_ROOT, htmlPath), 'utf8')
  const match = html.match(/http-equiv="Content-Security-Policy"\s*\n?\s*content="([^"]+)"/)
  if (!match) throw new Error(`no CSP meta tag in ${htmlPath}`)
  return match[1]
}

function directive(csp: string, name: string): string {
  const found = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))
  return found ?? ''
}

describe('Electron renderer CSP', () => {
  const csp = cspOf('apps/electron/src/renderer/index.html')

  it('allows the model-weight hosts the on-device tiers download from', () => {
    const connect = directive(csp, 'connect-src')
    // WebLLM + @xenova/transformers weights.
    expect(connect).toContain('https://huggingface.co')
    expect(connect).toContain('https://*.hf.co')
    // MLC model libraries (the compiled wasm WebLLM pairs with each model).
    expect(connect).toContain('https://raw.githubusercontent.com')
  })

  it('allows the loopback origin the connector ladder actually probes', () => {
    // detect.ts probes http://127.0.0.1:31416, which `localhost` does not cover.
    expect(directive(csp, 'connect-src')).toContain('http://127.0.0.1:*')
  })

  it('permits wasm compilation and blob workers', () => {
    // Both runtimes compile WebAssembly and spawn workers from blob URLs;
    // without these the tiers fail after the download completes.
    expect(directive(csp, 'script-src')).toContain("'wasm-unsafe-eval'")
    expect(directive(csp, 'worker-src')).toContain('blob:')
  })

  it('keeps connect-src a real allowlist — no bare wildcard', () => {
    const connect = directive(csp, 'connect-src')
    expect(connect).not.toContain('https://*ping')
    expect(connect.split(/\s+/)).not.toContain('https://*')
    expect(connect.split(/\s+/)).not.toContain('wss://*')
  })

  it('does not grant full unsafe-eval', () => {
    expect(directive(csp, 'script-src')).not.toContain("'unsafe-eval'")
  })
})

describe('Web app CSP', () => {
  const csp = cspOf('apps/web/index.html')

  it('allows the same model-weight hosts', () => {
    const connect = directive(csp, 'connect-src')
    expect(connect).toContain('https://huggingface.co')
    expect(connect).toContain('https://*.hf.co')
    expect(connect).toContain('https://raw.githubusercontent.com')
  })

  /**
   * Deliberate, and the reason the specific https hosts beside it cannot be
   * read as an allowlist. `https://*` was added in 0341 so crash-report
   * ingest reaches a user-configured custom hub, and `wss://*` carries that
   * hub's sync socket. Those origins are typed by the user at runtime, so no
   * static policy can name them: removing the wildcard drops custom-hub
   * support from the web build entirely (0394). Egress from injected AI
   * content is controlled by the plan-first tool contract and `guardedFetch`,
   * not by this line. Changing it is a product decision, not a cleanup.
   */
  it('documents the wildcard that custom hubs depend on', () => {
    const connect = directive(csp, 'connect-src')
    expect(connect.split(/\s+/)).toContain('https://*')
    expect(readFileSync(join(REPO_ROOT, 'apps/web/index.html'), 'utf8')).toContain(
      'user-configured custom hub'
    )
  })
})
