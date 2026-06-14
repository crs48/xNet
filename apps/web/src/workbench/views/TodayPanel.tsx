/**
 * Today check-in panel (exploration 0180) — the friction-free heart of the
 * habit tracker. Lists every habit due today; one tap logs an Observation and
 * the streak/strength update live. Lives in the left panel beside Tasks.
 */
import { Link } from '@tanstack/react-router'
import { cn } from '@xnetjs/ui'
import { ArrowUpRight, Check, Flame, FlaskConical, Plus } from 'lucide-react'
import { useState, type JSX } from 'react'
import {
  metricName,
  type HabitSummary,
  type MetricLike
} from '../../components/experiments/habit-logic'
import { useHabits } from '../../components/experiments/useHabits'

function StrengthBar({ value }: { value: number }): JSX.Element {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-accent">
      <div
        className="h-full rounded-full bg-[var(--primary,#6366f1)] transition-all"
        style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
      />
    </div>
  )
}

function HabitRow({
  metric,
  summary,
  onToggle
}: {
  metric: MetricLike
  summary: HabitSummary
  onToggle: (done: boolean) => void
}): JSX.Element {
  const color = typeof metric.color === 'string' ? metric.color : undefined
  return (
    <div className="group flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent">
      <button
        type="button"
        aria-pressed={summary.done}
        aria-label={summary.done ? `Mark ${metricName(metric)} not done` : `Mark ${metricName(metric)} done`}
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
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn('truncate text-xs', summary.done ? 'text-ink-2' : 'text-ink-1')}>
            {typeof metric.icon === 'string' && metric.icon ? `${metric.icon} ` : ''}
            {metricName(metric)}
          </span>
          {summary.streak > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] text-orange-500">
              <Flame size={10} strokeWidth={2} />
              {summary.streak}
            </span>
          )}
        </div>
        <div className="mt-1">
          <StrengthBar value={summary.strength} />
        </div>
      </div>
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
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
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

export function TodayPanel(): JSX.Element {
  const { due, loading, toggleHabit, createHabit } = useHabits()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-ink-3">
          Due today
        </div>
        {loading ? (
          <p className="px-2 text-xs text-ink-3">Loading…</p>
        ) : due.length === 0 ? (
          <p className="px-2 py-1 text-xs text-ink-3">
            Nothing scheduled. Add a habit to start a streak.
          </p>
        ) : (
          <div className="flex flex-col">
            {due.map(({ metric, summary }) => (
              <HabitRow
                key={metric.id}
                metric={metric}
                summary={summary}
                onToggle={(done) => void toggleHabit(metric, summary, done)}
              />
            ))}
          </div>
        )}
        <div className="mt-1 border-t border-hairline pt-1">
          <QuickAdd onAdd={(name) => void createHabit({ name })} />
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
    </div>
  )
}
