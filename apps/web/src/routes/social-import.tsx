/**
 * Browser social archive import route.
 */

import type { SocialImporterRegistryEntry } from '@xnetjs/social/importers'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutate } from '@xnetjs/react'
import { useNodeStore } from '@xnetjs/react/internal'
import { isSensitivePrivacyClass, type ArchiveManifest } from '@xnetjs/social/import/browser'
import { type SocialImportArchivePreview } from '@xnetjs/social/import/core'
import { builtInSocialImporterRegistry } from '@xnetjs/social/importers'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileArchive,
  Import,
  Loader2,
  Shield,
  Upload,
  X
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BrowserSocialImportCommitCancelledError,
  cancelBrowserSocialImportCommitJob,
  getBrowserSocialImportCommitRecordCount,
  startBrowserSocialImportCommitJob,
  type BrowserSocialImportCommitProgress as CommitProgress,
  type BrowserSocialImportCommitSummary as CommitSummary
} from '../lib/social-import-job-client'
import {
  canPickResumableBrowserSocialImportArchive,
  listBrowserSocialImportResumeRecords,
  pickBrowserSocialImportArchive,
  readBrowserSocialImportArchiveHandleFile,
  removeBrowserSocialImportResumeRecord,
  upsertBrowserSocialImportResumeRecord,
  type BrowserSocialImportResumeRecord
} from '../lib/social-import-resume'
import {
  readBrowserSocialImportPreview,
  stageBrowserSocialArchive,
  type BrowserSocialImportStageResult
} from '../lib/social-import-worker-client'
import {
  upsertDefaultSocialWorkspace,
  type SocialWorkspaceSeedSummary
} from '../lib/social-workspace'

export const Route = createFileRoute('/social-import')({
  component: SocialImportPage
})

type ImportStatus = 'idle' | 'picked' | 'staging' | 'staged' | 'committing' | 'committed'

type PickedArchive = {
  file: File
  handleId: string | null
  manifest: ArchiveManifest
  preview: SocialImportArchivePreview
}

