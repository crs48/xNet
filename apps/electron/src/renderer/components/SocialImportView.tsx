/**
 * SocialImportView - local archive staging and review surface.
 */

import type {
  SocialImportArchivePreview,
  SocialImportNodeDraft,
  SocialImportStageResult
} from '../../main/social-import-ipc'
import type { DefinedSchema, PropertyBuilder } from '@xnetjs/data'
import type { MutateOp } from '@xnetjs/react'
import { useMutate } from '@xnetjs/react'
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
  X
} from 'lucide-react'
import React, { useCallback, useMemo, useState } from 'react'
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
  const [workspaceSummary, setWorkspaceSummary] = useState<SocialWorkspaceSeedSummary | null>(null)
  const [workspaceSeeding, setWorkspaceSeeding] = useState(false)
  const { mutate } = useMutate()

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

  const handlePickArchive = useCallback(async () => {
    setError(null)
    setCommitSummary(null)
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
    setWorkspaceSummary(null)
  }, [])

  const handleStage = useCallback(async () => {
    if (!archive || !archive.adapter) return

    setError(null)
    setCommitSummary(null)
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

  const handleCommit = useCallback(async () => {
    if (!stageResult) return

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
        mutate
      })

      setCommitSummary(summary)
      setWorkspaceSummary(null)
      setStatus('committed')
    } catch (err) {
      setStatus('staged')
      setError(toErrorMessage(err))
    }
  }, [includeSourceRecords, mutate, stageResult])

  const handleOpenWorkspace = useCallback(async () => {
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
  }, [mutate, onOpenDataWorkspace])

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
                }}
              />
              <ToggleRow
                label="Source Records"
                checked={includeSourceRecords}
                disabled={!stageResult}
                onChange={setIncludeSourceRecords}
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
                disabled={!stageResult || status === 'committing' || status === 'committed'}
                className="flex items-center gap-2 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === 'committing' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Import size={14} />
                )}
                Import
              </button>
              <button
                type="button"
                onClick={() => void handleOpenWorkspace()}
                disabled={status !== 'committed' || workspaceSeeding}
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
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="Canonical" value={canonicalRecordCount} />
        <SummaryTile label="Source" value={sourceRecordCount} />
        <SummaryTile label="Warnings" value={stageResult.summary.totalWarnings} />
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

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border px-3 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-semibold tabular-nums">{value.toLocaleString()}</div>
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

async function commitDrafts(input: {
  drafts: SocialImportNodeDraft[]
  mutate: (ops: MutateOp[]) => Promise<unknown>
}): Promise<CommitSummary> {
  const chunks = chunk(input.drafts, COMMIT_BATCH_SIZE)
  let created = 0
  let updated = 0

  for (const drafts of chunks) {
    const operations = await Promise.all(
      drafts.map(async (draft): Promise<MutateOp> => {
        const existing = await window.xnetNodes.getNode(draft.deterministicId)
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
