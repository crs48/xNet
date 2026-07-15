/**
 * Hardened-renderer compatibility for the workspace-plugin sandbox rung
 * (0331 — increment 5b).
 *
 * The Electron renderer runs with `sandbox: true`, `contextIsolation: true`,
 * `nodeIntegration: false` (apps/electron/src/main/index.ts). The frame rung
 * must therefore use only Web APIs available in a sandboxed Chromium renderer
 * — never node, never same-origin. These assertions freeze that contract so a
 * future edit that reaches for a node/same-origin capability fails CI instead
 * of silently breaking the desktop path.
 */

import { describe, expect, it } from 'vitest'
import { PLUGIN_FRAME_SANDBOX, buildPluginFrameSrcdoc } from '../workspace-plugins/frame'

describe('workspace-plugin frame is hardened-renderer safe (5b)', () => {
  const srcdoc = buildPluginFrameSrcdoc({ capabilities: { network: ['api.example.com'] } })

  it('never requests same-origin (works on the opaque origin a sandbox forces)', () => {
    expect(PLUGIN_FRAME_SANDBOX).toBe('allow-scripts')
    expect(srcdoc).not.toContain('allow-same-origin')
  })

  it('uses only Web APIs available with nodeIntegration:false', () => {
    // The loader links modules with Blob + object URLs + dynamic import — all
    // present in a sandboxed renderer; none require node.
    expect(srcdoc).toContain('URL.createObjectURL')
    expect(srcdoc).toContain('new Blob(')
    // No node/electron globals may leak into the frame runtime.
    for (const forbidden of [
      'require(',
      'process.',
      '__dirname',
      'ipcRenderer',
      'nodeIntegration'
    ]) {
      expect(srcdoc).not.toContain(forbidden)
    }
  })

  it('keeps its CSP self-contained (no remote script/connect a renderer would block)', () => {
    expect(srcdoc).toContain("default-src 'none'")
    expect(srcdoc).toContain("script-src 'unsafe-inline' blob:")
    // Declared egress is explicit https hosts, never a wildcard.
    expect(srcdoc).toContain('connect-src https://api.example.com')
    expect(srcdoc).not.toMatch(/connect-src[^;]*\*/)
  })
})
