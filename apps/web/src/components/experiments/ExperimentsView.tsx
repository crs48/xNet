/**
 * Experiments workspace (exploration 0180) — master/detail. The list groups
 * experiments by lifecycle status; the detail is the protocol journal + rigor
 * scaffolding + verdict. A singleton surface (one `/experiments` tab), so the
 * selected experiment is component state.
 */
import { ExperimentSchema } from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { cn } from '@xnetjs/ui'
import { FlaskConical, Plus } from 'lucide-react'
import { useState, type JSX } from 'react'
import { ExperimentDetail } from './ExperimentDetail'

interface ExperimentNode {
  id: string
  title?: unknown
  status?: unknown
  icon?: unknown
}

const STATUS_GROUPS: Array<[string, string]> = [
  ['design', 'Design'],
  ['baseline', 'Baseline'],
  ['intervention', 'Intervention'],
  ['washout', 'Washout'],
  ['analysis', 'Analysis'],
  ['concluded', 'Concluded'],
  ['abandoned', 'Abandoned']
]

function title(node: ExperimentNode): string {
  return typeof node.title === 'string' && node.title ? node.title : 'Untitled experiment'
}

export function ExperimentsView(): JSX.Element {
  const { data, loading } = useQuery(ExperimentSchema, { orderBy: { updatedAt: 'desc' } })
  const { create } = useMutate()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const experiments = (data ?? []) as unknown as ExperimentNode[]
  const selected = selectedId ?? experiments[0]?.id ?? null

  const newExperiment = async () => {
    const node = await create(ExperimentSchema, { title: 'Untitled experiment' })
    if (node?.id) setSelectedId(node.id)
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-60 shrink-0 flex-col border-r border-hairline">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
            <FlaskConical size={13} strokeWidth={1.5} />
            Experiments
          </span>
          <button
            type="button"
            aria-label="New experiment"
            onClick={() => void newExperiment()}
            className="rounded-sm p-1 text-ink-3 hover:bg-accent hover:text-ink-1"
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {loading ? (
            <p className="px-2 text-xs text-ink-3">Loading…</p>
          ) : experiments.length === 0 ? (
            <p className="px-2 py-1 text-xs text-ink-3">
              No experiments yet. Start one to track a hypothesis.
            </p>
          ) : (
            STATUS_GROUPS.map(([status, label]) => {
              const group = experiments.filter(
                (e) => (typeof e.status === 'string' ? e.status : 'design') === status
              )
              if (group.length === 0) return null
              return (
                <div key={status} className="mb-2">
                  <div className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-ink-3">
                    {label}
                  </div>
                  {group.map((exp) => (
                    <button
                      key={exp.id}
                      type="button"
                      onClick={() => setSelectedId(exp.id)}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs transition-colors',
                        exp.id === selected
                          ? 'bg-accent text-ink-1'
                          : 'text-ink-2 hover:bg-accent hover:text-ink-1'
                      )}
                    >
                      <span className="truncate">
                        {typeof exp.icon === 'string' && exp.icon ? `${exp.icon} ` : ''}
                        {title(exp)}
                      </span>
                    </button>
                  ))}
                </div>
              )
            })
          )}
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selected ? (
          <ExperimentDetail key={selected} experimentId={selected} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <FlaskConical size={28} strokeWidth={1} className="text-ink-3" />
            <p className="max-w-xs text-sm text-ink-3">
              An experiment pairs a null hypothesis with the data to test it. Create one to begin.
            </p>
            <button
              type="button"
              onClick={() => void newExperiment()}
              className="flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-1 hover:bg-accent"
            >
              <Plus size={13} strokeWidth={1.5} /> New experiment
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
