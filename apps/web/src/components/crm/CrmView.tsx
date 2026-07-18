/**
 * CRM workspace (exploration 0188) — a singleton surface, like /tasks and
 * /experiments. An internal segmented switcher moves between the
 * relationship-centric Contacts view, the deal Pipeline, Companies, and the
 * "Keep in touch" follow-up queue. A default pipeline is seeded on first use so
 * the board is never empty.
 */
import { computeNextTouch, dueForFollowUp, daysUntilTouch } from '@xnetjs/crm'
import { ContactSchema, OrganizationSchema, PipelineSchema, StageSchema } from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState, type JSX } from 'react'
import { ActivityTimeline } from '../ActivityTimeline'
import { NodePeek } from '../NodeInspector'
import { LensChips } from '../../workbench/sidebar/LensChips'
import { num, relDays, str } from './crm-helpers'
import { CrmContacts } from './CrmContacts'
import { CrmForecast } from './CrmForecast'
import { CrmPipeline } from './CrmPipeline'
import { ProductsPanel } from './ProductsPanel'

type CrmTab = 'contacts' | 'pipeline' | 'forecast' | 'companies' | 'products' | 'keep'

const TABS: Array<{ id: CrmTab; label: string }> = [
  { id: 'contacts', label: 'Contacts' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'companies', label: 'Companies' },
  { id: 'products', label: 'Products' },
  { id: 'keep', label: 'Keep in touch' }
]

/** The default pipeline's stages, seeded on first use. */
const DEFAULT_STAGES: Array<{
  name: string
  probability: number
  isClosed?: boolean
  isWon?: boolean
}> = [
  { name: 'Lead', probability: 0.1 },
  { name: 'Qualified', probability: 0.3 },
  { name: 'Proposal', probability: 0.6 },
  { name: 'Negotiation', probability: 0.8 },
  { name: 'Won', probability: 1, isClosed: true, isWon: true },
  { name: 'Lost', probability: 0, isClosed: true, isWon: false }
]

export function CrmView({
  view,
  onViewChange
}: {
  /** Active view from the route's `view` search param (0353). */
  view?: string
  onViewChange?: (view: string) => void
} = {}): JSX.Element {
  // Route-addressed views (0353): the URL is the state, so a CRM view is
  // linkable and reachable from ⌘K like any other destination. Falls
  // back to local state on surfaces that don't route (tests, embeds).
  const [localTab, setLocalTab] = useState<CrmTab>('contacts')
  const tab: CrmTab = TABS.some((t) => t.id === view) ? (view as CrmTab) : localTab
  const setTab = (next: CrmTab) => {
    setLocalTab(next)
    onViewChange?.(next)
  }
  const { data: pipelineData, loading } = useQuery(PipelineSchema, {
    orderBy: { createdAt: 'asc' }
  })
  const { create } = useMutate()
  const seeding = useRef(false)

  const pipelines = (pipelineData ?? []) as Array<{ id: string; isDefault?: unknown }>
  const defaultPipeline = pipelines.find((p) => Boolean(p.isDefault)) ?? pipelines[0]

  // Seed a default pipeline + stages exactly once, when none exist yet.
  useEffect(() => {
    if (loading || seeding.current || pipelines.length > 0) return
    seeding.current = true
    void (async () => {
      const pipeline = await create(PipelineSchema, { name: 'Sales', isDefault: true })
      if (!pipeline?.id) return
      for (let i = 0; i < DEFAULT_STAGES.length; i++) {
        const s = DEFAULT_STAGES[i]
        await create(StageSchema, {
          name: s.name,
          pipeline: pipeline.id,
          sortKey: String(i + 1).padStart(4, '0'),
          probability: s.probability,
          isClosed: s.isClosed ?? false,
          isWon: s.isWon ?? false
        })
      }
    })()
  }, [loading, pipelines.length, create])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Lens chips, not a tab bar (0353): the same primitive the
          sidebar uses, so no surface grows a second tab system. */}
      <div className="flex items-center gap-1 border-b border-hairline px-3 py-1.5">
        <LensChips choices={TABS} activeId={tab} onSelect={(id) => setTab(id as CrmTab)} />
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'contacts' && <CrmContacts />}
        {tab === 'pipeline' &&
          (defaultPipeline ? (
            <CrmPipeline pipelineId={defaultPipeline.id} />
          ) : (
            <p className="p-6 text-xs text-ink-3">Setting up your pipeline…</p>
          ))}
        {tab === 'forecast' &&
          (defaultPipeline ? (
            <CrmForecast pipelineId={defaultPipeline.id} />
          ) : (
            <p className="p-6 text-xs text-ink-3">Setting up your pipeline…</p>
          ))}
        {tab === 'companies' && <CompaniesPanel />}
        {tab === 'products' && <ProductsPanel />}
        {tab === 'keep' && <KeepInTouchPanel />}
      </div>
    </div>
  )
}

