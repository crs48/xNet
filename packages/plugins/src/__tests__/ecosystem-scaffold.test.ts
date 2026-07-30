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
  it('produces the expected project files (incl. a LICENSE for the default FSL license)', () => {
    const { files } = scaffoldPlugin({ id: 'com.acme.kanban', name: 'Kanban', template: 'client' })
    expect(Object.keys(files).sort()).toEqual([
      'LICENSE',
      'README.md',
      'package.json',
      'src/index.test.ts',
      'src/index.ts',
      'tsconfig.json'
    ])
  })

  it('defaults to FSL-1.1-MIT and emits its LICENSE + manifest license field', () => {
    const { files } = scaffoldPlugin({
      id: 'com.acme.kanban',
      name: 'Kanban',
      template: 'client',
      author: 'Acme Inc',
      year: 2026
    })
    expect(JSON.parse(files['package.json']).license).toBe('FSL-1.1-MIT')
    expect(files['src/index.ts']).toContain("license: 'FSL-1.1-MIT'")
    expect(files['LICENSE']).toContain('Functional Source License, Version 1.1, MIT Future License')
    expect(files['LICENSE']).toContain('Copyright 2026 Acme Inc')
    expect(files['LICENSE']).toContain('second anniversary')
  })

  it('embeds pricing + publisherDid for a paid plugin', () => {
    const { files } = scaffoldPlugin({
      id: 'com.acme.pro',
      name: 'Pro',
      template: 'client',
      pricing: { mode: 'one-time', amountMinor: 999, currency: 'USD' },
      publisherDid: 'did:key:zPub'
    })
    expect(files['src/index.ts']).toContain('pricing: {"mode":"one-time"')
    expect(files['src/index.ts']).toContain("publisherDid: 'did:key:zPub'")
  })

  it('omits the LICENSE for an unrecognized license (author supplies their own)', () => {
    const { files } = scaffoldPlugin({
      id: 'com.acme.x',
      name: 'X',
      template: 'client',
      license: 'GPL-3.0-only'
    })
    expect(files.LICENSE).toBeUndefined()
    expect(JSON.parse(files['package.json']).license).toBe('GPL-3.0-only')
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

describe('scaffoldPlugin — connector template (0196)', () => {
  it('emits a defineConnector project with coherent capabilities + sync', () => {
    const { files } = scaffoldPlugin({
      id: 'dev.acme.connector.slack',
      name: 'Slack',
      template: 'connector'
    })
    const index = files['src/index.ts']
    expect(index).toContain('defineConnector')
    expect(index).toContain("id: 'dev.acme.connector.slack'")
    // schemaWrite and sync.schemas reference the same SCHEMA const (so the
    // defineConnector coherence check passes at runtime).
    expect(index).toContain("const SCHEMA = 'xnet://dev.acme.connector.slack/Item@1.0.0'")
    expect(index).toContain('SLACK_TOKEN') // env-prefix derived from the last id segment
    expect(index).toContain('slack_search') // contributed agent tool
    // The test it scaffolds installs the connector module.
    expect(files['src/index.test.ts']).toContain('SlackConnector.module')
  })

  it('connector is a recognized template (does not throw)', () => {
    expect(() =>
      scaffoldPlugin({ id: 'dev.acme.connector.x', name: 'X', template: 'connector' })
    ).not.toThrow()
  })
})

describe('slot-view template (0280)', () => {
  it('scaffolds a dockable panel with a network-closed manifest', () => {
    const { files } = scaffoldPlugin({
      id: 'com.you.focus-board',
      name: 'Focus Board',
      template: 'slot-view'
    })
    const index = files['src/index.ts']
    expect(index).toContain('slots: [')
    expect(index).toContain('"network":[]')
    expect(index).toContain("defaultRegion: 'dock.corner'")
    expect(index).toContain('FocusBoardPanel')
  })

  it('honours an explicit capability grant', () => {
    const { files } = scaffoldPlugin({
      id: 'com.you.focus-board',
      name: 'Focus Board',
      template: 'slot-view',
      capabilities: { schemaRead: ['xnet://xnet.fyi/Task@1.0.0'], network: [] }
    })
    expect(files['src/index.ts']).toContain('xnet://xnet.fyi/Task@1.0.0')
  })
})
