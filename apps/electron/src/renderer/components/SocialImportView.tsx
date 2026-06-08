/**
 * SocialImportView - local archive staging and review surface.
 */

import type {
  SocialImportArchivePreview,
  SocialImportCommitJobSnapshot,
  SocialImportStageResult
} from '../../main/social-import-ipc'
import type { SocialImporterRegistryEntry } from '@xnetjs/social/importers'
import { useMutate, useXNet } from '@xnetjs/react'
import { useXNetInternal } from '@xnetjs/react/internal'
import {
  upsertSocialImportJobProgress,
  type SocialImportJobMetrics
} from '@xnetjs/social/import/core'
import { builtInSocialImporterRegistry } from '@xnetjs/social/importers'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileArchive,
  Import,
  Loader2,
  Shield,
  X
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  upsertDefaultSocialWorkspace,
  type SocialWorkspaceSeedSummary
} from '../lib/social-workspace'

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
  metrics: SocialImportJobMetrics
}

interface SocialImportViewProps {
  onClose: () => void
  onOpenDataWorkspace?: () => void
}

export function SocialImportView({
  onClose,
  onOpenDataWorkspace
}: SocialImportViewProps): React.ReactElement {
  const [archive, setArchive] = useState<SocialImportArchivePreview | null>(null)
  const [selectedBuckets, setSelectedBuckets] = useState<string[]>([])
  const [includeSensitive, setIncludeSensitive] = useState(false)
  const [includeSourceRecords, setIncludeSourceRecords] = useState(false)
  const [stageResult, setStageResult] = useState<SocialImportStageResult | null>(null)
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [commitSummary, setCommitSummary] = useState<CommitSummary | null>(null)
  const [commitProgress, setCommitProgress] = useState<CommitProgress | null>(null)
  const [commitJobId, setCommitJobId] = useState<string | null>(null)
  const [workspaceSummary, setWorkspaceSummary] = useState<SocialWorkspaceSeedSummary | null>(null)
  const [workspaceSeeding, setWorkspaceSeeding] = useState(false)
  const activeCommitJobIdRef = useRef<string | null>(null)
  const { mutate } = useMutate()
  const { nodeStoreReady } = useXNet()
  const { authorDID, signingKey } = useXNetInternal()

  const stagedRecordCount = stageResult?.recordCount ?? 0
  const sourceRecordCount = stageResult?.sourceRecordCount ?? 0
  const canonicalRecordCount = stageResult?.canonicalRecordCount ?? 0
  const commitRecordCount = useMemo(() => {
    if (!stageResult) return 0
    return 2 + (includeSourceRecords ? stagedRecordCount : canonicalRecordCount)
  }, [canonicalRecordCount, includeSourceRecords, stageResult, stagedRecordCount])

  const handlePickArchive = useCallback(async () => {
    setError(null)
    setCommitSummary(null)
    setCommitProgress(null)
    activeCommitJobIdRef.current = null
    setCommitJobId(null)
    setWorkspaceSummary(null)

    try {
      const preview = await window.xnetSocialImport.pickArchive()
      if (!preview) return

      setArchive(preview)
      setStageResult(null)
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
    activeCommitJobIdRef.current = null
    setCommitJobId(null)
    setWorkspaceSummary(null)
  }, [])

  const handleStage = useCallback(async () => {
    if (!archive || !archive.adapter) return

    setError(null)
    setCommitSummary(null)
    setCommitProgress(null)
    activeCommitJobIdRef.current = null
    setCommitJobId(null)
    setWorkspaceSummary(null)
    setStatus('staging')

    try {
      const result = await window.xnetSocialImport.stageArchive({
        archivePath: archive.archivePath,
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

  const applyCommitJobSnapshot = useCallback((job: SocialImportCommitJobSnapshot) => {
    upsertSocialImportJobProgress(job)
    if (job.jobId !== activeCommitJobIdRef.current) return

    const progress = socialImportJobToCommitProgress(job)
    setCommitProgress(progress)

    if (job.status === 'completed') {
      setCommitSummary(
        job.summary ?? { created: job.created, updated: job.updated, batches: job.totalChunks ?? 0 }
      )
      setWorkspaceSummary(null)
      setStatus('committed')
      activeCommitJobIdRef.current = null
      setCommitJobId(null)
      return
    }

    if (job.status === 'failed') {
      setStatus('staged')
      activeCommitJobIdRef.current = null
      setCommitJobId(null)
      setCommitProgress(null)
      setError(job.error ?? 'Import failed.')
      return
    }

    if (job.status === 'cancelled') {
      setStatus('staged')
      activeCommitJobIdRef.current = null
      setCommitJobId(null)
      setCommitProgress(null)
      setError('Import cancelled.')
    }
  }, [])

  useEffect(
    () => window.xnetSocialImport.onCommitJob(applyCommitJobSnapshot),
    [applyCommitJobSnapshot]
  )

  const handleCommit = useCallback(async () => {
    if (!stageResult || !nodeStoreReady || !authorDID || !signingKey) return

    setStatus('committing')
    setError(null)
    setCommitSummary(null)
    setCommitProgress(null)
    setWorkspaceSummary(null)

    try {
      const job = await window.xnetSocialImport.startCommitJob({
        stageId: stageResult.stageId,
        includeSourceRecords,
        authorDID,
        signingKey: Array.from(signingKey)
      })
      upsertSocialImportJobProgress(job)
      activeCommitJobIdRef.current = job.jobId
      setCommitJobId(job.jobId)
      setCommitProgress(socialImportJobToCommitProgress(job))

      const latestJob = await window.xnetSocialImport.getCommitJob(job.jobId)
      if (latestJob) applyCommitJobSnapshot(latestJob)
    } catch (err) {
      setStatus('staged')
      activeCommitJobIdRef.current = null
      setCommitJobId(null)
      setCommitProgress(null)
      setError(toErrorMessage(err))
    }
  }, [
    applyCommitJobSnapshot,
    authorDID,
    includeSourceRecords,
    nodeStoreReady,
    signingKey,
    stageResult
  ])

  const handleCancelCommit = useCallback(async () => {
    const activeJobId = activeCommitJobIdRef.current ?? commitJobId
    if (!activeJobId) return

    try {
      const job = await window.xnetSocialImport.cancelCommitJob(activeJobId)
      if (job) {
        applyCommitJobSnapshot(job)
      }
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }, [applyCommitJobSnapshot, commitJobId])

  const handleOpenWorkspace = useCallback(async () => {
    if (!nodeStoreReady) return

    setWorkspaceSeeding(true)
    setError(null)

    try {
      const summary = await upsertDefaultSocialWorkspace({
        mutate,
        getExisting: (id) => window.xnetNodes.getNode(id)
      })
      setWorkspaceSummary(summary)
      onOpenDataWorkspace?.()
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setWorkspaceSeeding(false)
    }
  }, [mutate, nodeStoreReady, onOpenDataWorkspace])

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary">
            <FileArchive size={17} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">Social Import</h1>
            <p className="truncate text-sm text-muted-foreground">
              {archive ? archive.filename : 'No archive selected'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Close social import"
        >
          <X size={18} />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-border">
          <div className="border-b border-border p-4">
            <button
              type="button"
              onClick={() => void handlePickArchive()}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              <FileArchive size={15} />
              Choose Archive
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="space-y-4">
              <MetricRows archive={archive} />
              <ImporterRegistryPanel activeImporterId={archive?.adapter?.id ?? null} />

              {archive?.adapter ? (
                <div className="space-y-2">
                  <SectionLabel label="Adapter" />
                  <div className="rounded-md border border-border">
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <span className="text-sm font-medium">{archive.adapter.platform}</span>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(archive.adapter.confidence * 100)}%
                      </span>
                    </div>
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {archive.adapter.id} v{archive.adapter.version}
                    </div>
                  </div>
                </div>
              ) : archive ? (
                <StatusBanner tone="warning" message="No importer matched this archive" />
              ) : null}

              <ToggleRow
                label="Sensitive"
                checked={includeSensitive}
                disabled={!archive?.adapter}
                onChange={(checked) => {
                  setIncludeSensitive(checked)
                  setStageResult(null)
                  setCommitSummary(null)
                  setCommitProgress(null)
                  activeCommitJobIdRef.current = null
                  setCommitJobId(null)
                }}
              />
              <ToggleRow
                label="Source Records"
                checked={includeSourceRecords}
                disabled={!stageResult}
                onChange={(checked) => {
                  setIncludeSourceRecords(checked)
                  setCommitSummary(null)
                  setCommitProgress(null)
                  activeCommitJobIdRef.current = null
                  setCommitJobId(null)
                }}
              />
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Database size={15} />
              <span>{commitRecordCount > 0 ? `${commitRecordCount} nodes` : 'Review'}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleStage()}
                disabled={!archive?.adapter || selectedBuckets.length === 0 || status === 'staging'}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === 'staging' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Shield size={14} />
                )}
                Stage
              </button>
              <button
                type="button"
                onClick={() => void handleCommit()}
                disabled={
                  !stageResult ||
                  !nodeStoreReady ||
                  status === 'committing' ||
                  status === 'committed'
                }
                className="flex items-center gap-2 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === 'committing' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Import size={14} />
                )}
                Import
              </button>
              {status === 'committing' && commitJobId ? (
                <button
                  type="button"
                  onClick={() => void handleCancelCommit()}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
                >
                  <X size={14} />
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleOpenWorkspace()}
                disabled={status !== 'committed' || !nodeStoreReady || workspaceSeeding}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {workspaceSeeding ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Database size={14} />
                )}
                Open Data Workspace
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="space-y-5">
              {error ? <StatusBanner tone="error" message={error} /> : null}
              {status === 'committed' && commitSummary ? (
                <StatusBanner
                  tone="success"
                  message={`${commitSummary.created} created, ${commitSummary.updated} updated`}
                />
              ) : null}
              {workspaceSummary ? (
                <StatusBanner
                  tone="success"
                  message={`Workspace views ready: ${workspaceSummary.created} created, ${workspaceSummary.updated} updated`}
                />
              ) : null}
              {commitProgress ? <CommitProgressPanel progress={commitProgress} /> : null}

              <BucketReview
                archive={archive}
                selectedBuckets={selectedBuckets}
                includeSensitive={includeSensitive}
                onToggleBucket={handleToggleBucket}
              />

              {stageResult ? (
                <StagingSummary
                  canonicalRecordCount={canonicalRecordCount}
                  sourceRecordCount={sourceRecordCount}
                  stageResult={stageResult}
                />
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function MetricRows({ archive }: { archive: SocialImportArchivePreview | null }) {
  return (
    <div className="space-y-2">
      <SectionLabel label="Archive" />
      <div className="divide-y divide-border rounded-md border border-border">
        <MetricRow label="Size" value={archive ? formatByteSize(archive.byteSize) : '-'} />
        <MetricRow label="Entries" value={archive ? String(archive.entryCount) : '-'} />
        <MetricRow label="Storage" value={archive?.storagePlan.mode ?? '-'} />
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
        <div className="max-h-[280px] divide-y divide-border overflow-auto">
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

function BucketReview({
  archive,
  selectedBuckets,
  includeSensitive,
  onToggleBucket
}: {
  archive: SocialImportArchivePreview | null
  selectedBuckets: string[]
  includeSensitive: boolean
  onToggleBucket: (bucketId: string, checked: boolean) => void
}) {
  if (!archive) {
    return <EmptyState />
  }

  if (!archive.probe || archive.probe.buckets.length === 0) {
    return <StatusBanner tone="warning" message="No import buckets found" />
  }

  return (
    <section className="space-y-2">
      <SectionLabel label="Buckets" />
      <div className="divide-y divide-border rounded-md border border-border">
        {archive.probe.buckets.map((bucket) => {
          const sensitive = bucket.privacyClass === 'private-message'
          const disabled = sensitive && !includeSensitive
          const checked = selectedBuckets.includes(bucket.id) && !disabled

          return (
            <label
              key={bucket.id}
              className={[
                'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3',
                disabled ? 'text-muted-foreground opacity-60' : 'text-foreground'
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onToggleBucket(bucket.id, event.target.checked)}
                className="h-4 w-4 accent-foreground"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{bucket.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{bucket.id}</span>
              </span>
              <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                {bucket.privacyClass}
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}

function summarizeList(items: readonly string[], limit = 4): string {
  const visibleItems = items.slice(0, limit)
  const hiddenCount = items.length - visibleItems.length
  return hiddenCount > 0 ? `${visibleItems.join(', ')} +${hiddenCount}` : visibleItems.join(', ')
}

function StagingSummary({
  canonicalRecordCount,
  sourceRecordCount,
  stageResult
}: {
  canonicalRecordCount: number
  sourceRecordCount: number
  stageResult: SocialImportStageResult
}) {
  return (
    <section className="space-y-2">
      <SectionLabel label="Staged" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Canonical" value={canonicalRecordCount} />
        <SummaryTile label="Source" value={sourceRecordCount} />
        <SummaryTile label="Warnings" value={stageResult.summary.totalWarnings} />
        <SummaryTile label="Stage" value={formatDuration(stageResult.stageDurationMs)} />
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {stageResult.summary.bucketSummaries.map((bucket) => (
          <div
            key={bucket.bucketId}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{bucket.bucketId}</div>
              <div className="truncate text-xs text-muted-foreground">
                {Object.entries(bucket.recordsByKind)
                  .map(([kind, count]) => `${kind}: ${count}`)
                  .join(', ')}
              </div>
            </div>
            <div className="text-sm tabular-nums text-muted-foreground">{bucket.totalRecords}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function EmptyState() {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border text-muted-foreground">
      <FileArchive size={26} />
      <span className="text-sm">Archive</span>
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {label}
    </h2>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  )
}

function SummaryTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border px-3 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-semibold tabular-nums">
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
          label="Write/index"
          value={formatMilliseconds(progress.metrics.lastWriteMs)}
        />
        <ProgressMetric
          label="Progress UI"
          value={formatMilliseconds(progress.metrics.lastProgressMs)}
        />
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

function ToggleRow({
  checked,
  disabled,
  label,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
      <span className={disabled ? 'text-muted-foreground' : 'text-foreground'}>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-foreground disabled:opacity-50"
      />
    </label>
  )
}

function StatusBanner({
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

function socialImportJobToCommitProgress(
  job: SocialImportCommitJobSnapshot
): CommitProgress | null {
  if (!job.totalRecords || !job.totalChunks || !job.startedAt) return null

  return {
    phase:
      job.status === 'completed' ? 'committed' : job.phase === 'writing' ? 'writing' : 'checking',
    totalRecords: job.totalRecords,
    processedRecords: job.processedRecords,
    totalBatches: job.totalChunks,
    completedBatches: job.currentChunk,
    currentBatch: Math.min(
      job.totalChunks,
      job.status === 'running' && job.currentChunk < job.totalChunks
        ? job.currentChunk + 1
        : job.currentChunk
    ),
    created: job.created,
    updated: job.updated,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    metrics: job.metrics ?? emptyCommitProgressMetrics()
  }
}

function emptyCommitProgressMetrics(): SocialImportJobMetrics {
  return {
    recordsPerSecond: 0,
    lastCheckMs: 0,
    lastWriteMs: 0,
    lastProgressMs: 0,
    totalCheckMs: 0,
    totalWriteMs: 0,
    totalProgressMs: 0
  }
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

function formatRate(recordsPerSecond: number): string {
  if (!Number.isFinite(recordsPerSecond) || recordsPerSecond <= 0) return '0/s'
  return `${Math.round(recordsPerSecond).toLocaleString()}/s`
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
