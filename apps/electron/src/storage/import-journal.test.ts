import type { SocialImportCommitJobSnapshot } from '../shared/social-import'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  streamSocialImportNodeDrafts,
  type SocialImportNodeDraftStreamResult
} from '@xnetjs/social/import/core'
import { openSocialImportSource } from '@xnetjs/social/import/node'
import { builtInSocialImportAdapters } from '@xnetjs/social/importers'
import { beforeEach, afterEach, expect, it } from 'vitest'
import {
  loadImportJournals,
  retainedJournalSource,
  saveImportJournal,
  type ImportJournal
} from './import-journal'

let root: string
let journal: ImportJournal
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'xnet-import-journal-'))
  const path = join(root, 'stars.json')
  await writeFile(
    path,
    JSON.stringify([
      {
        starred_at: '2025-01-01T00:00:00Z',
        repo: {
          id: 123,
          full_name: 'fixture/library',
          html_url: 'https://github.com/fixture/library',
          private: false,
          owner: { id: 456, login: 'fixture' }
        }
      }
    ])
  )
  const source = await openSocialImportSource(path)
  const importedAt = '2026-09-29T12:00:00Z'
  let result: SocialImportNodeDraftStreamResult | undefined
  for await (const draft of streamSocialImportNodeDrafts({
    ...source,
    adapters: builtInSocialImportAdapters,
    importedAt,
    onComplete: (value) => {
      result = value
    }
  }))
    void draft
  if (!result) throw new Error('Fixture did not stage')
  const totalRecords = result.canonicalRecordCount + 2
  const job: SocialImportCommitJobSnapshot = {
    jobId: 'electron-social-import:fixture',
    status: 'running',
    phase: 'writing',
    platform: 'github',
    archiveName: 'stars.json',
    totalRecords,
    processedRecords: 2,
    created: 2,
    updated: 0,
    skipped: 0,
    warnings: 0,
    currentBucketId: null,
    currentChunk: 1,
    totalChunks: 2,
    startedAt: 1,
    updatedAt: 2,
    completedAt: null,
    error: null,
    metrics: null,
    checkpoint: null,
    bucketCheckpoints: []
  }
  journal = {
    version: 1,
    job,
    authorDID: 'did:key:fixture',
    sourceHash: source.manifest.archiveHash!,
    sourceExtension: '.json',
    includeSourceRecords: false,
    stage: {
      ...result,
      archive: { ...result.archive, archivePath: path },
      archivePath: path,
      manifest: source.manifest,
      stageRequest: { archivePath: path, includeSensitive: false },
      importedAt
    }
  }
})
afterEach(() => rm(root, { recursive: true, force: true }))

it('restores an interrupted cursor as paused with its exact selection and adapter version', () => {
  saveImportJournal(root, journal)
  const [restored] = loadImportJournals(root)
  expect(restored.job.status).toBe('paused')
  expect(restored.job.processedRecords).toBe(2)
  expect(restored.stage).toEqual(journal.stage)
  expect(restored.authorDID).toBe('did:key:fixture')
})

it('resolves retained evidence relative to the restored workspace, never the old path', () => {
  expect(retainedJournalSource('/new/profile', journal)).toBe(
    `/new/profile/import-sources/${journal.sourceHash}/source.json`
  )
})

it('preserves the last published cursor when an incomplete next write exists', async () => {
  saveImportJournal(root, journal)
  await writeFile(join(root, 'import-jobs', 'interrupted.tmp'), '{')
  expect(loadImportJournals(root)[0].job.processedRecords).toBe(2)
  saveImportJournal(root, {
    ...journal,
    job: { ...journal.job, status: 'completed', processedRecords: journal.job.totalRecords! }
  })
  expect(loadImportJournals(root)[0].job.status).toBe('completed')
})

it('distinguishes absent journals from damaged progress and rejects invalid cursors', async () => {
  expect(loadImportJournals(root)).toEqual([])
  expect(() =>
    saveImportJournal(root, { ...journal, job: { ...journal.job, processedRecords: 999999 } })
  ).toThrow('checkpoint')
  await mkdir(join(root, 'import-jobs'))
  await writeFile(join(root, 'import-jobs', 'broken.json'), '{')
  expect(() => loadImportJournals(root)).toThrow()
})

it('persists no signing private key and rejects unsupported formats without replacing valid progress', async () => {
  saveImportJournal(root, journal)
  const [name] = await readdir(join(root, 'import-jobs'))
  const before = await readFile(join(root, 'import-jobs', name), 'utf8')
  expect(before).not.toContain('signingKey')
  expect(() =>
    saveImportJournal(root, { ...journal, version: 2 } as unknown as ImportJournal)
  ).toThrow('Invalid import journal')
  expect(await readFile(join(root, 'import-jobs', name), 'utf8')).toBe(before)
})
