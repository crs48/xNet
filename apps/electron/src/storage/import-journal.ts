import type {
  ElectronStagedSocialImport,
  SocialImportCommitJobSnapshot
} from '../shared/social-import'
import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

export type ImportJournal = {
  version: 1
  job: SocialImportCommitJobSnapshot
  stage: ElectronStagedSocialImport
  authorDID: string
  sourceHash: string
  sourceExtension: '.zip' | '.json'
  includeSourceRecords: boolean
}
const filename = (id: string) => `${createHash('sha256').update(id).digest('hex')}.json`
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function validate(value: unknown): asserts value is ImportJournal {
  if (
    !record(value) ||
    value.version !== 1 ||
    !record(value.job) ||
    !record(value.stage) ||
    !record(value.stage.archive) ||
    !record(value.stage.archive.adapter) ||
    !record(value.stage.manifest) ||
    !record(value.stage.stageRequest) ||
    typeof value.authorDID !== 'string' ||
    typeof value.sourceHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.sourceHash) ||
    !['.zip', '.json'].includes(String(value.sourceExtension)) ||
    typeof value.includeSourceRecords !== 'boolean'
  )
    throw new Error('Invalid import journal')
  const job = value.job
  if (
    typeof job.jobId !== 'string' ||
    !job.jobId.startsWith('electron-social-import:') ||
    !['queued', 'running', 'paused', 'completed', 'failed', 'cancelled'].includes(
      String(job.status)
    ) ||
    !Number.isSafeInteger(job.totalRecords) ||
    Number(job.totalRecords) < 2 ||
    !Number.isSafeInteger(job.processedRecords) ||
    Number(job.processedRecords) < 0 ||
    Number(job.processedRecords) > Number(job.totalRecords) ||
    !Number.isSafeInteger(job.currentChunk) ||
    Number(job.currentChunk) < 0 ||
    typeof value.stage.archive.adapter.id !== 'string' ||
    typeof value.stage.archive.adapter.version !== 'string' ||
    typeof value.stage.importedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.stage.importedAt)) ||
    value.stage.manifest.archiveHash !== value.sourceHash ||
    !Array.isArray(value.stage.manifest.entries)
  )
    throw new Error('Invalid import journal checkpoint')
}

/** The durable cursor advances only after an acknowledged database batch. */
export function saveImportJournal(dataPath: string, journal: ImportJournal): void {
  validate(journal)
  const directory = join(dataPath, 'import-jobs')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (lstatSync(directory).isSymbolicLink())
    throw new Error('Import jobs cannot use a symbolic link')
  const target = join(directory, filename(journal.job.jobId))
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    const file = openSync(temporary, 'wx', 0o600)
    try {
      writeFileSync(file, JSON.stringify(journal))
      fsyncSync(file)
    } finally {
      closeSync(file)
    }
    renameSync(temporary, target)
    for (const path of [directory, dataPath]) {
      const parent = openSync(path, 'r')
      try {
        fsyncSync(parent)
      } finally {
        closeSync(parent)
      }
    }
  } finally {
    rmSync(temporary, { force: true })
  }
}

export function loadImportJournals(dataPath: string): ImportJournal[] {
  const directory = join(dataPath, 'import-jobs')
  let names: string[]
  try {
    if (lstatSync(directory).isSymbolicLink())
      throw new Error('Import jobs cannot use a symbolic link')
    names = readdirSync(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  return names
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const path = join(directory, name)
      const info = lstatSync(path)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024 * 1024)
        throw new Error('Unreadable import journal. Its source files were preserved.')
      const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
      validate(value)
      if (filename(value.job.jobId) !== name)
        throw new Error('Import journal identity does not match its file')
      return {
        ...value,
        job: ['queued', 'running'].includes(value.job.status)
          ? {
              ...value.job,
              status: 'paused',
              error: 'Interrupted import. Resume from the last saved batch.'
            }
          : value.job
      }
    })
}

export function retainedJournalSource(dataPath: string, journal: ImportJournal): string {
  validate(journal)
  return join(dataPath, 'import-sources', journal.sourceHash, `source${journal.sourceExtension}`)
}
