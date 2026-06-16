/**
 * Project header + milestone management (exploration 0190). Milestones had no
 * UI anywhere; Projects had no detail view. When the Tasks surface is scoped to
 * a project, this header surfaces the project's status/target date, a full-field
 * inspector, and inline milestone CRUD (the Linear-style project → milestones
 * grouping).
 */
import { MilestoneSchema, ProjectSchema } from '@xnetjs/data'
import { useMutate, useNode, useQuery } from '@xnetjs/react'
import { Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useState, type JSX } from 'react'
import { NodePeek } from './NodeInspector'

const PROJECT_STATUS = [
  ['planned', 'Planned'],
  ['in-progress', 'In Progress'],
  ['paused', 'Paused'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled']
] as const

const MILESTONE_STATUS = [
  ['upcoming', 'Upcoming'],
  ['active', 'Active'],
  ['done', 'Done'],
  ['cancelled', 'Cancelled']
] as const

const msToIso = (v: unknown): string => {
  if (typeof v !== 'number' || v <= 0) return ''
  const d = new Date(v)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
const isoToMs = (iso: string): number | undefined =>
  iso
    ? Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
    : undefined

const ctrlCls =
  'rounded-sm border border-hairline bg-surface-1 px-1.5 py-0.5 text-[11px] text-ink-2 outline-none'

interface MilestoneRow {
  id: string
  name?: unknown
  status?: unknown
  targetDate?: unknown
  project?: unknown
}

export function ProjectHeader({ projectId }: { projectId: string }): JSX.Element {
  const { data: project, update } = useNode(ProjectSchema, projectId)
  const { data: milestoneData } = useQuery(MilestoneSchema, {})
  const { create, update: mutateUpdate, remove } = useMutate()
  const [allFieldsOpen, setAllFieldsOpen] = useState(false)

  const milestones = ((milestoneData ?? []) as MilestoneRow[]).filter(
    (m) => typeof m.project === 'string' && m.project === projectId
  )

  const status = typeof project?.status === 'string' ? project.status : 'planned'
  const targetDate = project?.targetDate

  return (
    <div className="border-b border-hairline bg-surface-0 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1 text-ink-3">
          Status
          <select
            aria-label="Project status"
            value={status}
            onChange={(e) => void update({ status: e.target.value as 'planned' })}
            className={ctrlCls}
          >
            {PROJECT_STATUS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-ink-3">
          Target
          <input
            type="date"
            aria-label="Project target date"
            value={msToIso(targetDate)}
            onChange={(e) => void update({ targetDate: isoToMs(e.target.value) })}
            className={ctrlCls}
          />
        </label>
        <button
          type="button"
          onClick={() => setAllFieldsOpen(true)}
          className="flex items-center gap-1 rounded-md border border-hairline px-2 py-0.5 text-[11px] text-ink-2 hover:bg-accent hover:text-ink-1"
        >
          <SlidersHorizontal size={11} strokeWidth={1.5} /> All fields
        </button>
      </div>

      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-3">Milestones</span>
          <button
            type="button"
            onClick={() =>
              void create(MilestoneSchema, { name: 'New milestone', project: projectId })
            }
            className="flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink-1"
          >
            <Plus size={11} strokeWidth={1.5} /> New milestone
          </button>
        </div>
        {milestones.length === 0 ? (
          <p className="text-[11px] text-ink-3">No milestones yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {milestones.map((m) => (
              <li key={m.id} className="group flex items-center gap-2">
                <input
                  defaultValue={typeof m.name === 'string' ? m.name : ''}
                  onBlur={(e) => void mutateUpdate(MilestoneSchema, m.id, { name: e.target.value })}
                  className="min-w-0 flex-1 border-none bg-transparent text-xs text-ink-1 outline-none"
                />
                <input
                  type="date"
                  aria-label="Milestone target date"
                  defaultValue={msToIso(m.targetDate)}
                  onBlur={(e) =>
                    void mutateUpdate(MilestoneSchema, m.id, {
                      targetDate: isoToMs(e.target.value)
                    })
                  }
                  className={ctrlCls}
                />
                <select
                  aria-label="Milestone status"
                  value={typeof m.status === 'string' ? m.status : 'upcoming'}
                  onChange={(e) =>
                    void mutateUpdate(MilestoneSchema, m.id, {
                      status: e.target.value as 'upcoming'
                    })
                  }
                  className={ctrlCls}
                >
                  {MILESTONE_STATUS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Delete milestone"
                  onClick={() => void remove(m.id)}
                  className="text-ink-3 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NodePeek
        schema={ProjectSchema}
        nodeId={projectId}
        open={allFieldsOpen}
        onClose={() => setAllFieldsOpen(false)}
        formOptions={{ highlights: ['name', 'status', 'lead', 'targetDate'] }}
      />
    </div>
  )
}