function SocialImportPage(): React.ReactElement {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [archive, setArchive] = useState<PickedArchive | null>(null)
  const [selectedBuckets, setSelectedBuckets] = useState<string[]>([])
  const [includeSensitive, setIncludeSensitive] = useState(false)
  const [includeSourceRecords, setIncludeSourceRecords] = useState(false)
  const [stageResult, setStageResult] = useState<BrowserSocialImportStageResult | null>(null)
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [commitSummary, setCommitSummary] = useState<CommitSummary | null>(null)
  const [commitProgress, setCommitProgress] = useState<CommitProgress | null>(null)
  const [commitJobId, setCommitJobId] = useState<string | null>(null)
  const [resumeRecords, setResumeRecords] = useState<BrowserSocialImportResumeRecord[]>([])
  const [workspaceSummary, setWorkspaceSummary] = useState<SocialWorkspaceSeedSummary | null>(null)
  const [workspaceSeeding, setWorkspaceSeeding] = useState(false)
  const { mutate } = useMutate()
  const { store, isReady: storeReady } = useNodeStore()

  const sourceRecordCount = stageResult?.sourceRecordCount ?? 0
  const canonicalRecordCount = stageResult?.canonicalRecordCount ?? 0
  const commitRecordCount = useMemo(() => {
    if (!stageResult) return 0
    return getBrowserSocialImportCommitRecordCount(stageResult, includeSourceRecords)
  }, [includeSourceRecords, stageResult])

  const refreshResumeRecords = useCallback(() => {
    setResumeRecords(listBrowserSocialImportResumeRecords())
  }, [])

  useEffect(() => {
    refreshResumeRecords()
  }, [refreshResumeRecords])

  const handlePickFile = useCallback(async (file: File, handleId: string | null = null) => {
    setError(null)
    setCommitSummary(null)
    setCommitProgress(null)
    setWorkspaceSummary(null)
    setStageResult(null)

    try {
      const { manifest, preview } = await readBrowserSocialImportPreview(file)
      setArchive({ file, handleId, manifest, preview })
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

  const handleChooseArchive = useCallback(async () => {
    if (!canPickResumableBrowserSocialImportArchive()) {
      fileInputRef.current?.click()
      return
    }

    try {
      const picked = await pickBrowserSocialImportArchive()
      await handlePickFile(picked.file, picked.handleId)
    } catch (err) {
      if (isAbortError(err)) return
      setError(toErrorMessage(err))
    }
  }, [handlePickFile])

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
    if (!archive || !stageResult || !store || !storeReady) return

    setStatus('committing')
    setError(null)
    setCommitProgress(null)
    setCommitJobId(null)

    try {
      let activeJobId = ''
      const upsertResumeRecord = (progress: CommitProgress | null): void => {
        if (!archive.handleId || !activeJobId) return

        upsertBrowserSocialImportResumeRecord({
          jobId: activeJobId,
          archiveHandleId: archive.handleId,
          archiveName: archive.file.name,
          manifest: archive.manifest,
          preview: archive.preview,
          stageResult,
          buckets: selectedBuckets,
          includeSensitive,
          includeSourceRecords,
          importedAt: stageResult.importedAt,
          processedRecords: progress?.processedRecords ?? 0,
          completedBatches: progress?.completedBatches ?? 0,
          created: progress?.created ?? 0,
          updated: progress?.updated ?? 0,
          updatedAt: Date.now(),
          error: null
        })
        refreshResumeRecords()
      }

      const job = startBrowserSocialImportCommitJob({
        stageResult,
        includeSourceRecords,
        importDrafts: async (batchDrafts) => {
          const result = await store.batchWrite({
            kind: 'deterministic-import',
            drafts: batchDrafts,
            policy: { indexMode: 'touched' }
          })
          return {
            created: result.created,
            updated: result.updated,
            affectedSchemaIds: result.schemaIds,
            storage: result.storage,
            timings: result.timings
          }
        },
        onProgress: (progress) => {
          setCommitProgress(progress)
          upsertResumeRecord(progress)
        }
      })
      activeJobId = job.jobId
      setCommitJobId(job.jobId)
      upsertResumeRecord(null)
      const summary = await job.promise

      setCommitSummary(summary)
      setWorkspaceSummary(null)
      setStatus('committed')
      removeBrowserSocialImportResumeRecord(job.jobId)
      refreshResumeRecords()
    } catch (err) {
      const message = toErrorMessage(err)
      setStatus('staged')
      setCommitProgress(null)
      setError(
        err instanceof BrowserSocialImportCommitCancelledError
          ? 'Import cancelled. Commit again to retry the remaining deterministic records.'
          : message
      )
    } finally {
      setCommitJobId(null)
    }
  }, [
    archive,
    includeSensitive,
    includeSourceRecords,
    refreshResumeRecords,
    selectedBuckets,
    stageResult,
    store,
    storeReady
  ])

  const handleResumeImport = useCallback(
    async (record: BrowserSocialImportResumeRecord) => {
      if (!store || !storeReady) return

      setStatus('committing')
      setError(null)
      setCommitProgress(null)
      setCommitSummary(null)
      setWorkspaceSummary(null)
      setCommitJobId(record.jobId)

      try {
        const file = await readBrowserSocialImportArchiveHandleFile(record.archiveHandleId)
        const result = await stageBrowserSocialArchive({
          file,
          manifest: record.manifest,
          buckets: record.buckets,
          includeSensitive: record.includeSensitive,
          importedAt: record.importedAt
        })
        setArchive({
          file,
          handleId: record.archiveHandleId,
          manifest: record.manifest,
          preview: result.archive
        })
        setSelectedBuckets(record.buckets)
        setIncludeSensitive(record.includeSensitive)
        setIncludeSourceRecords(record.includeSourceRecords)
        setStageResult(result)

        const upsertResumeRecord = (progress: CommitProgress | null): void => {
          upsertBrowserSocialImportResumeRecord({
            ...record,
            preview: result.archive,
            stageResult: result,
            processedRecords: progress?.processedRecords ?? record.processedRecords,
            completedBatches: progress?.completedBatches ?? record.completedBatches,
            created: progress?.created ?? record.created,
            updated: progress?.updated ?? record.updated,
            updatedAt: Date.now(),
            error: null
          })
          refreshResumeRecords()
        }

        const job = startBrowserSocialImportCommitJob({
          jobId: record.jobId,
          stageResult: result,
          includeSourceRecords: record.includeSourceRecords,
          initialProgress: {
            processedRecords: record.processedRecords,
            completedBatches: record.completedBatches,
            created: record.created,
            updated: record.updated
          },
          importDrafts: async (batchDrafts) => {
            const batchResult = await store.batchWrite({
              kind: 'deterministic-import',
              drafts: batchDrafts,
              policy: { indexMode: 'touched' }
            })
            return {
              created: batchResult.created,
              updated: batchResult.updated,
              affectedSchemaIds: batchResult.schemaIds,
              storage: batchResult.storage,
              timings: batchResult.timings
            }
          },
          onProgress: (progress) => {
            setCommitProgress(progress)
            upsertResumeRecord(progress)
          }
        })
        upsertResumeRecord(null)
        const summary = await job.promise

        setCommitSummary(summary)
        setWorkspaceSummary(null)
        setStatus('committed')
        removeBrowserSocialImportResumeRecord(record.jobId)
        refreshResumeRecords()
      } catch (err) {
        const message = toErrorMessage(err)
        setStatus('idle')
        setCommitProgress(null)
        upsertBrowserSocialImportResumeRecord({
          ...record,
          error: message,
          updatedAt: Date.now()
        })
        refreshResumeRecords()
        setError(message)
      } finally {
        setCommitJobId(null)
      }
    },
    [refreshResumeRecords, store, storeReady]
  )

  const handleDismissResumeRecord = useCallback(
    (jobId: string) => {
      removeBrowserSocialImportResumeRecord(jobId)
      refreshResumeRecords()
    },
    [refreshResumeRecords]
  )

  const handleCancelCommit = useCallback(() => {
    if (!commitJobId) return
    const cancelled = cancelBrowserSocialImportCommitJob(commitJobId)
    if (cancelled) {
      setError('Cancelling after the current batch finishes.')
    }
  }, [commitJobId])

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
                if (file) void handlePickFile(file, null)
                event.currentTarget.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => void handleChooseArchive()}
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
              if (file) void handlePickFile(file, null)
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
            <ResumeImportsPanel
              records={resumeRecords}
              disabled={!storeReady || status === 'committing'}
              onResume={handleResumeImport}
              onDismiss={handleDismissResumeRecord}
            />

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
                {status === 'committing' ? (
                  <button
                    type="button"
                    disabled={!commitJobId}
                    onClick={handleCancelCommit}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <X size={15} />
                    Cancel
                  </button>
                ) : null}
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
                <div className="grid gap-3 md:grid-cols-6">
                  <SummaryCard label="Total" value={stageResult.summary.totalRecords} />
                  <SummaryCard label="Warnings" value={stageResult.summary.totalWarnings} />
                  <SummaryCard label="Ignored" value={stageResult.summary.totalIgnored} />
                  <SummaryCard label="Stage" value={formatDuration(stageResult.stageDurationMs)} />
                  {stageResult.workerTimings?.requestPostMessageMs !== undefined ? (
                    <SummaryCard
                      label="Clone In"
                      value={formatMilliseconds(stageResult.workerTimings.requestPostMessageMs)}
                    />
                  ) : null}
                  {stageResult.workerTimings?.responsePostMessageMs !== undefined ? (
                    <SummaryCard
                      label="Clone Out"
                      value={formatMilliseconds(stageResult.workerTimings.responsePostMessageMs)}
                    />
                  ) : null}
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

function ResumeImportsPanel({
  disabled,
  onDismiss,
  onResume,
  records
}: {
  disabled: boolean
  onDismiss: (jobId: string) => void
  onResume: (record: BrowserSocialImportResumeRecord) => void
  records: BrowserSocialImportResumeRecord[]
}): React.ReactElement | null {
  if (records.length === 0) return null

  return (
    <section className="rounded-md border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">Paused Imports</h2>
          <p className="text-xs text-muted-foreground">{records.length} resumable archive jobs</p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {records.map((record) => {
          const totalRecords = getBrowserSocialImportCommitRecordCount(
            record.stageResult,
            record.includeSourceRecords
          )
          const percent =
            totalRecords > 0
              ? Math.min(100, Math.max(0, (record.processedRecords / totalRecords) * 100))
              : 0

          return (
            <div
              key={record.jobId}
              className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileArchive size={15} className="shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{record.archiveName}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {record.processedRecords.toLocaleString()} / {totalRecords.toLocaleString()}{' '}
                  records · {Math.floor(percent)}%
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                {record.error ? (
                  <div className="mt-2 text-xs text-destructive">{record.error}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onResume(record)}
                  className="flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Import size={14} />
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => onDismiss(record.jobId)}
                  className="rounded-md border border-border p-2 transition-colors hover:bg-accent"
                  aria-label={`Dismiss ${record.archiveName}`}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
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

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
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
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        <ProgressMetric
          label="Records"
          value={`${progress.processedRecords.toLocaleString()} / ${progress.totalRecords.toLocaleString()}`}
        />
        <ProgressMetric label="Created" value={progress.created.toLocaleString()} />
        <ProgressMetric label="Updated" value={progress.updated.toLocaleString()} />
        <ProgressMetric label="Rate" value={formatRate(progress.metrics.recordsPerSecond)} />
        <ProgressMetric label="Check" value={formatMilliseconds(progress.metrics.lastCheckMs)} />
        <ProgressMetric
          label="Preflight"
          value={formatMilliseconds(progress.metrics.lastPreflightMs)}
        />
        <ProgressMetric
          label="Materialize"
          value={formatMilliseconds(progress.metrics.lastMaterializeMs)}
        />
        <ProgressMetric
          label="Apply"
          value={formatMilliseconds(progress.metrics.lastApplyMs || progress.metrics.lastWriteMs)}
        />
        <ProgressMetric label="Notify" value={formatMilliseconds(progress.metrics.lastNotifyMs)} />
        <ProgressMetric
          label="Progress UI"
          value={formatMilliseconds(progress.metrics.lastProgressMs)}
        />
        <ProgressMetric label="Rows" value={formatStorageRows(progress.metrics)} />
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

function getCommitProgressPhaseLabel(progress: CommitProgress): string {
  if (progress.phase === 'indexing') {
    return 'Rebuilding indexes'
  }

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

function formatRate(recordsPerSecond: number): string {
  if (!Number.isFinite(recordsPerSecond) || recordsPerSecond <= 0) return '0/s'
  return `${Math.round(recordsPerSecond).toLocaleString()}/s`
}

function formatStorageRows(progressMetrics: CommitProgress['metrics']): string {
  const totalRows =
    progressMetrics.totalNodeRowsWritten +
    progressMetrics.totalPropertyRowsWritten +
    progressMetrics.totalChangeRowsWritten +
    progressMetrics.totalScalarRowsWritten +
    progressMetrics.totalFtsRowsWritten

  if (totalRows <= 0) return '0'

  return totalRows.toLocaleString()
}

function formatMilliseconds(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0ms'
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`
  return `${(milliseconds / 1000).toFixed(1)}s`
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isDefaultDisabledBucketReason(reason: string | undefined): boolean {
  return reason?.startsWith('Disabled by default because this bucket is ') ?? false
}
