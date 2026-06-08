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
import type { SocialImporterRegistryEntry } from '@xnetjs/social/importers'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutate } from '@xnetjs/react'
import { useNodeStore } from '@xnetjs/react/internal'
import { isSensitivePrivacyClass, type ArchiveManifest } from '@xnetjs/social/import/browser'
import { builtInSocialImporterRegistry } from '@xnetjs/social/importers'
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
  readBrowserSocialImportPreview,
  stageBrowserSocialArchive
} from '../lib/social-import-worker-client'
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

type CommitProgressPhase = 'checking' | 'writing' | 'committed'

type CommitProgress = {
  phase: CommitProgressPhase
  totalRecords: number
  processedRecords: number
  totalBatches: number
  completedBatches: number
  currentBatch: number
  created: number
  updated: number
  startedAt: number
  updatedAt: number
}

type PickedArchive = {
  file: File
  manifest: ArchiveManifest
  preview: SocialImportArchivePreview
}

const COMMIT_BATCH_SIZE = 500
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
  const [commitProgress, setCommitProgress] = useState<CommitProgress | null>(null)
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
    setCommitProgress(null)
    setWorkspaceSummary(null)
    setStageResult(null)

    try {
      const { manifest, preview } = await readBrowserSocialImportPreview(file)
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
    setCommitProgress(null)
    setWorkspaceSummary(null)
  }, [])

  const handleStage = useCallback(async () => {
    if (!archive || !archive.preview.adapter) return

    setError(null)
    setCommitSummary(null)
    setCommitProgress(null)
    setWorkspaceSummary(null)
    setStatus('staging')

    try {
      const result = await stageBrowserSocialArchive({
        file: archive.file,
        manifest: archive.manifest,
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
    setCommitProgress(null)

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
        getExisting: (id) => store.get(id),
        onProgress: setCommitProgress
      })

      setCommitSummary(summary)
      setWorkspaceSummary(null)
      setStatus('committed')
    } catch (err) {
      setStatus('staged')
      setCommitProgress(null)
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
            <ImporterRegistryPanel activeImporterId={archive?.preview.adapter?.id ?? null} />

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
                  const ignored =
                    Boolean(bucket.ignoredReason) &&
                    !isDefaultDisabledBucketReason(bucket.ignoredReason)
                  const disabled = ignored || (sensitive && !includeSensitive)
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
                    setCommitProgress(null)
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
                  onChange={(event) => {
                    setIncludeSourceRecords(event.currentTarget.checked)
                    setCommitSummary(null)
                    setCommitProgress(null)
                  }}
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

              {commitProgress ? <CommitProgressPanel progress={commitProgress} /> : null}

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

function ImporterRegistryPanel({
  activeImporterId
}: {
  activeImporterId: string | null
}): React.ReactElement {
  const availableCount = builtInSocialImporterRegistry.filter(
    (entry) => entry.availability === 'available'
  ).length
  const plannedCount = builtInSocialImporterRegistry.length - availableCount

  return (
    <div className="space-y-2">
      <SectionLabel label="Importers" />
      <div className="overflow-hidden rounded-md border border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Registry</span>
          <span className="text-xs text-muted-foreground">
            {availableCount} live / {plannedCount} planned
          </span>
        </div>
        <div className="max-h-[320px] divide-y divide-border overflow-auto">
          {builtInSocialImporterRegistry.map((entry) => (
            <ImporterRegistryRow
              key={entry.id}
              active={entry.id === activeImporterId}
              entry={entry}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ImporterRegistryRow({
  active,
  entry
}: {
  active: boolean
  entry: SocialImporterRegistryEntry
}): React.ReactElement {
  const available = entry.availability === 'available'

  return (
    <div
      className={[
        'px-3 py-2 text-sm',
        active
          ? 'bg-primary/10 text-foreground'
          : available
            ? 'text-foreground'
            : 'text-muted-foreground'
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {available ? (
            <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
          ) : (
            <Database size={14} className="shrink-0" />
          )}
          <span className="truncate font-medium">{entry.label}</span>
        </div>
        <span
          className={[
            'rounded-md border px-2 py-0.5 text-[11px] uppercase tracking-wide',
            available
              ? 'border-emerald-500/30 text-emerald-700'
              : 'border-border text-muted-foreground'
          ].join(' ')}
        >
          {active ? 'matched' : entry.availability}
        </span>
      </div>
      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.description}</div>
      <div className="mt-2 truncate text-xs text-muted-foreground">
        {summarizeList(entry.recordTypes)}
      </div>
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
  )
}

function summarizeList(items: readonly string[], limit = 4): string {
  const visibleItems = items.slice(0, limit)
  const hiddenCount = items.length - visibleItems.length
  return hiddenCount > 0 ? `${visibleItems.join(', ')} +${hiddenCount}` : visibleItems.join(', ')
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</div>
    </div>
  )
}

function CommitProgressPanel({ progress }: { progress: CommitProgress }): React.ReactElement {
  const percent =
    progress.totalRecords > 0
      ? Math.min(100, Math.max(0, (progress.processedRecords / progress.totalRecords) * 100))
      : 0
  const phaseLabel = getCommitProgressPhaseLabel(progress)
  const etaLabel = getCommitEtaLabel(progress)
  const elapsedLabel = formatDuration(progress.updatedAt - progress.startedAt)

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0">
          <div className="font-medium">{phaseLabel}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Batch {Math.min(progress.currentBatch, progress.totalBatches).toLocaleString()} of{' '}
            {progress.totalBatches.toLocaleString()}
          </div>
        </div>
        <div className="text-right text-sm font-medium tabular-nums">{Math.floor(percent)}%</div>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.totalRecords}
        aria-valuenow={progress.processedRecords}
        aria-label="Commit progress"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
        <ProgressMetric
          label="Records"
          value={`${progress.processedRecords.toLocaleString()} / ${progress.totalRecords.toLocaleString()}`}
        />
        <ProgressMetric label="Created" value={progress.created.toLocaleString()} />
        <ProgressMetric label="Updated" value={progress.updated.toLocaleString()} />
        <ProgressMetric label="Remaining" value={etaLabel ?? `Elapsed ${elapsedLabel}`} />
      </div>
    </div>
  )
}

function ProgressMetric({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <div className="uppercase tracking-wide">{label}</div>
      <div className="mt-0.5 font-medium text-foreground tabular-nums">{value}</div>
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
  onProgress?: (progress: CommitProgress) => void
}): Promise<CommitSummary> {
  const chunks = chunk(input.drafts, COMMIT_BATCH_SIZE)
  let created = 0
  let updated = 0
  const startedAt = Date.now()

  const reportProgress = (progress: Omit<CommitProgress, 'startedAt' | 'updatedAt'>) => {
    input.onProgress?.({
      ...progress,
      startedAt,
      updatedAt: Date.now()
    })
  }

  reportProgress({
    phase: 'checking',
    totalRecords: input.drafts.length,
    processedRecords: 0,
    totalBatches: chunks.length,
    completedBatches: 0,
    currentBatch: chunks.length > 0 ? 1 : 0,
    created,
    updated
  })
  await yieldCommitProgress()

  for (const [batchIndex, drafts] of chunks.entries()) {
    const processedBeforeBatch = batchIndex * COMMIT_BATCH_SIZE
    let batchCreated = 0
    let batchUpdated = 0

    reportProgress({
      phase: 'checking',
      totalRecords: input.drafts.length,
      processedRecords: processedBeforeBatch,
      totalBatches: chunks.length,
      completedBatches: batchIndex,
      currentBatch: batchIndex + 1,
      created,
      updated
    })

    const operations = await Promise.all(
      drafts.map(async (draft): Promise<MutateOp> => {
        const existing = await input.getExisting(draft.deterministicId)
        if (existing) {
          batchUpdated += 1
          return { type: 'update', id: draft.deterministicId, data: draft.properties }
        }

        batchCreated += 1
        return {
          type: 'create',
          id: draft.deterministicId,
          schema: getSchema(draft.schemaId),
          data: draft.properties
        } as MutateOp
      })
    )

    reportProgress({
      phase: 'writing',
      totalRecords: input.drafts.length,
      processedRecords: processedBeforeBatch,
      totalBatches: chunks.length,
      completedBatches: batchIndex,
      currentBatch: batchIndex + 1,
      created: created + batchCreated,
      updated: updated + batchUpdated
    })
    await yieldCommitProgress()

    await input.mutate(operations)

    created += batchCreated
    updated += batchUpdated

    reportProgress({
      phase: 'committed',
      totalRecords: input.drafts.length,
      processedRecords: processedBeforeBatch + drafts.length,
      totalBatches: chunks.length,
      completedBatches: batchIndex + 1,
      currentBatch: batchIndex + 1,
      created,
      updated
    })
  }

  return { created, updated, batches: chunks.length }
}

function getCommitProgressPhaseLabel(progress: CommitProgress): string {
  if (progress.totalRecords > 0 && progress.processedRecords >= progress.totalRecords) {
    return 'Commit complete'
  }

  if (progress.phase === 'checking') return 'Checking existing records'
  if (progress.phase === 'writing') return 'Writing batch'
  return 'Batch committed'
}

function getCommitEtaLabel(progress: CommitProgress): string | null {
  if (progress.processedRecords <= 0 || progress.processedRecords >= progress.totalRecords) {
    return progress.processedRecords >= progress.totalRecords ? 'Complete' : null
  }

  const elapsedMs = progress.updatedAt - progress.startedAt
  const recordsPerMs = progress.processedRecords / Math.max(elapsedMs, 1)
  const remainingRecords = progress.totalRecords - progress.processedRecords
  const remainingMs = remainingRecords / Math.max(recordsPerMs, 0.0001)
  return `~${formatDuration(remainingMs)}`
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

function yieldCommitProgress(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
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

function isDefaultDisabledBucketReason(reason: string | undefined): boolean {
  return reason?.startsWith('Disabled by default because this bucket is ') ?? false
}
