import type { SocialImportNodeDraftStreamResult } from '../packages/social/src/import/core.ts'
import { promises as fs } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import {
  createSocialArchivePreview,
  createZipJsonEntryReader,
  createZipTextEntryReader,
  readZipArchiveManifest,
  streamSocialImportNodeDrafts
} from '../packages/social/src/import/node.ts'
import { builtInSocialImportAdapters } from '../packages/social/src/importers/index.ts'

type SocialImportFixtureBenchmark = {
  ok: true
  archivePath: string
  filename: string
  adapterId: string | null
  platform: string | null
  byteSize: number
  entryCount: number
  manifestMs: number
  readerMs: number
  stageMs: number
  totalMs: number
  draftCount: number
  recordCount: number
  sourceRecordCount: number
  canonicalRecordCount: number
  warningCount: number
  ignoredCount: number
  bucketCount: number
  recordsPerSecond: number
}

type SocialImportFixtureBenchmarkError = {
  ok: false
  archivePath: string
  filename: string
  error: string
  totalMs: number
}

type SocialImportFixtureBenchmarkResult =
  | SocialImportFixtureBenchmark
  | SocialImportFixtureBenchmarkError

type SocialImportFixtureBenchmarkReport = {
  createdAt: string
  allBuckets: boolean
  exportsDir: string
  includeSensitive: boolean
  includeSourceRecords: boolean
  results: SocialImportFixtureBenchmarkResult[]
}

type SocialImportFixtureBenchmarkOptions = {
  allBuckets: boolean
  includeSensitive: boolean
  includeSourceRecords: boolean
}

const DEFAULT_ARCHIVES = [
  'youtube.zip',
  'twitter.zip',
  'tiktok.zip',
  'claude.zip',
  'chatgpt.zip',
  'reddit.zip',
  'grok.zip',
  'instagram.zip'
]

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2))
  const exportsDir = resolve(options.exportsDir ?? '.exports')
  const outputPath = resolve(options.outputPath ?? 'tmp/social-import-baseline.json')
  const archiveNames = options.archiveNames.length > 0 ? options.archiveNames : DEFAULT_ARCHIVES
  const archivePaths = await listExistingArchivePaths(exportsDir, archiveNames)
  if (archivePaths.length === 0) {
    throw new Error(`No social import fixture archives found in ${exportsDir}`)
  }

  const results: SocialImportFixtureBenchmarkResult[] = []
  for (const archivePath of archivePaths) {
    results.push(await benchmarkArchiveSafely(archivePath, options))
  }

  const report: SocialImportFixtureBenchmarkReport = {
    createdAt: new Date().toISOString(),
    allBuckets: options.allBuckets,
    exportsDir,
    includeSensitive: options.includeSensitive,
    includeSourceRecords: options.includeSourceRecords,
    results
  }

  await fs.mkdir(dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  printSummary(report, outputPath)
}

async function benchmarkArchiveSafely(
  archivePath: string,
  options: SocialImportFixtureBenchmarkOptions
): Promise<SocialImportFixtureBenchmarkResult> {
  const startedAt = performance.now()
  console.log(`Benchmarking ${basename(archivePath)}...`)

  try {
    return await benchmarkArchive({
      archivePath,
      allBuckets: options.allBuckets,
      includeSensitive: options.includeSensitive,
      includeSourceRecords: options.includeSourceRecords
    })
  } catch (error) {
    return {
      ok: false,
      archivePath,
      filename: basename(archivePath),
      error: error instanceof Error ? error.message : String(error),
      totalMs: performance.now() - startedAt
    }
  }
}

