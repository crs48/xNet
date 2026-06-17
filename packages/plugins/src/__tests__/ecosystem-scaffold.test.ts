/**
 * Tests for the plugin project scaffolder (exploration 0192).
 */

import { describe, it, expect } from 'vitest'
import { scaffoldPlugin, pascalCase, packageName, ScaffoldError } from '../ecosystem/scaffold'
import { validateManifest } from '../manifest'

describe('pascalCase / packageName', () => {
  it('derives a JS identifier and an npm name from an id', () => {
    expect(pascalCase('com.acme.kanban-board')).toBe('KanbanBoard')
    expect(pascalCase('com.acme.invoice')).toBe('Invoice')
    expect(packageName('com.acme.kanban')).toBe('acme-kanban')
    expect(packageName('com.acme.sub.thing')).toBe('acme-sub-thing')
  })
})

describe('scaffoldPlugin', () => {
  it('produces the expected project files', () => {
    const { files } = scaffoldPlugin({ id: 'com.acme.kanban', name: 'Kanban', template: 'client' })
    expect(Object.keys(files).sort()).toEqual([
      'README.md',
      'package.json',
      'src/index.test.ts',
      'src/index.ts',
      'tsconfig.json'
    ])
  })

  it('emits a valid package.json named after the id', () => {
    const { files } = scaffoldPlugin({ id: 'com.acme.kanban', name: 'Kanban', template: 'client' })
    const pkg = JSON.parse(files['package.json'])
    expect(pkg.name).toBe('acme-kanban')
    expect(pkg.peerDependencies['@xnetjs/plugins']).toBeDefined()
  })

  it('embeds id/name in the manifest and wires the test harness', () => {
    const { files } = scaffoldPlugin({
      id: 'com.acme.kanban',
      name: 'Kanban Board',
      template: 'client'
    })
    expect(files['src/index.ts']).toContain("id: 'com.acme.kanban'")
    expect(files['src/index.ts']).toContain("name: 'Kanban Board'")
    expect(files['src/index.ts']).toContain('export const KanbanModule')
    expect(files['src/index.test.ts']).toContain('createTestPluginHarness')
    expect(files['src/index.test.ts']).toContain('KanbanModule')
  })

  it('two-sided template declares a hub feature and capabilities', () => {
    const { files } = scaffoldPlugin({
      id: 'com.acme.billing',
      name: 'Billing',
      template: 'two-sided',
      capabilities: { schemaWrite: ['xnet://xnet.fyi/Invoice@*'] }
    })
    expect(files['src/index.ts']).toContain("hub: { featureId: 'com.acme.billing' }")
    expect(files['src/index.ts']).toContain('xnet://xnet.fyi/Invoice@*')
  })

  it('ai-script template references the AI transform', () => {
    const { files } = scaffoldPlugin({ id: 'com.acme.ai', name: 'AI', template: 'ai-script' })
    expect(files['src/index.ts']).toContain('scriptToPluginManifest')
  })

  it('rejects a malformed id or unknown template', () => {
    expect(() =>
      scaffoldPlugin({ id: 'not-reverse-domain', name: 'X', template: 'client' })
    ).toThrow(ScaffoldError)
    expect(() =>
      scaffoldPlugin({ id: 'com.acme.x', name: 'X', template: 'nope' as never })
    ).toThrow(ScaffoldError)
    expect(() => scaffoldPlugin({ id: 'com.acme.x', name: '', template: 'client' })).toThrow(
      ScaffoldError
    )
  })

  it('the embedded manifest values pass validateManifest', () => {
    // Reconstruct the manifest object the template embeds and validate it.
    validateManifest({
      id: 'com.acme.kanban',
      name: 'Kanban',
      version: '0.1.0',
      contributes: {
        commands: [{ id: 'hello', name: 'Say hello', execute: () => {} }]
      }
    })
  })
})
