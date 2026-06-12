import type { SavedViewDescriptor } from '@xnetjs/data'
import { SavedViewSchema, validateSavedViewDescriptor } from '@xnetjs/data'
import {
  SavedViewRunner,
  useMutate,
  useQuery,
  type MutateOp,
  type SavedViewLensDraft,
  type SavedViewSchemaRegistry
} from '@xnetjs/react'
import { useNodeStore } from '@xnetjs/react/internal'
import {
  listSocialImportJobs,
  subscribeSocialImportJobs,
  type SocialImportJobProgress
} from '@xnetjs/social/import/core'
import { createDefaultSocialGraphAtlas, type SocialGraphAtlasEntry } from '@xnetjs/social/lenses'
import {
  createSocialPatternSavedViewDraft,
  detectSocialPatterns,
  type SocialPatternKind,
  type SocialPatternSuggestion
} from '@xnetjs/social/patterns'
import {
  SocialActorSchema,
  SocialCollectionSchema,
  SocialContentSchema,
  SocialConversationSchema,
  SocialImportRunSchema,
  SocialInteractionSchema,
  SocialMessageSchema,
  socialSchemas
} from '@xnetjs/social/schemas'
import {
  recommendSocialAnalyticsCache,
  type SocialAnalyticsCacheRecommendation
} from '@xnetjs/social/workspace'
import {
  AlertTriangle,
  BarChart3,
  Database,
  GitBranch,
  Import,
  Loader2,
  MessageSquare,
  Network,
  Save,
  Search,
  Shield,
  Table,
  UserRound
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSocialFeedEnrichment } from '../hooks/useSocialFeedEnrichment'
import {
  getDefaultSocialWorkspaceSeeds,
  upsertDefaultSocialWorkspace,
  type SocialWorkspaceSeedSummary
} from '../lib/social-workspace'

type SavedViewRow = {
  id: string
  title?: string
  description?: string
  descriptor?: string
  scope?: string
}

type ParsedDescriptor = {
  valid: boolean
  queryKind: string
  queryMode: string | null
  primarySchemaId: string | null
}

type WorkspaceMetric = {
  id: string
  label: string
  value: number | null
  icon: typeof UserRound
}

type GraphAtlasRow = {
  entry: SocialGraphAtlasEntry
  savedView: SavedViewRow | null
}

const SOCIAL_SCHEMA_REGISTRY = socialSchemas as unknown as SavedViewSchemaRegistry
const PATTERN_QUERY_LIMIT = 300
const DISMISSED_PATTERN_STORAGE_KEY = 'xnet:data-workspace:dismissed-patterns'

function getCount(input: { totalCount: number | null; data: unknown[] }): number | null {
  return input.totalCount ?? (input.data.length > 0 ? input.data.length : null)
}

function parseSavedViewDescriptor(value: string | undefined): ParsedDescriptor {
  if (!value) {
    return {
      valid: false,
      queryKind: 'unknown',
      queryMode: null,
      primarySchemaId: null
    }
  }

  try {
    const descriptor = JSON.parse(value) as SavedViewDescriptor
    const validation = validateSavedViewDescriptor(descriptor)
    const query = descriptor.query as Record<string, unknown>
    const queryKind = typeof query.kind === 'string' ? query.kind : 'unknown'
    const queryMode = typeof query.mode === 'string' ? query.mode : null
    const primarySchemaId =
      queryKind === 'query-set' ? primarySchemaIdForQuerySet(query) : primarySchemaIdForQuery(query)

    return {
      valid: validation.valid,
      queryKind,
      queryMode,
      primarySchemaId
    }
  } catch {
    return {
      valid: false,
      queryKind: 'invalid-json',
      queryMode: null,
      primarySchemaId: null
    }
  }
}

function parseSavedViewDescriptorObject(value: string | undefined): SavedViewDescriptor | null {
  if (!value) return null

  try {
    const descriptor = JSON.parse(value) as SavedViewDescriptor
    return validateSavedViewDescriptor(descriptor).valid ? descriptor : null
  } catch {
    return null
  }
}

