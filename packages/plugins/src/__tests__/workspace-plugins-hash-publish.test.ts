/**
 * Content-hash pinning, drift diff, and publish tests (0331 — 4b + 5a).
 */

import { describe, expect, it } from 'vitest'
import type { PluginSourceNode } from '../schemas/plugin-source'
import {
  assessPluginUpdate,
  canonicalJson,
  computePluginSourceHash,
  diffPluginSourceFiles
} from '../workspace-plugins/hash'
import {
  buildCommunityRegistryEntry,
  exportPluginSourceAsRepoFiles,
  requestWorkspacePluginPublish
} from '../workspace-plugins/publish'

const base: PluginSourceNode = {
  id: 'src-p',
  name: 'Publishable',
  entry: 'index.js',
  files: { 'index.js': 'export default {}', 'lib.js': 'export const x = 1' },
  manifest: {
    id: 'com.test.pub',
    name: 'Publishable',
    version: '1.2.3',
    description: 'A test plugin',
    contributes: { commands: [{ id: 'com.test.pub.go', name: 'Go' }], views: [] }
  }
}

describe('canonicalJson + computePluginSourceHash (4b)', () => {
  it('is key-order independent and content sensitive', async () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
    const h1 = await computePluginSourceHash({
      files: { a: '1', b: '2' },
      entry: 'a',
      manifest: base.manifest
    })
    const h2 = await computePluginSourceHash({
      files: { b: '2', a: '1' },
      entry: 'a',
      manifest: JSON.parse(JSON.stringify(base.manifest))
    })
    expect(h1).toBe(h2)
    const h3 = await computePluginSourceHash({
      files: { a: '1', b: 'CHANGED' },
      entry: 'a',
      manifest: base.manifest
    })
    expect(h3).not.toBe(h1)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('a permission change is a hash change (consent-worthy)', async () => {
    const before = await computePluginSourceHash({
      files: base.files,
      entry: base.entry,
      manifest: base.manifest
    })
    const after = await computePluginSourceHash({
      files: base.files,
      entry: base.entry,
      manifest: { ...base.manifest!, permissions: { schemas: { write: '*' } } }
    })
    expect(after).not.toBe(before)
  })
})

describe('diffPluginSourceFiles + assessPluginUpdate (4b)', () => {
  it('reports added/removed/changed files and manifest drift', () => {
    const diff = diffPluginSourceFiles(
      { files: { 'a.js': '1', 'b.js': '2' }, entry: 'a.js', manifest: { v: 1 } },
      { files: { 'a.js': '1', 'b.js': 'X', 'c.js': '3' }, entry: 'a.js', manifest: { v: 2 } }
    )
    expect(diff).toEqual({
      added: ['c.js'],
      removed: [],
      changed: ['b.js'],
      manifestChanged: true
    })
  })

  it('assesses unpinned / up-to-date / drift states', async () => {
    expect((await assessPluginUpdate(base)).status).toBe('unpinned')
    const hash = await computePluginSourceHash({
      files: base.files,
      entry: base.entry,
      manifest: base.manifest
    })
    expect(await assessPluginUpdate({ ...base, publishedHash: hash })).toEqual({
      status: 'up-to-date',
      hash
    })
    const drifted = await assessPluginUpdate({ ...base, publishedHash: 'old' })
    expect(drifted.status).toBe('drift')
    if (drifted.status === 'drift') {
      expect(drifted.currentHash).toBe(hash)
      expect(drifted.pinnedHash).toBe('old')
    }
  })
})

describe('requestWorkspacePluginPublish (5a)', () => {
  it('pins the consented hash; the node syncing is the distribution channel', async () => {
    const pins: Array<[string, string]> = []
    const requests: unknown[] = []
    const result = await requestWorkspacePluginPublish({
      source: base,
      onConsent: (request) => {
        requests.push(request)
        return true
      },
      persistPinnedHash: (id, hash) => {
        pins.push([id, hash])
      }
    })
    expect(result.ok).toBe(true)
    expect(pins).toEqual([['src-p', result.contentHash]])
    expect(requests[0]).toMatchObject({ pluginId: 'com.test.pub', sourceId: 'src-p' })
  })

  it('declined consent publishes nothing', async () => {
    let pinned = false
    const result = await requestWorkspacePluginPublish({
      source: base,
      onConsent: () => false,
      persistPinnedHash: () => {
        pinned = true
      }
    })
    expect(result).toEqual({ ok: false, declined: true })
    expect(pinned).toBe(false)
  })
})

describe('public marketplace export (5a)', () => {
  it('builds a community.json entry from the manifest', () => {
    const entry = buildCommunityRegistryEntry(base, {
      repoUrl: 'https://github.com/me/pub-plugin'
    })
    expect(entry).toMatchObject({
      id: 'com.test.pub',
      name: 'Publishable',
      version: '1.2.3',
      contributes: ['commands'],
      homepage: 'https://github.com/me/pub-plugin',
      license: 'MIT'
    })
  })

  it('exports the source as a repo file map for publishPluginRepo', () => {
    const files = exportPluginSourceAsRepoFiles(base)
    expect(files['src/index.js']).toBe('export default {}')
    expect(files['src/lib.js']).toBe('export const x = 1')
    expect(JSON.parse(files['manifest.json']).id).toBe('com.test.pub')
    expect(files['README.md']).toContain('# Publishable')
  })
})
