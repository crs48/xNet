/**
 * Browser social archive import route.
 */

import type { DefinedSchema, PropertyBuilder } from '@xnetjs/data'
import type { MutateOp } from '@xnetjs/react'
import type {
  SocialImportArchivePreview,
  SocialImportNodeDraft,
  SocialImportStageResult
} from '@xnetjs/social/import/core'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutate } from '@xnetjs/react'
import { useNodeStore } from '@xnetjs/react/internal'
import {
  createBrowserZipJsonEntryReader,
  createBrowserZipTextEntryReader,
  createSocialArchivePreview,
  isSensitivePrivacyClass,
  readBrowserZipArchiveManifest,
  stageSocialArchive,
  type ArchiveManifest
} from '@xnetjs/social/import/browser'
import {
  claudeAdapter,
  grokAdapter,
  instagramAdapter,
  redditAdapter,
  tiktokAdapter,
  xAdapter,
  youtubeAdapter
} from '@xnetjs/social/importers'
import {
  SocialActorSchema,
  SocialCollectionItemSchema,
  SocialCollectionSchema,
  SocialContentSchema,
  SocialConversationSchema,
  SocialIdentityClaimSchema,
  SocialImportArchiveSchema,
  SocialImportRunSchema,
  SocialInteractionSchema,
  SocialMessageSchema,
  SocialSourceRecordSchema
} from '@xnetjs/social/schemas'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileArchive,
  Import,
  Loader2,
  Shield,
  Upload
} from 'lucide-react'
import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  upsertDefaultSocialWorkspace,
  type SocialWorkspaceSeedSummary
} from '../lib/social-workspace'

export const Route = createFileRoute('/social-import')({
  component: SocialImportPage
})

type ImportStatus = 'idle' | 'picked' | 'staging' | 'staged' | 'committing' | 'committed'

type CommitSummary = {
  created: number
  updated: number
  batches: number
}

type PickedArchive = {
  file: File
  manifest: ArchiveManifest
  preview: SocialImportArchivePreview
}

const COMMIT_BATCH_SIZE = 500
const adapters = [
  instagramAdapter,
  grokAdapter,
  youtubeAdapter,
  xAdapter,
  tiktokAdapter,
  claudeAdapter,
  redditAdapter
] as const

const schemasById = Object.fromEntries(
  [
    SocialImportArchiveSchema,
    SocialImportRunSchema,
    SocialSourceRecordSchema,
    SocialActorSchema,
    SocialIdentityClaimSchema,
    SocialContentSchema,
    SocialInteractionSchema,
    SocialConversationSchema,
    SocialMessageSchema,
    SocialCollectionSchema,
    SocialCollectionItemSchema
  ].map((schema) => [schema.schema['@id'], schema])
) as Record<string, DefinedSchema<Record<string, PropertyBuilder>>>

