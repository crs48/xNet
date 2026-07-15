/**
 * Workspace-plugin module builder tests (0331 — increments 1a/1b).
 */

import { describe, expect, it } from 'vitest'
import { readPluginSourceNode } from '../schemas/plugin-source'
import {
  buildPluginModuleGraph,
  normalizeSourcePath,
  resolveRelativeImport,
  scanModuleImports
} from '../workspace-plugins/builder'

describe('PluginSource schema helpers (1a)', () => {
  it('reads a well-formed node into the typed shape', () => {
    const node = readPluginSourceNode({
      id: 'n1',
      properties: {
        name: 'Habit Tracker',
        files: { 'index.js': 'export default {}' },
        entry: 'index.js',
        manifest: { id: 'com.example.habits', name: 'Habit Tracker', version: '0.1.0' },
        publishedHash: 'abc'
      }
    })
    expect(node.name).toBe('Habit Tracker')
    expect(node.files).toEqual({ 'index.js': 'export default {}' })
    expect(node.manifest?.id).toBe('com.example.habits')
    expect(node.publishedHash).toBe('abc')
  })

  it('tolerates missing/foreign values (synced nodes are attacker-supplied)', () => {
    const node = readPluginSourceNode({
      id: 'n2',
      properties: { files: { good: 'x', bad: 42 }, manifest: 'not-an-object', entry: 7 }
    })
    expect(node.name).toBe('Untitled plugin')
    expect(node.files).toEqual({ good: 'x' })
    expect(node.manifest).toBeUndefined()
    expect(node.entry).toBeUndefined()
  })
})

describe('scanModuleImports', () => {
  it('finds static, re-export, and dynamic import specifiers', () => {
    const code = [
      "import { a } from './a'",
      "import 'xnet:plugin-api'",
      "export * from './b.js'",
      "const c = await import('./c')"
    ].join('\n')
    const specs = scanModuleImports(code).map((s) => s.specifier)
    expect(specs).toEqual(['./a', 'xnet:plugin-api', './b.js', './c'])
  })

  it('reports specifier offsets that slice back to the specifier', () => {
    const code = "import { x } from './mod'"
    const [hit] = scanModuleImports(code)
    expect(code.slice(hit.start, hit.end)).toBe('./mod')
  })
})

describe('path resolution', () => {
  it('normalizes and resolves with extension + index fallbacks', () => {
    expect(normalizeSourcePath('./a/../b/c.ts')).toBe('b/c.ts')
    const files = { 'lib/util.ts': '', 'lib/dir/index.js': '', 'top.js': '' }
    expect(resolveRelativeImport('index.ts', './lib/util', files)).toBe('lib/util.ts')
    expect(resolveRelativeImport('index.ts', './lib/dir', files)).toBe('lib/dir/index.js')
    expect(resolveRelativeImport('lib/util.ts', '../top.js', files)).toBe('top.js')
    expect(resolveRelativeImport('index.ts', './nope', files)).toBeNull()
  })
})

describe('buildPluginModuleGraph (1b)', () => {
  it('builds a multi-file graph with resolved import edges', async () => {
    const graph = await buildPluginModuleGraph({
      files: {
        'index.js': "import { greet } from './lib/greet'\nexport default { greet }",
        'lib/greet.js': "import 'xnet:plugin-api'\nexport const greet = () => 'hi'"
      },
      entry: 'index.js'
    })
    expect(graph.ok).toBe(true)
    expect(graph.entry).toBe('index.js')
    expect(graph.modules['index.js'].imports['./lib/greet']).toBe('lib/greet.js')
    expect(graph.modules['lib/greet.js'].imports['xnet:plugin-api']).toBe('xnet:plugin-api')
  })

  it('rejects bare imports outside the pinned import map (no npm, no remote)', async () => {
    const graph = await buildPluginModuleGraph({
      files: { 'index.js': "import React from 'react'\nexport default {}" },
      entry: 'index.js'
    })
    expect(graph.ok).toBe(false)
    expect(graph.diagnostics.some((d) => d.message.includes("'react'"))).toBe(true)
  })

  it('accepts a bare import when the host pins a vendor module for it', async () => {
    const graph = await buildPluginModuleGraph({
      files: { 'index.js': "import React from 'react'\nexport default {}" },
      entry: 'index.js',
      vendorModules: { react: () => 'export default {}' }
    })
    expect(graph.ok).toBe(true)
    expect(graph.modules['index.js'].imports.react).toBe('react')
  })

  it('rejects URL-shaped imports', async () => {
    const graph = await buildPluginModuleGraph({
      files: { 'index.js': "import x from 'https://evil.example/x.js'\nexport default {}" },
      entry: 'index.js'
    })
    expect(graph.ok).toBe(false)
  })

  it('requires a transpiler for TypeScript files and reports per-file diagnostics', async () => {
    const graph = await buildPluginModuleGraph({
      files: { 'index.ts': 'export default {} as const' },
      entry: 'index.ts'
    })
    expect(graph.ok).toBe(false)
    expect(graph.diagnostics[0]).toMatchObject({ severity: 'error', file: 'index.ts' })
  })

  it('runs the injected transpiler per .ts file', async () => {
    const transpiled: string[] = []
    const graph = await buildPluginModuleGraph({
      files: {
        'index.ts': "import { x } from './x'\nexport default { x }",
        'x.ts': 'export const x = 1'
      },
      entry: 'index.ts',
      transpile: (code, path) => {
        transpiled.push(path)
        return code
      }
    })
    expect(graph.ok).toBe(true)
    expect(transpiled.sort()).toEqual(['index.ts', 'x.ts'])
  })

  it('reports a missing entry and unresolvable relative imports', async () => {
    const missingEntry = await buildPluginModuleGraph({ files: {}, entry: 'index.js' })
    expect(missingEntry.ok).toBe(false)

    const badImport = await buildPluginModuleGraph({
      files: { 'index.js': "import { y } from './y'" },
      entry: 'index.js'
    })
    expect(badImport.ok).toBe(false)
    expect(badImport.diagnostics[0].message).toContain("'./y'")
  })

  it('warns about files unreachable from the entry', async () => {
    const graph = await buildPluginModuleGraph({
      files: { 'index.js': 'export default {}', 'orphan.js': 'export const o = 1' },
      entry: 'index.js'
    })
    expect(graph.ok).toBe(true)
    expect(graph.diagnostics.some((d) => d.severity === 'warning' && d.file === 'orphan.js')).toBe(
      true
    )
  })

  it('builds a bundleless plugin well under the 1s loop-latency budget', async () => {
    const files: Record<string, string> = {
      'index.js': Array.from({ length: 20 }, (_, i) => `import './m${i}.js'`).join('\n')
    }
    for (let i = 0; i < 20; i++) files[`m${i}.js`] = `export const v${i} = ${i}\n`.repeat(50)
    const graph = await buildPluginModuleGraph({ files, entry: 'index.js' })
    expect(graph.ok).toBe(true)
    expect(Object.keys(graph.modules)).toHaveLength(21)
    // Patchwork parity: edit → debounce (250ms) → rebuild → remount < 1s.
    // The build step itself must be a small fraction of that.
    expect(graph.durationMs).toBeLessThan(250)
  })
})
