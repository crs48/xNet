/**
 * Metric editor (exploration 0180, phase 5) — configure any metric kind, not
 * just the daily boolean habit the quick-add mints. Fields write through live
 * (consistent with the experiment detail), so the modal is just a focused view
 * onto the Metric node.
 */
import type { JSX } from 'react'
import { MetricSchema } from '@xnetjs/data'
import { useNode } from '@xnetjs/react'
import { Modal, cn } from '@xnetjs/ui'
import { Trash2 } from 'lucide-react'
import { metricName, type MetricLike } from './habit-logic'

const KIND_OPTIONS = [
  ['boolean', 'Yes / No (habit)'],
  ['count', 'Count'],
  ['duration', 'Duration'],
  ['scale', 'Scale (e.g. mood 1–5)'],
  ['number', 'Number']
] as const

const SCHEDULE_OPTIONS = [
  ['none', 'No schedule (track anytime)'],
  ['daily', 'Daily'],
  ['weekly', 'Weekly'],
  ['specificDays', 'Specific days']
] as const

const POLARITY_OPTIONS = [
  ['higherBetter', 'Higher is better'],
  ['lowerBetter', 'Lower is better'],
  ['neutral', 'Neutral']
] as const

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const fieldCls =
  'w-full rounded-md border border-hairline bg-transparent px-2 py-1.5 text-sm text-ink-1 outline-none focus:border-ink-3'

function Label({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="text-[10px] font-medium uppercase tracking-wider text-ink-3">{children}</span>
  )
}

export interface MetricEditorProps {
  metricId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

export function MetricEditor({
  metricId,
  open,
  onOpenChange,
  onDeleted
}: MetricEditorProps): JSX.Element {
  const { data, update, remove } = useNode(MetricSchema, metricId)
  const metric = (data ?? { id: metricId }) as unknown as MetricLike

  const kind = typeof metric.kind === 'string' ? metric.kind : 'boolean'
  const schedule = typeof metric.schedule === 'string' ? metric.schedule : 'none'
  const scheduleDays = Array.isArray(metric.scheduleDays) ? (metric.scheduleDays as number[]) : []

  const toggleDay = (d: number) => {
    const next = scheduleDays.includes(d)
      ? scheduleDays.filter((x) => x !== d)
      : [...scheduleDays, d].sort((a, b) => a - b)
    void update({ scheduleDays: next })
  }

  const numberOr = (v: unknown): string =>
    typeof v === 'number' && Number.isFinite(v) ? String(v) : ''

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit metric" size="md">
      <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
        <label className="flex flex-col gap-1">
          <Label>Name</Label>
          <input
            value={typeof metric.name === 'string' ? metric.name : ''}
            onChange={(e) => void update({ name: e.target.value })}
            placeholder="e.g. Meditate, Mood, Sleep latency"
            className={fieldCls}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <Label>Icon (emoji)</Label>
            <input
              value={typeof metric.icon === 'string' ? metric.icon : ''}
              onChange={(e) => void update({ icon: e.target.value })}
              placeholder="🧘"
              className={fieldCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <Label>Color</Label>
            <input
              type="color"
              value={typeof metric.color === 'string' && metric.color ? metric.color : '#6366f1'}
              onChange={(e) => void update({ color: e.target.value })}
              className="h-9 w-full rounded-md border border-hairline bg-transparent"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <Label>Kind</Label>
          <select
            value={kind}
            onChange={(e) => void update({ kind: e.target.value as 'boolean' })}
            className={fieldCls}
          >
            {KIND_OPTIONS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {kind !== 'boolean' && (
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <Label>Unit</Label>
              <input
                value={typeof metric.unit === 'string' ? metric.unit : ''}
                onChange={(e) => void update({ unit: e.target.value })}
                placeholder="min, pages…"
                className={fieldCls}
              />
            </label>
            {kind === 'scale' && (
              <>
                <label className="flex flex-col gap-1">
                  <Label>Scale min</Label>
                  <input
                    type="number"
                    value={numberOr(metric.scaleMin)}
                    onChange={(e) => void update({ scaleMin: Number(e.target.value) })}
                    className={fieldCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <Label>Scale max</Label>
                  <input
                    type="number"
                    value={numberOr(metric.scaleMax)}
                    onChange={(e) => void update({ scaleMax: Number(e.target.value) })}
                    className={fieldCls}
                  />
                </label>
              </>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <Label>Schedule</Label>
          <select
            value={schedule}
            onChange={(e) => void update({ schedule: e.target.value as 'none' })}
            className={fieldCls}
          >
            {SCHEDULE_OPTIONS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {(schedule === 'specificDays' || schedule === 'weekly') && (
          <div className="flex flex-col gap-1">
            <Label>{schedule === 'weekly' ? 'Anchor day' : 'Days'}</Label>
            <div className="flex gap-1">
              {WEEKDAYS.map((label, d) => {
                const active =
                  schedule === 'weekly' ? (scheduleDays[0] ?? 1) === d : scheduleDays.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      schedule === 'weekly' ? void update({ scheduleDays: [d] }) : toggleDay(d)
                    }
                    className={cn(
                      'flex-1 rounded-md border px-1 py-1 text-[11px] transition-colors',
                      active
                        ? 'border-transparent bg-[var(--primary,#6366f1)] text-white'
                        : 'border-hairline text-ink-2 hover:bg-accent'
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <Label>Better direction</Label>
            <select
              value={typeof metric.polarity === 'string' ? metric.polarity : 'higherBetter'}
              onChange={(e) => void update({ polarity: e.target.value as 'higherBetter' })}
              className={fieldCls}
            >
              {POLARITY_OPTIONS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <Label>Target (optional)</Label>
            <input
              type="number"
              value={numberOr(metric.target)}
              onChange={(e) =>
                void update({ target: e.target.value === '' ? undefined : Number(e.target.value) })
              }
              className={fieldCls}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <Label>Cue — “after I ___, I will ___” (optional)</Label>
          <input
            value={typeof metric.cue === 'string' ? metric.cue : ''}
            onChange={(e) => void update({ cue: e.target.value })}
            placeholder="After I pour my morning coffee, I will meditate"
            className={fieldCls}
          />
        </label>

        <div className="mt-1 flex items-center justify-between border-t border-hairline pt-3">
          <button
            type="button"
            onClick={() => {
              void remove()
              onOpenChange(false)
              onDeleted?.()
            }}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
          >
            <Trash2 size={13} strokeWidth={1.5} /> Delete {metricName(metric)}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-1 hover:bg-accent"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