interface OrgRow {
  id: string
  name?: unknown
  domain?: unknown
}

function CompaniesPanel(): JSX.Element {
  const { data, loading } = useQuery(OrganizationSchema, { orderBy: { createdAt: 'desc' } })
  const { create, update } = useMutate()
  const orgs = (data ?? []) as OrgRow[]
  const [peekOrgId, setPeekOrgId] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink-1">Companies</h2>
        <button
          type="button"
          onClick={() => void create(OrganizationSchema, { name: 'New company' })}
          className="flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-1 hover:bg-accent"
        >
          <Plus size={13} strokeWidth={1.5} /> New company
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : orgs.length === 0 ? (
        <p className="text-xs text-ink-3">No companies yet.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {orgs.map((o) => (
            <li key={o.id} className="group flex items-center gap-3 py-2">
              <input
                defaultValue={str(o.name)}
                onBlur={(e) => void update(OrganizationSchema, o.id, { name: e.target.value })}
                className="flex-1 border-none bg-transparent text-sm text-ink-1 outline-none"
              />
              <input
                defaultValue={str(o.domain)}
                placeholder="domain.com"
                onBlur={(e) =>
                  void update(OrganizationSchema, o.id, { domain: e.target.value || undefined })
                }
                className="w-40 border-none bg-transparent text-right text-xs text-ink-3 outline-none"
              />
              <button
                type="button"
                aria-label="Company details"
                title="Edit all fields"
                onClick={() => setPeekOrgId(o.id)}
                className="shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-ink-1 group-hover:opacity-100"
              >
                <SlidersHorizontal size={13} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <NodePeek
        schema={OrganizationSchema}
        nodeId={peekOrgId ?? ''}
        open={peekOrgId != null}
        onClose={() => setPeekOrgId(null)}
        formOptions={{
          highlights: ['name', 'domain', 'industry', 'website'],
          groups: {
            street: 'Address',
            city: 'Address',
            region: 'Address',
            postalCode: 'Address',
            country: 'Address',
            annualRevenue: 'Firmographics',
            size: 'Firmographics',
            currency: 'Firmographics'
          }
        }}
        extraPanels={
          peekOrgId
            ? [
                {
                  id: 'activity',
                  title: 'Activity',
                  render: () => <ActivityTimeline aboutId={peekOrgId} />
                }
              ]
            : undefined
        }
      />
    </div>
  )
}

interface ContactRow {
  id: string
  displayName?: unknown
  lastTouchAt?: unknown
  nextTouchAt?: unknown
  touchEveryDays?: unknown
}

function KeepInTouchPanel(): JSX.Element {
  const { data, loading } = useQuery(ContactSchema, { orderBy: { createdAt: 'desc' } })
  const { update } = useMutate()
  const contacts = (data ?? []) as ContactRow[]

  const due = dueForFollowUp(
    contacts.map((c) => ({
      ...c,
      lastTouchAt: num(c.lastTouchAt),
      nextTouchAt: num(c.nextTouchAt),
      touchEveryDays: num(c.touchEveryDays)
    })),
    Date.now()
  )

  const logTouch = (c: ContactRow) => {
    const now = Date.now()
    void update(ContactSchema, c.id, {
      lastTouchAt: now,
      nextTouchAt: computeNextTouch(now, num(c.touchEveryDays) ?? null, now) ?? undefined
    } as never)
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="mb-3 text-sm font-medium text-ink-1">Due for follow-up</h2>
      {loading ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : due.length === 0 ? (
        <p className="text-xs text-ink-3">
          Nobody is overdue. Set a “keep in touch” cadence on a contact to see them here.
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {due.map((c) => {
            const until = daysUntilTouch(c, Date.now())
            return (
              <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1 text-ink-1">
                  {str(c.displayName) || 'Untitled contact'}
                </span>
                <span className="text-xs text-red-500">{relDays(until)}</span>
                <button
                  type="button"
                  onClick={() => logTouch(c)}
                  className="rounded-md border border-hairline px-2 py-0.5 text-xs text-ink-1 hover:bg-accent"
                >
                  Log touch
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