function primarySchemaIdForQuery(query: Record<string, unknown>): string | null {
  const schema = query.schema as Record<string, unknown> | undefined
  return typeof schema?.id === 'string'
    ? schema.id
    : typeof schema?.['@id'] === 'string'
      ? schema['@id']
      : typeof query.schemaId === 'string'
        ? query.schemaId
        : null
}

function primarySchemaIdForQuerySet(query: Record<string, unknown>): string | null {
  const queries = query.queries as Record<string, Record<string, unknown>> | undefined
  const firstQuery = queries ? Object.values(queries)[0] : null
  return firstQuery ? primarySchemaIdForQuery(firstQuery) : null
}

function metricValueLabel(value: number | null): string {
  return value === null ? '-' : value.toLocaleString()
}

function sumKnownCounts(values: readonly (number | null)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0)
}

function descriptorKindLabel(descriptor: ParsedDescriptor): string {
  if (!descriptor.valid) return 'Invalid'
  if (descriptor.queryKind === 'query-set') return descriptor.queryMode ?? 'query set'
  return descriptor.queryKind
}

function isVisibleSocialImportJob(job: SocialImportJobProgress): boolean {
  if (job.status !== 'completed') return true
  return Date.now() - job.updatedAt < 5 * 60 * 1000
}

function socialImportJobPercent(job: SocialImportJobProgress): number {
  if (!job.totalRecords || job.totalRecords <= 0) return job.status === 'completed' ? 100 : 0
  return Math.min(100, Math.max(0, (job.processedRecords / job.totalRecords) * 100))
}

function socialImportJobStatusLabel(job: SocialImportJobProgress): string {
  if (job.status === 'queued') return 'Queued'
  if (job.status === 'running') return 'Running'
  if (job.status === 'paused') return 'Paused'
  if (job.status === 'completed') return 'Complete'
  if (job.status === 'failed') return 'Failed'
  return 'Cancelled'
}

function socialImportJobRecordLabel(job: SocialImportJobProgress): string {
  if (!job.totalRecords) return job.processedRecords.toLocaleString()
  return `${job.processedRecords.toLocaleString()} / ${job.totalRecords.toLocaleString()}`
}

function socialImportJobRateLabel(job: SocialImportJobProgress): string {
  const recordsPerSecond = job.metrics?.recordsPerSecond ?? 0
  if (!Number.isFinite(recordsPerSecond) || recordsPerSecond <= 0) return '0/s'
  return `${Math.round(recordsPerSecond).toLocaleString()}/s`
}

function readDismissedPatternIds(): string[] {
  if (typeof localStorage === 'undefined') return []

  try {
    const value = JSON.parse(localStorage.getItem(DISMISSED_PATTERN_STORAGE_KEY) ?? '[]')
    return Array.isArray(value)
      ? value.flatMap((item) => (typeof item === 'string' ? [item] : []))
      : []
  } catch {
    return []
  }
}

function writeDismissedPatternIds(ids: readonly string[]): void {
  if (typeof localStorage === 'undefined') return

  localStorage.setItem(DISMISSED_PATTERN_STORAGE_KEY, JSON.stringify([...new Set(ids)].sort()))
}

function toPatternRows(rows: readonly unknown[]): Record<string, unknown>[] {
  return rows as unknown as Record<string, unknown>[]
}

function patternIconFor(kind: SocialPatternKind): typeof BarChart3 {
  if (kind === 'privacy-hotspots') return Shield
  if (kind === 'cross-source-overlap') return Search
  if (kind === 'bridge-actors') return Network
  if (kind === 'unrevisited-saves') return Import
  if (kind === 'attention-bursts') return BarChart3
  return BarChart3
}

