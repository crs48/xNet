/**
 * Today check-in panel (exploration 0180) — the friction-free heart of the
 * habit tracker. Lists habits/metrics due today (one tap to log a boolean, or
 * a value control for numeric/scale/mood metrics) plus a "track anytime"
 * section for continuous metrics, and an editor for configuring any metric.
 */
import { Link } from '@tanstack/react-router'
import { cn } from '@xnetjs/ui'
import { ArrowUpRight, Check, Flame, FlaskConical, Pencil, Plus, StickyNote } from 'lucide-react'
import { useState, type JSX } from 'react'
import {
  isHabit,
  metricName,
  type HabitSummary,
  type MetricLike
} from '../../components/experiments/habit-logic'
import { MetricEditor } from '../../components/experiments/MetricEditor'
import { useHabits } from '../../components/experiments/useHabits'

function metricKindOf(metric: MetricLike): string {
  return typeof metric.kind === 'string' ? metric.kind : 'boolean'
}

function StrengthBar({ value }: { value: number }): JSX.Element {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-accent">
      <div
        className="h-full rounded-full bg-[var(--primary,#6366f1)] transition-[width] duration-slow"
        style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
      />
    </div>
  )
}

/** The kind-specific logging control for a metric's value today. */
function ValueControl({
  metric,
  summary,
  today,
  onToggle,
  onLog
}: {
  metric: MetricLike
  summary: HabitSummary
  today: number
  onToggle: (done: boolean) => void
  onLog: (value: number) => void
}): JSX.Element {
  const kind = metricKindOf(metric)
  const color = typeof metric.color === 'string' ? metric.color : undefined
  const todayObs = summary.byDay.get(today)
  const todayValue = typeof todayObs?.value === 'number' ? todayObs.value : null

  if (kind === 'boolean') {
    return (
      <button
        type="button"
        aria-pressed={summary.done}
        aria-label={
          summary.done ? `Mark ${metricName(metric)} not done` : `Mark ${metricName(metric)} done`
        }
        onClick={() => onToggle(!summary.done)}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors',
          summary.done
            ? 'border-transparent bg-[var(--primary,#6366f1)] text-white'
            : 'border-hairline text-transparent hover:border-ink-3'
        )}
        style={summary.done && color ? { backgroundColor: color } : undefined}
      >
        <Check size={13} strokeWidth={3} />
      </button>
    )
  }

  if (kind === 'scale') {
    const min = typeof metric.scaleMin === 'number' ? metric.scaleMin : 1
    const max = typeof metric.scaleMax === 'number' ? metric.scaleMax : 5
    const steps = []
    for (let v = min; v <= max && steps.length < 10; v++) steps.push(v)
    return (
      <div className="flex gap-0.5">
        {steps.map((v) => (
          <button
            key={v}
            type="button"
            aria-label={`Log ${metricName(metric)} = ${v}`}
            onClick={() => onLog(v)}
            className={cn(
              'h-5 w-5 rounded-[5px] border text-[10px] tabular-nums transition-colors',
              todayValue === v
                ? 'border-transparent bg-[var(--primary,#6366f1)] text-white'
                : 'border-hairline text-ink-2 hover:bg-accent'
            )}
          >
            {v}
          </button>
        ))}
      </div>
    )
  }

  // count / duration / number → inline number input
  return (
    <input
      type="number"
      defaultValue={todayValue ?? ''}
      aria-label={`Log ${metricName(metric)}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onLog(Number((e.target as HTMLInputElement).value))
      }}
      onBlur={(e) => {
        if (e.target.value !== '') onLog(Number(e.target.value))
      }}
      placeholder={typeof metric.unit === 'string' ? metric.unit : '0'}
      className="h-6 w-16 rounded-md border border-hairline bg-transparent px-1.5 text-right text-xs tabular-nums text-ink-1 outline-none focus:border-ink-3"
    />
  )
}

function MetricRow({
  metric,
  summary,
  today,
  onToggle,
  onLog,
  onNote,
  onEdit
}: {
  metric: MetricLike
  summary: HabitSummary
  today: number
  onToggle: (done: boolean) => void
  onLog: (value: number) => void
  onNote: (note: string) => void
  onEdit: () => void
}): JSX.Element {
  const habit = isHabit(metric)
  const todayObs = summary.byDay.get(today)
  const currentNote = typeof todayObs?.note === 'string' ? todayObs.note : ''
  const [noteOpen, setNoteOpen] = useState(currentNote !== '')
  return (
    <div className="group rounded-sm px-2 py-1.5 hover:bg-accent">
      <div className="flex items-center gap-2">
        <ValueControl
          metric={metric}
          summary={summary}
          today={today}
          onToggle={onToggle}
          onLog={onLog}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn('truncate text-xs', summary.done ? 'text-ink-2' : 'text-ink-1')}>
              {typeof metric.icon === 'string' && metric.icon ? `${metric.icon} ` : ''}
              {metricName(metric)}
            </span>
            {habit && summary.streak > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-orange-500">
                <Flame size={10} strokeWidth={2} />
                {summary.streak}
              </span>
            )}
            <button
              type="button"
              aria-label={`Note for ${metricName(metric)}`}
              aria-pressed={noteOpen}
              onClick={() => setNoteOpen((v) => !v)}
              className={cn(
                'ml-auto shrink-0 transition-opacity hover:text-ink-1',
                currentNote || noteOpen
                  ? 'text-ink-2 opacity-100'
                  : 'text-ink-3 opacity-0 group-hover:opacity-100'
              )}
            >
              <StickyNote size={11} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label={`Edit ${metricName(metric)}`}
              onClick={onEdit}
              className="shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-ink-1 group-hover:opacity-100"
            >
              <Pencil size={11} strokeWidth={1.5} />
            </button>
          </div>
          {habit && (
            <div className="mt-1">
              <StrengthBar value={summary.strength} />
            </div>
          )}
        </div>
      </div>
      {noteOpen && (
        <input
          type="text"
          defaultValue={currentNote}
          aria-label={`Note for ${metricName(metric)} today`}
          placeholder="Add a note for today…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          onBlur={(e) => {
            if (e.target.value !== currentNote) onNote(e.target.value)
          }}
          className="mt-1.5 w-full rounded-sm border border-hairline bg-transparent px-2 py-1 text-[11px] text-ink-1 outline-none focus:border-ink-3"
        />
      )}
    </div>
  )
}

function QuickAdd({ onAdd }: { onAdd: (name: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-ink-3 transition-colors hover:bg-accent hover:text-ink-1"
      >
        <Plus size={13} strokeWidth={1.5} />
        New habit
      </button>
    )
  }
  const commit = () => {
    const trimmed = name.trim()
    if (trimmed) onAdd(trimmed)
    setName('')
    setOpen(false)
  }
  return (
    <div className="px-2 py-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setOpen(false)
        }}
        onBlur={commit}
        placeholder="Habit name, e.g. Meditate"
        className="w-full rounded-sm border border-hairline bg-transparent px-2 py-1 text-xs text-ink-1 outline-none focus:border-ink-3"
      />
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-ink-3">
      {children}
    </div>
  )
}

export function TodayPanel(): JSX.Element {
  const {
    metrics,
    due,
    loading,
    today,
    summaryFor,
    toggleHabit,
    logValue,
    setNote,
    createHabit,
    createMetric
  } = useHabits()
  const [editingId, setEditingId] = useState<string | null>(null)

  const dueIds = new Set(due.map((d) => d.metric.id))
  // Everything not already shown under "Due today": other habits + continuous metrics.
  const tracked = metrics.filter((m) => !dueIds.has(m.id))

  const openNewMetric = async () => {
    const id = await createMetric()
    if (id) setEditingId(id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <SectionLabel>Due today</SectionLabel>
        {loading ? (
          <p className="px-2 text-xs text-ink-3">Loading…</p>
        ) : due.length === 0 ? (
          <p className="px-2 py-1 text-xs text-ink-3">
            Nothing scheduled. Add a habit to start a streak.
          </p>
        ) : (
          <div className="flex flex-col">
            {due.map(({ metric, summary }) => (
              <MetricRow
                key={metric.id}
                metric={metric}
                summary={summary}
                today={today}
                onToggle={(done) => void toggleHabit(metric, summary, done)}
                onLog={(value) => void logValue(metric, value)}
                onNote={(note) => void setNote(metric, note)}
                onEdit={() => setEditingId(metric.id)}
              />
            ))}
          </div>
        )}

        {tracked.length > 0 && (
          <>
            <SectionLabel>Track anytime</SectionLabel>
            <div className="flex flex-col">
              {tracked.map((metric) => {
                const summary = summaryFor(metric)
                return (
                  <MetricRow
                    key={metric.id}
                    metric={metric}
                    summary={summary}
                    today={today}
                    onToggle={(done) => void toggleHabit(metric, summary, done)}
                    onLog={(value) => void logValue(metric, value)}
                    onNote={(note) => void setNote(metric, note)}
                    onEdit={() => setEditingId(metric.id)}
                  />
                )
              })}
            </div>
          </>
        )}

        <div className="mt-1 flex flex-col border-t border-hairline pt-1">
          <QuickAdd onAdd={(name) => void createHabit({ name })} />
          <button
            type="button"
            onClick={() => void openNewMetric()}
            className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-ink-3 transition-colors hover:bg-accent hover:text-ink-1"
          >
            <Plus size={13} strokeWidth={1.5} />
            New metric…
          </button>
        </div>
      </div>

      <div className="shrink-0 border-t border-hairline p-2">
        <Link
          to="/experiments"
          className="flex items-center gap-1.5 px-1 text-xs text-ink-2 no-underline transition-colors hover:text-ink-1 hover:no-underline"
        >
          <FlaskConical size={11} strokeWidth={1.5} />
          Experiments
          <ArrowUpRight size={11} strokeWidth={1.5} className="ml-auto" />
        </Link>
      </div>

      {editingId && (
        <MetricEditor
          metricId={editingId}
          open={editingId !== null}
          onOpenChange={(open) => !open && setEditingId(null)}
          onDeleted={() => setEditingId(null)}
        />
      )}
    </div>
  )
}