function SocialImportPage(): React.ReactElement {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [archive, setArchive] = useState<PickedArchive | null>(null)
  const [selectedBuckets, setSelectedBuckets] = useState<string[]>([])
  const [includeSensitive, setIncludeSensitive] = useState(false)
  const [includeSourceRecords, setIncludeSourceRecords] = useState(false)
  const [stageResult, setStageResult] = useState<SocialImportStageResult | null>(null)
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [commitSummary, setCommitSummary] = useState<CommitSummary | null>(null)
  const [workspaceSummary, setWorkspaceSummary] = useState<SocialWorkspaceSeedSummary | null>(null)
  const [workspaceSeeding, setWorkspaceSeeding] = useState(false)
  const { mutate } = useMutate()
  const { store, isReady: storeReady } = useNodeStore()

  const stagedRecordCount = stageResult?.records.length ?? 0
  const sourceRecordCount = useMemo(
    () => stageResult?.records.filter((record) => record.kind === 'source-record').length ?? 0,
    [stageResult]
  )
  const canonicalRecordCount = stagedRecordCount - sourceRecordCount
  const commitRecordCount = useMemo(() => {
    if (!stageResult) return 0
    return (
      2 +
      stageResult.records.filter(
        (record) => includeSourceRecords || record.kind !== 'source-record'
      ).length
    )
  }, [includeSourceRecords, stageResult])

  const handlePickFile = useCallback(async (file: File) => {
    setError(null)
    setCommitSummary(null)
    setWorkspaceSummary(null)
    setStageResult(null)

    try {
      const manifest = await readBrowserZipArchiveManifest(file, { hashEntries: false })
      const preview = await createSocialArchivePreview({ adapters, manifest })
      setArchive({ file, manifest, preview })
      setStatus('picked')
      setIncludeSensitive(false)
      setIncludeSourceRecords(false)
      setSelectedBuckets(
        preview.probe?.buckets
          .filter((bucket) => bucket.defaultSelected)
          .map((bucket) => bucket.id)
          .sort() ?? []
      )
    } catch (err) {
      setStatus('idle')
      setArchive(null)
      setError(toErrorMessage(err))
    }
  }, [])

  const handleToggleBucket = useCallback((bucketId: string, checked: boolean) => {
    setSelectedBuckets((current) =>
      checked
        ? [...new Set([...current, bucketId])].sort()
        : current.filter((id) => id !== bucketId)
    )
    setStageResult(null)
    setCommitSummary(null)
    setWorkspaceSummary(null)
  }, [])

  const handleStage = useCallback(async () => {
    if (!archive || !archive.preview.adapter) return

    setError(null)
    setCommitSummary(null)
    setWorkspaceSummary(null)
    setStatus('staging')

    try {
      const readJsonEntry = await createBrowserZipJsonEntryReader(archive.file)
      const readTextEntry = await createBrowserZipTextEntryReader(archive.file)
      const result = await stageSocialArchive({
        manifest: archive.manifest,
        adapters,
        readJsonEntry,
        readTextEntry,
        buckets: selectedBuckets,
        includeSensitive
      })
      setStageResult(result)
      setStatus('staged')
    } catch (err) {
      setStatus('picked')
      setError(toErrorMessage(err))
    }
  }, [archive, includeSensitive, selectedBuckets])

  const handleCommit = useCallback(async () => {
    if (!stageResult || !store || !storeReady) return

    setStatus('committing')
    setError(null)

    try {
      const drafts = [
        stageResult.archiveNode,
        stageResult.importRunNode,
        ...stageResult.records.filter(
          (record) => includeSourceRecords || record.kind !== 'source-record'
        )
      ]
      const summary = await commitDrafts({
        drafts,
        mutate,
        getExisting: (id) => store.get(id)
      })

      setCommitSummary(summary)
      setWorkspaceSummary(null)
      setStatus('committed')
    } catch (err) {
      setStatus('staged')
      setError(toErrorMessage(err))
    }
  }, [includeSourceRecords, mutate, stageResult, store, storeReady])

  const handleOpenWorkspace = useCallback(async () => {
    if (!store || !storeReady) return

    setWorkspaceSeeding(true)
    setError(null)

    try {
      const summary = await upsertDefaultSocialWorkspace({
        mutate,
        getExisting: (id) => store.get(id)
      })
      setWorkspaceSummary(summary)
      await navigate({ to: '/data' })
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setWorkspaceSeeding(false)
    }
  }, [mutate, navigate, store, storeReady])

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-5">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">Social Import</h1>
          <p className="truncate text-sm text-muted-foreground">
            {archive ? archive.preview.filename : 'Instagram, Grok, and YouTube ZIP archives'}
          </p>
        </div>
        <Link
          to="/"
          className="rounded-md border border-border px-3 py-2 text-sm text-foreground no-underline transition-colors hover:bg-accent hover:no-underline"
        >
          Done
        </Link>
      </header>

      <div className="grid min-h-[620px] grid-cols-1 overflow-hidden rounded-md border border-border bg-background lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-b border-border lg:border-b-0 lg:border-r">
          <div className="border-b border-border p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) void handlePickFile(file)
                event.currentTarget.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              <Upload size={15} />
              Choose Archive
            </button>
          </div>

          <div
            className="m-4 rounded-md border border-dashed border-border p-4 text-center transition-colors hover:border-foreground/30"
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={(event) => {
              event.preventDefault()
              const file = Array.from(event.dataTransfer.files).find(
                (item) => item.name.endsWith('.zip') || item.type === 'application/zip'
              )
              if (file) void handlePickFile(file)
            }}
          >
            <FileArchive className="mx-auto mb-2 text-muted-foreground" size={24} />
            <div className="text-sm font-medium">Drop ZIP Archive</div>
            <div className="mt-1 text-xs text-muted-foreground">Local browser import</div>
          </div>

          <div className="space-y-4 px-4 pb-4">
            <MetricRows archive={archive?.preview ?? null} />

            {archive?.preview.adapter ? (
              <div className="space-y-2">
                <SectionLabel label="Adapter" />
                <div className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{archive.preview.adapter.id}</span>
                    <span className="text-xs text-muted-foreground">
                      {(archive.preview.adapter.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {archive.preview.adapter.platform} v{archive.preview.adapter.version}
                  </div>
                </div>
              </div>
            ) : archive ? (
              <StatusCallout
                tone="warning"
                message="No supported social importer recognized this archive."
              />
            ) : null}

            {archive?.preview.probe?.warnings.length ? (
              <div className="space-y-2">
                <SectionLabel label="Warnings" />
                {archive.preview.probe.warnings.map((warning) => (
                  <StatusCallout key={warning} tone="warning" message={warning} />
                ))}
              </div>
            ) : null}
          </div>
        </aside>

        <main className="min-w-0 overflow-auto p-5">
          <div className="space-y-5">
            {error ? <StatusCallout tone="error" message={error} /> : null}
            {status === 'committed' && commitSummary ? (
              <StatusCallout
                tone="success"
                message={`Committed ${commitSummary.created} new and ${commitSummary.updated} existing records.`}
              />
            ) : null}
            {workspaceSummary ? (
              <StatusCallout
                tone="success"
                message={`Workspace views ready: ${workspaceSummary.created} created and ${workspaceSummary.updated} updated.`}
              />
            ) : null}

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Buckets</h2>
                  <p className="text-sm text-muted-foreground">
                    {archive?.preview.probe
                      ? `${archive.preview.probe.buckets.length} import buckets available`
                      : 'Choose an archive to review buckets'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={
                    !archive?.preview.adapter ||
                    selectedBuckets.length === 0 ||
                    status === 'staging'
                  }
                  onClick={() => void handleStage()}
                  className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {status === 'staging' ? (
                    <Loader2 className="animate-spin" size={15} />
                  ) : (
                    <Import size={15} />
                  )}
                  Stage
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {(archive?.preview.probe?.buckets ?? []).map((bucket) => {
                  const checked = selectedBuckets.includes(bucket.id)
                  const sensitive = isSensitivePrivacyClass(bucket.privacyClass)
                  const disabled = Boolean(bucket.ignoredReason) || (sensitive && !includeSensitive)
                  return (
                    <label
                      key={bucket.id}
                      className={[
                        'flex cursor-pointer gap-3 rounded-md border p-3 transition-colors',
                        disabled
                          ? 'border-border text-muted-foreground opacity-60'
                          : checked
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border hover:bg-accent/40'
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={checked && !disabled}
                        disabled={disabled}
                        onChange={(event) =>
                          handleToggleBucket(bucket.id, event.currentTarget.checked)
                        }
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{bucket.label}</span>
                          {sensitive ? <Shield size={13} className="text-amber-600" /> : null}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {bucket.description ?? bucket.id}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{bucket.privacyClass}</span>
                          <span>{bucket.entryPaths.length} files</span>
                          {bucket.recordCount !== undefined ? (
                            <span>{bucket.recordCount} records</span>
                          ) : null}
                        </div>
                        {bucket.ignoredReason ? (
                          <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                            {bucket.ignoredReason}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  )
                })}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-md border border-border p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={includeSensitive}
                  onChange={(event) => {
                    const nextIncludeSensitive = event.currentTarget.checked
                    setIncludeSensitive(nextIncludeSensitive)
                    if (!nextIncludeSensitive) {
                      const sensitiveBucketIds = new Set(
                        archive?.preview.probe?.buckets
                          .filter((bucket) => isSensitivePrivacyClass(bucket.privacyClass))
                          .map((bucket) => bucket.id) ?? []
                      )
                      setSelectedBuckets((current) =>
                        current.filter((bucketId) => !sensitiveBucketIds.has(bucketId))
                      )
                    }
                    setStageResult(null)
                    setCommitSummary(null)
                  }}
                />
                <div>
                  <div className="text-sm font-medium">Include sensitive buckets</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Enables buckets that adapters mark private or high-risk.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-md border border-border p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={includeSourceRecords}
                  onChange={(event) => setIncludeSourceRecords(event.currentTarget.checked)}
                />
                <div>
                  <div className="text-sm font-medium">Commit source records</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Stores provenance summaries in addition to canonical graph nodes.
                  </div>
                </div>
              </label>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Staged Records</h2>
                  <p className="text-sm text-muted-foreground">
                    {stageResult
                      ? `${canonicalRecordCount} graph nodes and ${sourceRecordCount} source records`
                      : 'Stage selected buckets before committing'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!stageResult || !storeReady || status === 'committing'}
                  onClick={() => void handleCommit()}
                  className="flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {status === 'committing' ? (
                    <Loader2 className="animate-spin" size={15} />
                  ) : (
                    <Database size={15} />
                  )}
                  Commit {commitRecordCount || ''}
                </button>
                <button
                  type="button"
                  disabled={status !== 'committed' || !storeReady || workspaceSeeding}
                  onClick={() => void handleOpenWorkspace()}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {workspaceSeeding ? (
                    <Loader2 className="animate-spin" size={15} />
                  ) : (
                    <Database size={15} />
                  )}
                  Open Data Workspace
                </button>
              </div>

              {stageResult ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <SummaryCard label="Total" value={stageResult.summary.totalRecords} />
                  <SummaryCard label="Warnings" value={stageResult.summary.totalWarnings} />
                  <SummaryCard label="Ignored" value={stageResult.summary.totalIgnored} />
                </div>
              ) : (
                <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
                  No records staged.
                </div>
              )}

              {stageResult?.summary.bucketSummaries.length ? (
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Bucket</th>
                        <th className="px-3 py-2 font-medium">Records</th>
                        <th className="px-3 py-2 font-medium">Warnings</th>
                        <th className="px-3 py-2 font-medium">Ignored</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stageResult.summary.bucketSummaries.map((bucket) => (
                        <tr key={bucket.bucketId} className="border-t border-border">
                          <td className="px-3 py-2 font-mono text-xs">{bucket.bucketId}</td>
                          <td className="px-3 py-2">{bucket.totalRecords}</td>
                          <td className="px-3 py-2">{bucket.warningCount}</td>
                          <td className="px-3 py-2">{bucket.ignoredCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}

function MetricRows({ archive }: { archive: SocialImportArchivePreview | null }) {
  const rows = [
    ['File', archive?.filename ?? '-'],
    ['Size', archive ? formatByteSize(archive.byteSize) : '-'],
    ['Entries', archive ? archive.entryCount.toLocaleString() : '-'],
    ['Hash', archive?.archiveHash ? `${archive.archiveHash.slice(0, 12)}...` : '-']
  ]

  return (
    <div className="space-y-2">
      <SectionLabel label="Archive" />
      <div className="rounded-md border border-border">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0"
          >
            <span className="text-muted-foreground">{label}</span>
            <span className="min-w-0 truncate text-right font-medium">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</div>
    </div>
  )
}

function StatusCallout({
  message,
  tone
}: {
  message: string
  tone: 'error' | 'success' | 'warning'
}) {
  const toneClassName = {
    error: 'border-destructive/40 bg-destructive/10 text-destructive',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }[tone]

  return (
    <div
      className={[
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
        toneClassName
      ].join(' ')}
    >
      {tone === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
      <span className="min-w-0 truncate">{message}</span>
    </div>
  )
}

async function commitDrafts(input: {
  drafts: SocialImportNodeDraft[]
  mutate: (ops: MutateOp[]) => Promise<unknown>
  getExisting: (id: string) => Promise<unknown>
}): Promise<CommitSummary> {
  const chunks = chunk(input.drafts, COMMIT_BATCH_SIZE)
  let created = 0
  let updated = 0

  for (const drafts of chunks) {
    const operations = await Promise.all(
      drafts.map(async (draft): Promise<MutateOp> => {
        const existing = await input.getExisting(draft.deterministicId)
        if (existing) {
          updated += 1
          return { type: 'update', id: draft.deterministicId, data: draft.properties }
        }

        created += 1
        return {
          type: 'create',
          id: draft.deterministicId,
          schema: getSchema(draft.schemaId),
          data: draft.properties
        } as MutateOp
      })
    )

    await input.mutate(operations)
  }

  return { created, updated, batches: chunks.length }
}

function getSchema(schemaId: string): DefinedSchema<Record<string, PropertyBuilder>> {
  const schema = schemasById[schemaId]
  if (!schema) throw new Error(`Unsupported social schema: ${schemaId}`)
  return schema
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