async function benchmarkArchive(input: {
  allBuckets: boolean
  archivePath: string
  includeSensitive: boolean
  includeSourceRecords: boolean
}): Promise<SocialImportFixtureBenchmark> {
  const totalStartedAt = performance.now()
  const manifestStartedAt = performance.now()
  const manifest = await readZipArchiveManifest(input.archivePath)
  const manifestMs = performance.now() - manifestStartedAt
  const readerStartedAt = performance.now()
  const readJsonEntry = await createZipJsonEntryReader(input.archivePath)
  const readTextEntry = await createZipTextEntryReader(input.archivePath)
  const readerMs = performance.now() - readerStartedAt
  const preview = input.allBuckets
    ? await createSocialArchivePreview({
        adapters: builtInSocialImportAdapters,
        manifest
      })
    : null
  const buckets = input.allBuckets
    ? (preview?.probe?.buckets.map((bucket) => bucket.id) ?? [])
    : undefined
  const stageStartedAt = performance.now()
  let result: SocialImportNodeDraftStreamResult | null = null
  let draftCount = 0

  for await (const draft of streamSocialImportNodeDrafts({
    manifest,
    adapters: builtInSocialImportAdapters,
    readJsonEntry,
    readTextEntry,
    buckets,
    includeSensitive: input.includeSensitive,
    includeSourceRecords: input.includeSourceRecords,
    progressIntervalRecords: 25_000,
    onComplete: (completeResult) => {
      result = completeResult
    }
  })) {
    draftCount += draft ? 1 : 0
  }

  if (!result) {
    throw new Error(`Social import stream did not complete for ${input.archivePath}`)
  }

  const stageMs = performance.now() - stageStartedAt
  const totalMs = performance.now() - totalStartedAt

  return {
    ok: true,
    archivePath: input.archivePath,
    filename: manifest.filename,
    adapterId: result.archive.adapter?.id ?? null,
    platform: result.archive.adapter?.platform ?? null,
    byteSize: manifest.byteSize,
    entryCount: manifest.entries.length,
    manifestMs,
    readerMs,
    stageMs,
    totalMs,
    draftCount,
    recordCount: result.recordCount,
    sourceRecordCount: result.sourceRecordCount,
    canonicalRecordCount: result.canonicalRecordCount,
    warningCount: result.summary.totalWarnings,
    ignoredCount: result.summary.totalIgnored,
    bucketCount: result.summary.bucketSummaries.length,
    recordsPerSecond: result.recordCount / Math.max(stageMs / 1000, 0.001)
  }
}

async function listExistingArchivePaths(
  exportsDir: string,
  archiveNames: readonly string[]
): Promise<string[]> {
  const existing = await Promise.all(
    archiveNames.map(async (archiveName) => {
      const archivePath = join(exportsDir, archiveName)
      try {
        const stat = await fs.stat(archivePath)
        return stat.isFile() ? archivePath : null
      } catch {
        return null
      }
    })
  )

  return existing.filter((archivePath): archivePath is string => archivePath !== null)
}

function readOptions(args: readonly string[]): {
  archiveNames: string[]
  allBuckets: boolean
  exportsDir?: string
  includeSourceRecords: boolean
  includeSensitive: boolean
  outputPath?: string
} {
  return args.reduce(
    (options, arg) => {
      if (arg === '--include-source-records') {
        return { ...options, includeSourceRecords: true }
      }
      if (arg === '--include-sensitive') {
        return { ...options, includeSensitive: true }
      }
      if (arg === '--all-buckets') {
        return { ...options, allBuckets: true }
      }
      if (arg.startsWith('--exports-dir=')) {
        return { ...options, exportsDir: arg.slice('--exports-dir='.length) }
      }
      if (arg.startsWith('--out=')) {
        return { ...options, outputPath: arg.slice('--out='.length) }
      }
      if (arg.startsWith('--archives=')) {
        return {
          ...options,
          archiveNames: arg
            .slice('--archives='.length)
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean)
        }
      }
      return options
    },
    {
      archiveNames: [] as string[],
      allBuckets: false,
      includeSensitive: false,
      includeSourceRecords: false
    }
  )
}

function printSummary(report: SocialImportFixtureBenchmarkReport, outputPath: string): void {
  const rows = report.results.map((result) => ({
    archive: basename(result.filename),
    status: result.ok ? 'ok' : 'error',
    platform: result.ok ? (result.platform ?? 'unknown') : 'unknown',
    records: result.ok ? result.recordCount : 0,
    drafts: result.ok ? result.draftCount : 0,
    manifestMs: result.ok ? Math.round(result.manifestMs) : 0,
    readerMs: result.ok ? Math.round(result.readerMs) : 0,
    stageMs: result.ok ? Math.round(result.stageMs) : 0,
    totalMs: Math.round(result.totalMs),
    recordsPerSecond: result.ok ? Math.round(result.recordsPerSecond) : 0,
    error: result.ok ? '' : result.error
  }))

  console.table(rows)
  console.log(`Wrote social import benchmark report to ${outputPath}`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
