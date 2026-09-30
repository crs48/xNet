import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createSocialNodeId } from '../import/ids'
import { resourceIdentityForUrl } from '../import/resource-url'
import { openSocialImportSource } from '../import/source-reader'
import { gardenAdapter, mapGarden } from '../importers/garden'
import { builtInSocialImportAdapters } from '../importers/registry'

const context = { archiveId: 'source-a', importedAt: '2026-09-29T00:00:00Z' }
const source = { path: 'garden.json', byteSize: 100 }
const entry = {
  url: 'https://youtu.be/abcdefghijk?t=15',
  title: 'A useful talk',
  note: 'My own words about why this matters.',
  tags: ['learning'],
  category: 'Videos',
  source: 'https://bsky.app/profile/example.test/post/one',
  createdAt: '2026-09-01T00:00:00Z'
}
const snapshot = (entries: unknown[] = [entry]) => ({
  version: 1,
  profile: { did: 'did:plc:fixture', handle: 'example.test' },
  entries
})
const map = (input: unknown) => mapGarden({ context, source, input })

it('reuses exported resource identities while keeping authored commentary separate and private', () => {
  const rows = map(snapshot())
  const content = rows.filter((row) => row.kind === 'content')
  expect(content).toHaveLength(2)
  expect(content[0].deterministicId).toBe(
    createSocialNodeId('content', ['youtube', 'video', 'abcdefghijk'])
  )
  expect(content[0].properties.searchText).toBeUndefined()
  expect(content[1].properties.parentContent).toBe(content[0].deterministicId)
  expect(content[1].properties.searchText).toBe(entry.note)
  expect(content[1].properties.canonicalUrl).toBe(entry.source)
  expect(
    rows
      .filter((row) => row.kind !== 'source-record')
      .every((row) => row.properties.visibility === 'private')
  ).toBe(true)
  expect(rows.filter((row) => row.kind === 'collection-item')).toHaveLength(3)
})

it('retains repeated-resource observations from distinct source posts and stable identities across snapshots', () => {
  const rows = map(snapshot([entry, { ...entry, source: entry.source + 'two' }]))
  const content = rows.filter((row) => row.kind === 'content')
  expect(
    new Set(
      content.filter((row) => !row.properties.parentContent).map((row) => row.deterministicId)
    ).size
  ).toBe(1)
  expect(
    new Set(content.filter((row) => row.properties.parentContent).map((row) => row.deterministicId))
      .size
  ).toBe(2)
  const overlap = mapGarden({
    context: { ...context, archiveId: 'source-b' },
    source,
    input: snapshot()
  })
  expect(
    overlap.filter((row) => row.kind !== 'source-record').map((row) => row.deterministicId)
  ).toEqual(
    map(snapshot())
      .filter((row) => row.kind !== 'source-record')
      .map((row) => row.deterministicId)
  )
})

it('preserves generic query/fragment meaning and recognizes provider aliases', () => {
  expect(resourceIdentityForUrl('https://example.test/?q=one#section').url).toBe(
    'https://example.test/?q=one#section'
  )
  expect(resourceIdentityForUrl('https://instagram.com/reel/abcd/?igsh=tracking').id).toBe(
    createSocialNodeId('content', ['instagram', 'post', 'abcd'])
  )
  expect(resourceIdentityForUrl('https://twitter.com/example/status/123').id).toBe(
    createSocialNodeId('content', ['x', 'tweet', '123'])
  )
  expect(() => resourceIdentityForUrl('file:///private/notes')).toThrow()
  expect(() => resourceIdentityForUrl('https://user:secret@example.test/')).toThrow()
})

it('fails on unsupported versions, duplicate observations, invalid dates, or oversized notes', () => {
  expect(() => map({ ...snapshot(), version: 2 })).toThrow()
  expect(() => map(snapshot([entry, entry]))).toThrow('repeats')
  expect(() => map(snapshot([{ ...entry, createdAt: 'not-a-date' }]))).toThrow('timestamp')
  expect(() => map(snapshot([{ ...entry, note: 'x'.repeat(20001) }]))).toThrow(
    'no text was truncated'
  )
})

it('detects a standalone garden JSON through the actual registry and source reader', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xnet-garden-'))
  try {
    const path = join(root, 'renamed-export.json')
    await writeFile(path, JSON.stringify(snapshot()))
    const opened = await openSocialImportSource(path)
    expect(opened.manifest.entries[0].path).toBe('garden.json')
    expect(builtInSocialImportAdapters).toContain(gardenAdapter)
    expect(await gardenAdapter.detect(opened.manifest)).toBeGreaterThan(0.9)
    expect(await opened.readJsonEntry('garden.json')).toEqual(snapshot())
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
