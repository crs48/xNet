/** Read-only seed preview. Reads exports; never opens a workspace database. */
import type { StagedSocialRecord } from '../packages/social/src/import/types.ts'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { openSocialImportSource } from '../packages/social/src/import/node.ts'
import { builtInSocialImportAdapters } from '../packages/social/src/importers/index.ts'

const args = process.argv.slice(2)
const value = (flag: string) => {
  const index = args.indexOf(flag)
  if (index < 0) return undefined
  if (!args[index + 1] || args[index + 1].startsWith('--'))
    throw new Error(`Missing value for ${flag}`)
  return args[index + 1]
}
if (args.includes('--help')) {
  console.log(
    'Read-only xNet seed preview: pnpm exec tsx scripts/inventory-personal-library.ts [--all-supported] [--exports-dir .exports] [--garden-file garden.json] [--output report.json]\n--all-supported includes social activity and AI conversations; excludes DMs, billing, and account/security metadata.'
  )
  process.exit(0)
}
const exportsDir = resolve(value('--exports-dir') ?? '.exports')
const output = value('--output')
const allSupported = args.includes('--all-supported')
const sources = [
  {
    file: 'instagram.zip',
    adapterId: 'instagram',
    buckets: ['instagram.likes', 'instagram.saves']
  },
  { file: 'twitter.zip', adapterId: 'x', buckets: ['x.likes'] },
  { file: 'youtube.zip', adapterId: 'youtube', buckets: ['youtube.playlists'] },
  { file: 'github-stars.json', adapterId: 'github', buckets: ['github.stars'] }
]
if (allSupported)
  sources.push(
    ...[
      ['tiktok.zip', 'tiktok'],
      ['reddit.zip', 'reddit'],
      ['claude.zip', 'claude'],
      ['chatgpt.zip', 'openai'],
      ['grok.zip', 'grok']
    ].map(([file, adapterId]) => ({ file, adapterId, buckets: [] }))
  )
const gardenFile = value('--garden-file')
if (gardenFile)
  sources.push({ file: resolve(gardenFile), adapterId: 'garden', buckets: ['garden.entries'] })
const results = []
for (const source of sources) {
  try {
    const archivePath = resolve(exportsDir, source.file)
    const { manifest, readJsonEntry, readTextEntry } = await openSocialImportSource(archivePath)
    const adapter = builtInSocialImportAdapters.find((adapter) => adapter.id === source.adapterId)
    if (!adapter) throw new Error(`Missing adapter: ${source.adapterId}`)
    const probe = await adapter.probe({ manifest })
    const buckets = allSupported
      ? probe.buckets
          .filter(
            (bucket) =>
              bucket.id === 'grok.conversations' ||
              (['public', 'private'].includes(bucket.privacyClass) &&
                !/(security|account-metadata)/.test(bucket.id))
          )
          .map((bucket) => bucket.id)
      : source.buckets
    const counts: Record<string, number> = {}
    const unique = new Map<string, Set<string>>()
    const sourceRecords: Record<string, number> = {}
    const warnings = new Set(probe.warnings)
    const warningsByPath = new Map<string, { path: string; warning: string }>()
    const collect = (record: StagedSocialRecord) => {
      counts[record.kind] = (counts[record.kind] ?? 0) + 1
      const ids = unique.get(record.kind) ?? new Set<string>()
      ids.add(record.deterministicId)
      unique.set(record.kind, ids)
      if (record.kind === 'source-record')
        sourceRecords[record.source.path] = (sourceRecords[record.source.path] ?? 0) + 1
      for (const warning of record.warnings) {
        warnings.add(warning)
        warningsByPath.set(JSON.stringify([record.source.path, warning]), {
          path: record.source.path,
          warning
        })
      }
    }
    for await (const record of adapter.stage(
      {
        manifest,
        archiveId: `preview:${manifest.archiveHash}`,
        importRunId: 'preview',
        observedBy: 'did:key:preview',
        importedAt: new Date().toISOString(),
        readJsonEntry,
        readTextEntry
      },
      { buckets, includeSensitive: true }
    ))
      collect(record)
    results.push({
      file: source.file,
      status: 'previewed',
      archiveHash: manifest.archiveHash,
      adapterVersion: adapter.version,
      selected: buckets,
      unclassifiedEntryCount: manifest.entries.filter(
        (entry) => !probe.buckets.some((bucket) => bucket.entryPaths.includes(entry.path))
      ).length,
      excludedBuckets: probe.buckets
        .filter((bucket) => !buckets.includes(bucket.id))
        .map((bucket) => bucket.id),
      counts,
      unique: Object.fromEntries([...unique].map(([kind, ids]) => [kind, ids.size])),
      sourceRecords,
      warnings: [...warnings],
      warningsByPath: [...warningsByPath.values()]
    })
  } catch (error) {
    results.push({
      file: source.file,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    })
    process.exitCode = 1
  }
}
const report = { createdAt: new Date().toISOString(), databaseWrites: 0, results }
const json = JSON.stringify(report, null, 2) + '\n'
if (output) await writeFile(resolve(output), json, { mode: 0o600 })
else process.stdout.write(json)
