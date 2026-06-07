import type { SavedViewDescriptor } from '@xnetjs/data'
import { SavedViewSchema, validateSavedViewDescriptor } from '@xnetjs/data'
import {
  SavedViewRunner,
  useMutate,
  useQuery,
  type SavedViewLensDraft,
  type SavedViewSchemaRegistry
} from '@xnetjs/react'
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
  AlertTriangle,
  BarChart3,
  Database,
  GitBranch,
  Import,
  Layout,
  Loader2,
  MessageSquare,
  Network,
  Search,
  Shield,
  Table,
  UserRound,
  X
} from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import {
  getDefaultSocialWorkspaceSeeds,
  upsertDefaultSocialWorkspace,
  type SocialWorkspaceSeedSummary
} from '../lib/social-workspace'

type DataWorkspaceViewProps = {
  onClose: () => void
  onInsertSavedLensAsCanvasFrame?: (input: SavedViewCanvasFrameInput) => void
}

export type SavedViewCanvasFrameInput = {
  id: string
  title?: string
  description?: string
  descriptor?: string
}

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

const SOCIAL_SCHEMA_REGISTRY = socialSchemas as unknown as SavedViewSchemaRegistry

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

function descriptorKindLabel(descriptor: ParsedDescriptor): string {
  if (!descriptor.valid) return 'Invalid'
  if (descriptor.queryKind === 'query-set') return descriptor.queryMode ?? 'query set'
  return descriptor.queryKind
}

export function DataWorkspaceView({
  onClose,
  onInsertSavedLensAsCanvasFrame
}: DataWorkspaceViewProps): React.ReactElement {
  const { create, mutate } = useMutate()
  const [seedSummary, setSeedSummary] = useState<SocialWorkspaceSeedSummary | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [saveLensMessage, setSaveLensMessage] = useState<string | null>(null)
  const [saveLensError, setSaveLensError] = useState<string | null>(null)
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null)
  const { data: savedViews, loading: savedViewsLoading } = useQuery(SavedViewSchema, {
    orderBy: { title: 'asc' },
    limit: 200
  })
  const actorQuery = useQuery(SocialActorSchema, { page: { first: 1, count: 'estimate' } })
  const contentQuery = useQuery(SocialContentSchema, { page: { first: 1, count: 'estimate' } })
  const interactionQuery = useQuery(SocialInteractionSchema, {
    page: { first: 1, count: 'estimate' }
  })
  const messageQuery = useQuery(SocialMessageSchema, { page: { first: 1, count: 'estimate' } })
  const conversationQuery = useQuery(SocialConversationSchema, {
    page: { first: 1, count: 'estimate' }
  })
  const collectionQuery = useQuery(SocialCollectionSchema, {
    page: { first: 1, count: 'estimate' }
  })
  const importRunQuery = useQuery(SocialImportRunSchema, { page: { first: 1, count: 'estimate' } })

  const defaultSeeds = useMemo(() => getDefaultSocialWorkspaceSeeds(), [])
  const defaultSeedIds = useMemo(
    () => new Set(defaultSeeds.map((seed) => seed.deterministicId)),
    [defaultSeeds]
  )
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

  useEffect(() => {
    if (!selectedViewId && selectedView) {
      setSelectedViewId(selectedView.id)
      return
    }

    if (selectedViewId && !allSavedViews.some((view) => view.id === selectedViewId)) {
      setSelectedViewId(selectedView?.id ?? null)
    }
  }, [allSavedViews, selectedView, selectedViewId])

  async function handleSeedWorkspace(): Promise<void> {
    setSeeding(true)
    setSeedError(null)

    try {
      const summary = await upsertDefaultSocialWorkspace({
        mutate,
        getExisting: (id) => window.xnetNodes.getNode(id)
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

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database size={15} />
            <span>Imported data</span>
          </div>
          <h1 className="mt-1 truncate text-lg font-semibold">Data Workspace</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={seeding}
            onClick={() => void handleSeedWorkspace()}
            className="flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {seeding ? <Loader2 size={15} className="animate-spin" /> : <Import size={15} />}
            Seed Social Views
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close data workspace"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
          <div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Saved views and starter graph lenses over typed xNet data, seeded by social imports.
            </p>
          </div>

          {seedSummary ? (
            <StatusBanner
              tone="success"
              message={`Workspace views ready: ${seedSummary.created} created, ${seedSummary.updated} updated.`}
            />
          ) : null}
          {seedError ? <StatusBanner tone="error" message={seedError} /> : null}
          {saveLensMessage ? <StatusBanner tone="success" message={saveLensMessage} /> : null}
          {saveLensError ? <StatusBanner tone="error" message={saveLensError} /> : null}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon

              return (
                <div key={metric.id} className="rounded-md border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">{metric.label}</span>
                    <Icon size={16} className="text-muted-foreground" />
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {metricValueLabel(metric.value)}
                  </div>
                </div>
              )
            })}
          </section>

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
                  </div>
                </div>
                <div>
                  <SectionLabel label="Patterns" />
                  <div className="mt-2 space-y-2">
                    <PatternRow icon={BarChart3} label="Repeated creators" />
                    <PatternRow icon={Search} label="Cross-source overlap" />
                    <PatternRow icon={Shield} label="Privacy hotspots" />
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
                  onInsertCanvasFrame={onInsertSavedLensAsCanvasFrame}
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
                  onInsertCanvasFrame={onInsertSavedLensAsCanvasFrame}
                />
              </section>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}

function SavedViewTable({
  views,
  selectedViewId,
  emptyLabel,
  onSelect,
  onInsertCanvasFrame
}: {
  views: SavedViewRow[]
  selectedViewId: string | null
  emptyLabel: string
  onSelect: (viewId: string) => void
  onInsertCanvasFrame?: (input: SavedViewCanvasFrameInput) => void
}): React.ReactElement {
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
            {onInsertCanvasFrame ? <th className="px-3 py-2 font-medium">Canvas</th> : null}
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
                {onInsertCanvasFrame ? (
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={!view.descriptor}
                      onClick={() => onInsertCanvasFrame(view)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Layout size={13} />
                      Frame
                    </button>
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SectionLabel({ label }: { label: string }): React.ReactElement {
  return (
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
  )
}

function SourceRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
      <span className="min-w-0 truncate text-sm">{label}</span>
      <span className="text-xs text-muted-foreground">{value}</span>
    </div>
  )
}

function PatternRow({
  icon: Icon,
  label
}: {
  icon: typeof BarChart3
  label: string
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <Icon size={14} className="text-muted-foreground" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  )
}

function StatusBanner({
  message,
  tone
}: {
  message: string
  tone: 'error' | 'success' | 'warning'
}): React.ReactElement {
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