export function DataWorkspaceView(): JSX.Element {
  const { create, mutate } = useMutate()
  const { store, isReady: storeReady } = useNodeStore()
  const feedEnrichment = useSocialFeedEnrichment()
  const [socialImportJobs, setSocialImportJobs] =
    useState<SocialImportJobProgress[]>(listSocialImportJobs)
  const [seedSummary, setSeedSummary] = useState<SocialWorkspaceSeedSummary | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [saveLensMessage, setSaveLensMessage] = useState<string | null>(null)
  const [saveLensError, setSaveLensError] = useState<string | null>(null)
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null)
  const [dismissedPatternIds, setDismissedPatternIds] = useState<string[]>(readDismissedPatternIds)
  const { data: savedViews, loading: savedViewsLoading } = useQuery(SavedViewSchema, {
    orderBy: { title: 'asc' },
    limit: 200
  })
  const actorQuery = useQuery(SocialActorSchema, { page: { first: 1, count: 'estimate' } })
  const contentQuery = useQuery(SocialContentSchema, {
    page: { first: PATTERN_QUERY_LIMIT, count: 'estimate' },
    orderBy: { importedAt: 'desc' }
  })
  const interactionQuery = useQuery(SocialInteractionSchema, {
    page: { first: PATTERN_QUERY_LIMIT, count: 'estimate' },
    orderBy: { importedAt: 'desc' }
  })
  const messageQuery = useQuery(SocialMessageSchema, { page: { first: 1, count: 'estimate' } })
  const conversationQuery = useQuery(SocialConversationSchema, {
    page: { first: 1, count: 'estimate' }
  })
  const collectionQuery = useQuery(SocialCollectionSchema, {
    page: { first: 1, count: 'estimate' }
  })
  const importRunQuery = useQuery(SocialImportRunSchema, {
    page: { first: 50, count: 'estimate' },
    orderBy: { startedAt: 'desc' }
  })

  const defaultSeeds = useMemo(() => getDefaultSocialWorkspaceSeeds(), [])
  const defaultSeedIds = useMemo(
    () => new Set(defaultSeeds.map((seed) => seed.deterministicId)),
    [defaultSeeds]
  )
  const defaultSeedBySourceId = useMemo(
    () => new Map(defaultSeeds.map((seed) => [seed.id, seed])),
    [defaultSeeds]
  )
  const graphAtlasEntries = useMemo(() => createDefaultSocialGraphAtlas({ pageSize: 100 }), [])
  const socialWorkspaceViews = useMemo(
    () => (savedViews as SavedViewRow[]).filter((view) => defaultSeedIds.has(view.id)),
    [defaultSeedIds, savedViews]
  )
  const otherSavedViews = useMemo(
    () => (savedViews as SavedViewRow[]).filter((view) => !defaultSeedIds.has(view.id)),
    [defaultSeedIds, savedViews]
  )
  const allSavedViews = useMemo(
    () => [...socialWorkspaceViews, ...otherSavedViews],
    [otherSavedViews, socialWorkspaceViews]
  )
  const selectedView = useMemo(
    () =>
      allSavedViews.find((view) => view.id === selectedViewId) ??
      socialWorkspaceViews[0] ??
      allSavedViews[0] ??
      null,
    [allSavedViews, selectedViewId, socialWorkspaceViews]
  )
  const metrics: WorkspaceMetric[] = [
    {
      id: 'actors',
      label: 'People',
      value: getCount(actorQuery),
      icon: UserRound
    },
    {
      id: 'content',
      label: 'Content',
      value: getCount(contentQuery),
      icon: Table
    },
    {
      id: 'interactions',
      label: 'Interactions',
      value: getCount(interactionQuery),
      icon: Network
    },
    {
      id: 'messages',
      label: 'Messages',
      value: getCount(messageQuery),
      icon: MessageSquare
    },
    {
      id: 'conversations',
      label: 'Conversations',
      value: getCount(conversationQuery),
      icon: GitBranch
    },
    {
      id: 'collections',
      label: 'Collections',
      value: getCount(collectionQuery),
      icon: Database
    },
    {
      id: 'import-runs',
      label: 'Import Runs',
      value: getCount(importRunQuery),
      icon: Import
    }
  ]
  const analyticsCacheRecommendation = recommendSocialAnalyticsCache({
    rowCount: sumKnownCounts(metrics.map((metric) => metric.value)),
    columnCount: 12,
    relationCount: getCount(interactionQuery) ?? 0
  })
  const dismissedPatternIdSet = useMemo(() => new Set(dismissedPatternIds), [dismissedPatternIds])
  const patternSuggestions = useMemo(
    () =>
      detectSocialPatterns({
        content: toPatternRows(contentQuery.data),
        interactions: toPatternRows(interactionQuery.data),
        importRuns: toPatternRows(importRunQuery.data)
      }).filter((pattern) => !dismissedPatternIdSet.has(pattern.id)),
    [contentQuery.data, dismissedPatternIdSet, importRunQuery.data, interactionQuery.data]
  )
  const graphAtlasRows = useMemo<GraphAtlasRow[]>(
    () =>
      graphAtlasEntries.map((entry) => {
        const seed = defaultSeedBySourceId.get(entry.id)
        const savedView = seed
          ? (socialWorkspaceViews.find((view) => view.id === seed.deterministicId) ?? null)
          : null

        return { entry, savedView }
      }),
    [defaultSeedBySourceId, graphAtlasEntries, socialWorkspaceViews]
  )
  const visibleSocialImportJobs = useMemo(
    () => socialImportJobs.filter(isVisibleSocialImportJob).slice(0, 3),
    [socialImportJobs]
  )

  useEffect(() => {
    if (!selectedViewId && selectedView) {
      setSelectedViewId(selectedView.id)
      return
    }

    if (selectedViewId && !allSavedViews.some((view) => view.id === selectedViewId)) {
      setSelectedViewId(selectedView?.id ?? null)
    }
  }, [allSavedViews, selectedView, selectedViewId])

  useEffect(() => subscribeSocialImportJobs(() => setSocialImportJobs(listSocialImportJobs())), [])

  async function handleSeedWorkspace() {
    if (!store || !storeReady) return

    setSeeding(true)
    setSeedError(null)

    try {
      const summary = await upsertDefaultSocialWorkspace({
        mutate,
        getExisting: (id) => store.get(id)
      })
      setSeedSummary(summary)
    } catch (error) {
      setSeedError(error instanceof Error ? error.message : String(error))
    } finally {
      setSeeding(false)
    }
  }

  async function handleSaveLens(draft: SavedViewLensDraft): Promise<void> {
    setSaveLensMessage(null)
    setSaveLensError(null)

    try {
      const savedView = await create(SavedViewSchema, {
        title: draft.title,
        description: draft.description,
        descriptor: JSON.stringify(draft.descriptor),
        scope: draft.descriptor.scope ?? 'workspace'
      })

      if (!savedView) {
        throw new Error('Saved lens could not be created.')
      }

      setSelectedViewId(savedView.id)
      setSaveLensMessage(`Saved lens: ${draft.title}.`)
    } catch (error) {
      setSaveLensError(error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  function handleOpenPattern(pattern: SocialPatternSuggestion): void {
    const view = socialWorkspaceViews.find((candidate) => candidate.title === pattern.viewHint)
    if (view) {
      setSelectedViewId(view.id)
    }
  }

  async function upsertPatternSavedView(
    pattern: SocialPatternSuggestion
  ): Promise<SavedViewRow | null> {
    setSaveLensMessage(null)
    setSaveLensError(null)

    const baseView = socialWorkspaceViews.find((candidate) => candidate.title === pattern.viewHint)
    const baseDescriptor = parseSavedViewDescriptorObject(baseView?.descriptor)

    if (!baseView || !baseDescriptor) {
      setSaveLensError(`Seed the ${pattern.viewHint} view before saving this pattern.`)
      return null
    }

    const draft = createSocialPatternSavedViewDraft({ pattern, baseDescriptor })
    if (!draft) {
      setSaveLensError('Pattern lens could not be created from the base view.')
      return null
    }

    const existing = allSavedViews.some((view) => view.id === draft.deterministicId)
    const operation: MutateOp = existing
      ? {
          type: 'update',
          id: draft.deterministicId,
          data: draft.savedViewProperties
        }
      : {
          type: 'create',
          id: draft.deterministicId,
          schema: SavedViewSchema,
          data: draft.savedViewProperties
        }

    await mutate([operation])

    const savedView = {
      id: draft.deterministicId,
      ...draft.savedViewProperties
    }
    setSelectedViewId(savedView.id)
    setSaveLensMessage(`${existing ? 'Updated' : 'Saved'} pattern lens: ${draft.title}.`)
    return savedView
  }

  async function handleSavePattern(pattern: SocialPatternSuggestion): Promise<void> {
    await upsertPatternSavedView(pattern)
  }

  function handleDismissPattern(patternId: string): void {
    setDismissedPatternIds((current) => {
      const next = [...new Set([...current, patternId])]
      writeDismissedPatternIds(next)
      return next
    })
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database size={15} />
            <span>Imported data</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold">Data Workspace</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Saved views and starter graph lenses over typed xNet data, seeded by social imports.
          </p>
        </div>
        <button
          type="button"
          disabled={!storeReady || seeding}
          onClick={() => void handleSeedWorkspace()}
          className="flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {seeding ? <Loader2 size={15} className="animate-spin" /> : <Import size={15} />}
          Seed Social Views
        </button>
      </header>

      {seedSummary ? (
        <StatusBanner
          tone="success"
          message={`Workspace views ready: ${seedSummary.created} created, ${seedSummary.updated} updated.`}
        />
      ) : null}
      {seedError ? <StatusBanner tone="error" message={seedError} /> : null}
      {saveLensMessage ? <StatusBanner tone="success" message={saveLensMessage} /> : null}
      {saveLensError ? <StatusBanner tone="error" message={saveLensError} /> : null}
      <SocialImportJobsPanel jobs={visibleSocialImportJobs} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon

          return (
            <div key={metric.id} className="rounded-md border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{metric.label}</span>
                <Icon size={16} className="text-muted-foreground" />
              </div>
              <div className="mt-2 text-2xl font-semibold">{metricValueLabel(metric.value)}</div>
            </div>
          )
        })}
      </section>

      <GraphAtlasPanel
        rows={graphAtlasRows}
        selectedViewId={selectedView?.id ?? null}
        onOpen={(view) => setSelectedViewId(view.id)}
      />

      <div className="grid min-h-[820px] grid-cols-1 overflow-hidden rounded-md border border-border lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-secondary/40 p-4 lg:border-b-0 lg:border-r">
          <div className="space-y-4">
            <div>
              <SectionLabel label="Sources" />
              <div className="mt-2 space-y-2">
                <SourceRow
                  label="Social archive imports"
                  value={metricValueLabel(getCount(importRunQuery))}
                />
                <SourceRow label="Saved views" value={String(savedViews.length)} />
                <SourceRow
                  label="Starter views"
                  value={`${socialWorkspaceViews.length}/${defaultSeeds.length}`}
                />
                <AnalyticsCacheRow recommendation={analyticsCacheRecommendation} />
              </div>
            </div>
            <div>
              <SectionLabel label="Patterns" />
              <div className="mt-2 space-y-2">
                {patternSuggestions.length > 0 ? (
                  patternSuggestions.map((pattern) => (
                    <PatternRow
                      key={pattern.id}
                      icon={patternIconFor(pattern.kind)}
                      pattern={pattern}
                      onOpen={handleOpenPattern}
                      onSave={(nextPattern) => void handleSavePattern(nextPattern)}
                      onDismiss={handleDismissPattern}
                    />
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground">
                    No patterns surfaced from the loaded rows yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 overflow-auto p-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Social Starter Lenses</h2>
                <p className="text-sm text-muted-foreground">
                  Schema views and graph-lens query sets persisted as saved views.
                </p>
              </div>
              {savedViewsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  Loading
                </div>
              ) : null}
            </div>
            <SavedViewTable
              views={socialWorkspaceViews}
              selectedViewId={selectedView?.id ?? null}
              emptyLabel="No social workspace views yet."
              onSelect={setSelectedViewId}
            />
          </section>

          <SavedViewRunner
            descriptor={selectedView?.descriptor ?? null}
            registry={SOCIAL_SCHEMA_REGISTRY}
            title={selectedView?.title ?? null}
            description={selectedView?.description ?? null}
            fallbackId={selectedView?.id ?? null}
            resetKey={selectedView?.id ?? null}
            onSaveLens={handleSaveLens}
            feedEnrichment={feedEnrichment}
          />

          <section className="mt-6 space-y-3">
            <div>
              <h2 className="text-base font-semibold">Other Saved Views</h2>
              <p className="text-sm text-muted-foreground">
                General saved views will use the same workspace surface as more importers land.
              </p>
            </div>
            <SavedViewTable
              views={otherSavedViews}
              selectedViewId={selectedView?.id ?? null}
              emptyLabel="No other saved views."
              onSelect={setSelectedViewId}
            />
          </section>
        </main>
      </div>
    </div>
  )
}

function SocialImportJobsPanel({ jobs }: { jobs: SocialImportJobProgress[] }): JSX.Element | null {
  if (jobs.length === 0) return null

  return (
    <section className="space-y-2">
      <SectionLabel label="Import Jobs" />
      <div className="space-y-2">
        {jobs.map((job) => {
          const percent = socialImportJobPercent(job)
          const statusLabel = socialImportJobStatusLabel(job)

          return (
            <div key={job.jobId} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {job.status === 'running' || job.status === 'queued' ? (
                      <Loader2 size={14} className="animate-spin text-muted-foreground" />
                    ) : (
                      <Import size={14} className="text-muted-foreground" />
                    )}
                    <div className="truncate text-sm font-medium">{job.archiveName}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {job.platform} / {statusLabel} / {job.phase}
                  </div>
                </div>
                <div className="text-right text-sm font-medium tabular-nums">
                  {Math.floor(percent)}%
                </div>
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={job.totalRecords ?? job.processedRecords}
                aria-valuenow={job.processedRecords}
                aria-label={`Import progress for ${job.archiveName}`}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <JobMetric label="Records" value={socialImportJobRecordLabel(job)} />
                <JobMetric label="Created" value={job.created.toLocaleString()} />
                <JobMetric label="Updated" value={job.updated.toLocaleString()} />
                <JobMetric label="Rate" value={socialImportJobRateLabel(job)} />
              </div>
              {job.error ? (
                <div className="mt-2 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                  <AlertTriangle size={13} />
                  <span className="min-w-0 truncate">{job.error}</span>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function JobMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div className="uppercase tracking-wide">{label}</div>
      <div className="mt-0.5 font-medium text-foreground tabular-nums">{value}</div>
    </div>
  )
}

function SavedViewTable({
  views,
  selectedViewId,
  emptyLabel,
  onSelect
}: {
  views: SavedViewRow[]
  selectedViewId: string | null
  emptyLabel: string
  onSelect: (viewId: string) => void
}): JSX.Element {
  if (views.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">View</th>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="px-3 py-2 font-medium">Scope</th>
            <th className="px-3 py-2 font-medium">Schema</th>
          </tr>
        </thead>
        <tbody>
          {views.map((view) => {
            const descriptor = parseSavedViewDescriptor(view.descriptor)
            const selected = view.id === selectedViewId

            return (
              <tr
                key={view.id}
                className={['border-t border-border', selected ? 'bg-accent/40' : ''].join(' ')}
              >
                <td className="min-w-0 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onSelect(view.id)}
                    className="block w-full min-w-0 text-left"
                  >
                    <span className="block truncate font-medium">
                      {view.title ?? 'Untitled view'}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {view.description ?? view.id}
                    </span>
                  </button>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {descriptorKindLabel(descriptor)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{view.scope ?? '-'}</td>
                <td className="max-w-[280px] truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                  {descriptor.primarySchemaId ?? '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function GraphAtlasPanel({
  rows,
  selectedViewId,
  onOpen
}: {
  rows: GraphAtlasRow[]
  selectedViewId: string | null
  onOpen: (view: SavedViewRow) => void
}): JSX.Element {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Graph Atlas</h2>
          <p className="text-sm text-muted-foreground">
            Starter graph lenses organized by node roles, relationship rules, and saved-view state.
          </p>
        </div>
        <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
          {rows.filter((row) => row.savedView).length}/{rows.length} seeded
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <GraphAtlasCard
            key={row.entry.id}
            row={row}
            selected={row.savedView?.id === selectedViewId}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  )
}

function GraphAtlasCard({
  row,
  selected,
  onOpen
}: {
  row: GraphAtlasRow
  selected: boolean
  onOpen: (view: SavedViewRow) => void
}): JSX.Element {
  const { entry, savedView } = row

  return (
    <div
      className={[
        'rounded-md border p-3',
        selected ? 'border-primary/50 bg-primary/5' : 'border-border'
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Network size={15} className="text-muted-foreground" />
            <h3 className="truncate text-sm font-medium">{entry.title}</h3>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.description}</p>
        </div>
        <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          {savedView ? 'saved' : 'seed'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <GraphAtlasMetric label="Queries" value={entry.queryCount} />
        <GraphAtlasMetric label="Roles" value={entry.nodeRoles.length} />
        <GraphAtlasMetric label="Edges" value={entry.edgeRules.length} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        {entry.nodeRoles.slice(0, 3).map((role) => (
          <span
            key={`${entry.id}:${role.queryId}`}
            className="rounded border border-border px-1.5 py-0.5"
          >
            {role.role}
          </span>
        ))}
        {entry.relationshipKinds.slice(0, 3).map((kind) => (
          <span key={`${entry.id}:${kind}`} className="rounded border border-border px-1.5 py-0.5">
            {kind}
          </span>
        ))}
      </div>
      <div className="mt-3">
        <button
          type="button"
          disabled={!savedView}
          onClick={() => {
            if (savedView) onOpen(savedView)
          }}
          className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
        >
          Open
        </button>
      </div>
    </div>
  )
}

function GraphAtlasMetric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-md bg-secondary px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide">{label}</div>
      <div className="mt-0.5 font-medium text-foreground">{value.toLocaleString()}</div>
    </div>
  )
}

function SectionLabel({ label }: { label: string }): JSX.Element {
  return (
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
  )
}

function SourceRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
      <span className="min-w-0 truncate text-sm">{label}</span>
      <span className="text-xs text-muted-foreground">{value}</span>
    </div>
  )
}

function AnalyticsCacheRow({
  recommendation
}: {
  recommendation: SocialAnalyticsCacheRecommendation
}): JSX.Element {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm">Scale cache</span>
        <span className="text-xs text-muted-foreground">{recommendation.label}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{recommendation.reason}</p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        <span className="rounded border border-border px-1.5 py-0.5">
          {recommendation.estimatedRows.toLocaleString()} rows
        </span>
        <span className="rounded border border-border px-1.5 py-0.5">
          {recommendation.estimatedCells.toLocaleString()} cells
        </span>
      </div>
    </div>
  )
}

function PatternRow({
  icon: Icon,
  pattern,
  onOpen,
  onSave,
  onDismiss
}: {
  icon: typeof BarChart3
  pattern: SocialPatternSuggestion
  onOpen: (pattern: SocialPatternSuggestion) => void
  onSave: (pattern: SocialPatternSuggestion) => void
  onDismiss: (patternId: string) => void
}): JSX.Element {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
      <div className="flex items-start gap-2">
        <Icon size={14} className="mt-0.5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{pattern.title}</div>
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {pattern.description}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        <span className="rounded border border-border px-1.5 py-0.5">
          {pattern.evidenceCount.toLocaleString()} evidence
        </span>
        {pattern.platforms.slice(0, 2).map((platform) => (
          <span key={platform} className="rounded border border-border px-1.5 py-0.5">
            {platform}
          </span>
        ))}
        {pattern.privacyClasses.slice(0, 2).map((privacyClass) => (
          <span key={privacyClass} className="rounded border border-border px-1.5 py-0.5">
            {privacyClass}
          </span>
        ))}
        {pattern.sourceImportRunIds.length > 0 ? (
          <span className="rounded border border-border px-1.5 py-0.5">
            {pattern.sourceImportRunIds.length} runs
          </span>
        ) : null}
      </div>
      {pattern.evidence.length > 0 ? (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {pattern.evidence.slice(0, 2).map((item) => (
            <div key={`${item.label}:${item.value}`} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{item.value}</span>
              <span>{item.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpen(pattern)}
          className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent"
        >
          Open
        </button>
        <button
          type="button"
          onClick={() => onSave(pattern)}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent"
        >
          <Save size={12} />
          Save
        </button>
        <button
          type="button"
          onClick={() => onDismiss(pattern.id)}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Hide
        </button>
      </div>
    </div>
  )
}

function StatusBanner({
  message,
  tone
}: {
  message: string
  tone: 'error' | 'success' | 'warning'
}): JSX.Element {
  const toneClassName = {
    error: 'border-destructive/40 bg-destructive/10 text-destructive',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }[tone]

  const Icon = tone === 'success' ? Shield : AlertTriangle

  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${toneClassName}`}>
      <Icon size={15} />
      <span className="min-w-0 truncate">{message}</span>
    </div>
  )
}
