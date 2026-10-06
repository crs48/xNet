import type { StagedSocialRecord } from '../import/types'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openSocialImportSource } from '../import/source-reader'
import { githubAdapter, mapGitHubStars } from '../importers/github'
import { SocialActorSchema } from '../schemas/actor'
import { SocialCollectionItemSchema, SocialCollectionSchema } from '../schemas/collection'
import { SocialContentSchema } from '../schemas/content'
import { SocialInteractionSchema } from '../schemas/interaction'

const context = {
  archiveId: 'archive:github',
  observedBy: 'did:key:fixture',
  importedAt: '2026-09-01T00:00:00Z'
}
const source = { path: 'github-stars.json', byteSize: 100 }
const repo = {
  id: 42,
  full_name: 'example/useful-tool',
  html_url: 'https://github.com/example/useful-tool',
  description: 'A complete searchable description.',
  private: false,
  topics: ['knowledge'],
  language: 'TypeScript',
  owner: {
    id: 7,
    login: 'example',
    html_url: 'https://github.com/example',
    avatar_url: 'https://avatars.githubusercontent.com/u/7'
  }
}
const star = { starred_at: '2025-05-01T12:00:00Z', repo }
const snapshot = (stars: unknown[]) => ({
  format: 'xnet-github-stars/1',
  account: 'fixture-user',
  coverage: { paginationCompleted: true, atomic: false },
  stars
})
const kind = (records: StagedSocialRecord[], value: StagedSocialRecord['kind']) =>
  records.filter((record) => record.kind === value)
const map = (input: unknown) => mapGitHubStars({ context, source, input })

describe('GitHub stars', () => {
  it('retains native repository and star identity, metadata, and private defaults', () => {
    const records = map(snapshot([star]))
    const content = kind(records, 'content')[0]
    expect(content.properties.platformContentId).toBe('42')
    expect(content.properties.searchText).toContain(repo.description)
    const event = kind(records, 'interaction')[0]
    expect(event.properties.interactionKind).toBe('star')
    expect(event.properties.publishedAt).toBe(star.starred_at)
    expect(event.properties.importedAt).toBe(context.importedAt)
    expect(
      records
        .filter((record) => record.kind !== 'source-record')
        .every((record) => record.properties.visibility === 'private')
    ).toBe(true)
    const schemas = {
      actor: SocialActorSchema,
      content: SocialContentSchema,
      interaction: SocialInteractionSchema,
      collection: SocialCollectionSchema,
      'collection-item': SocialCollectionItemSchema
    }
    for (const record of records) {
      if (!(record.kind in schemas)) continue
      const schema = schemas[record.kind as keyof typeof schemas]
      for (const name of Object.keys(record.properties))
        expect(
          schema.schema.properties.some((property) => property.name === name),
          `${record.kind}.${name}`
        ).toBe(true)
    }
  })

  it('survives repository renames and overlapping snapshots without duplicating a star', () => {
    const before = map(snapshot([star]))
    const after = map(
      snapshot([
        {
          ...star,
          repo: {
            ...repo,
            full_name: 'new-owner/renamed',
            html_url: 'https://github.com/new-owner/renamed'
          }
        }
      ])
    )
    for (const type of ['content', 'interaction', 'collection-item'] as const)
      expect(kind(after, type)[0].deterministicId).toBe(kind(before, type)[0].deterministicId)
    const restarred = map(snapshot([{ ...star, starred_at: '2026-01-01T00:00:00Z' }]))
    expect(kind(restarred, 'interaction')[0].deterministicId).not.toBe(
      kind(before, 'interaction')[0].deterministicId
    )
  })

  it('does not invent timestamps or complete coverage for a plain API array', () => {
    const records = map([repo])
    expect(kind(records, 'interaction')[0].properties.publishedAt).toBeUndefined()
    expect(kind(records, 'collection-item')[0].properties.addedAt).toBeUndefined()
    expect(kind(records, 'interaction')[0].warnings).toContain(
      'Native star timestamp is unavailable.'
    )
    expect(kind(records, 'collection')[0].warnings[0]).toContain('may be incomplete')
  })

  it('keeps private and unknown repository privacy private', () => {
    for (const privateValue of [true, undefined]) {
      const records = map([{ ...repo, private: privateValue }])
      expect(kind(records, 'content')[0].privacyClass).toBe('private')
    }
  })

  it('rejects malformed rows and unknown formats explicitly', () => {
    expect(() => map([{ ...repo, id: undefined }])).toThrow('native ID')
    expect(() => map([{ repo, starred_at: 'yesterday' }])).toThrow('timestamp')
    expect(() => map({ format: 'unknown', stars: [] })).toThrow('Unsupported')
  })

  it('opens a standalone snapshot through the same archive contract', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xnet-github-fixture-'))
    try {
      const path = join(directory, 'my-snapshot.json')
      await writeFile(path, JSON.stringify(snapshot([star])))
      const opened = await openSocialImportSource(path)
      expect(opened.manifest.filename).toBe('my-snapshot.json')
      expect(opened.manifest.archiveHash).toMatch(/^[a-f0-9]{64}$/)
      expect(githubAdapter.detect(opened.manifest)).toBeGreaterThan(0)
      const staged = []
      for await (const row of githubAdapter.stage(
        { ...context, ...opened },
        { buckets: ['github.stars'], includeSensitive: true }
      ))
        staged.push(row)
      expect(kind(staged, 'content')).toHaveLength(1)
      await expect(opened.readJsonEntry('../another-file')).rejects.toThrow('not found')
    } finally {
      await rm(directory, { recursive: true })
    }
  })
})
