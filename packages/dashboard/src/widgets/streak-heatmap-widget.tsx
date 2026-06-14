/**
 * Streak heatmap widget (exploration 0180) — GitHub-style contribution grids
 * for your habits. Observations come from the widget's query; metric
 * definitions (names, schedules, colors) are resolved with useQuery, which
 * first-party widgets may use since they render in the host realm.
 */
import type { WidgetDefinition, WidgetProps } from '../types'
import { MetricSchema } from '@xnetjs/data'
import {
  addDays,
  canonicalDay,
  computeStreak,
  isScheduledOn,
  scheduledDaysInRange,
  type MetricSchedule
} from '@xnetjs/experiments'
import { useQuery } from '@xnetjs/react'
import { HabitHeatmap } from '../components/HabitHeatmap'
import { nodeQuery, stubDescriptor } from './shared'

const OBSERVATION_SCHEMA_IRI = 'xnet://xnet.fyi/Observation@1.0.0'

export interface StreakHeatmapWidgetConfig extends Record<string, unknown> {
  weeks?: number
}

interface MetricRow {
  id: string
  name?: unknown
  color?: unknown
  schedule?: unknown
  scheduleDays?: unknown
  kind?: unknown
}

function scheduleOf(metric: MetricRow): { schedule: MetricSchedule; scheduleDays?: number[] } {
  const schedule = (
    typeof metric.schedule === 'string' ? metric.schedule : 'none'
  ) as MetricSchedule
  const scheduleDays = Array.isArray(metric.scheduleDays)
    ? metric.scheduleDays.filter((d): d is number => typeof d === 'number')
    : undefined
  return { schedule, scheduleDays }
}

function StreakHeatmapWidget({
  config,
  data
}: WidgetProps<StreakHeatmapWidgetConfig>): JSX.Element {
  const weeks = typeof config.weeks === 'number' ? config.weeks : 16
  const { data: metricNodes } = useQuery(MetricSchema)
  const metrics = ((metricNodes ?? []) as unknown as MetricRow[]).filter(
    (m) => scheduleOf(m).schedule !== 'none'
  )
  const today = canonicalDay()

  // Completed days per metric, from this widget's observation rows.
  const completedByMetric = new Map<string, Set<number>>()
  for (const row of data.rows) {
    const metricId = typeof row.metric === 'string' ? row.metric : null
    const day = typeof row.day === 'number' ? canonicalDay(row.day) : null
    const value = typeof row.value === 'number' ? row.value : 0
    if (!metricId || day === null || value < 1) continue
    if (!completedByMetric.has(metricId)) completedByMetric.set(metricId, new Set())
    completedByMetric.get(metricId)!.add(day)
  }

  if (data.loading) {
    return <div className="p-3 text-xs text-muted-foreground">Loading…</div>
  }
  if (metrics.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        No habits yet. Add a recurring metric in the Today panel.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {metrics.map((metric) => {
        const completed = completedByMetric.get(metric.id) ?? new Set<number>()
        const sched = scheduleOf(metric)
        const scheduledDays = scheduledDaysInRange(addDays(today, -400), today, sched)
        const streak = computeStreak(completed, scheduledDays, today)
        const scheduledSet = new Set(
          scheduledDaysInRange(addDays(today, -(weeks * 7)), today, sched).filter((d) =>
            isScheduledOn(d, sched)
          )
        )
        return (
          <div key={metric.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate text-foreground">
                {typeof metric.name === 'string' && metric.name ? metric.name : 'Untitled'}
              </span>
              {streak > 0 && (
                <span className="shrink-0 text-[11px] text-orange-500">🔥 {streak}</span>
              )}
            </div>
            <HabitHeatmap
              completedDays={completed}
              scheduledDays={scheduledSet}
              weeks={weeks}
              color={typeof metric.color === 'string' ? metric.color : undefined}
              today={today}
            />
          </div>
        )
      })}
    </div>
  )
}

export const streakHeatmapWidget: WidgetDefinition<StreakHeatmapWidgetConfig> = {
  type: 'experiments.streak-heatmap',
  name: 'Habit Heatmap',
  icon: 'flame',
  description: 'Contribution-style streak heatmaps for your habits',
  trustTier: 'first-party',
  defaultSize: { w: 4, h: 4, minW: 3, minH: 3 },
  configFields: [{ key: 'weeks', label: 'Weeks shown', type: 'number', defaultValue: 16 }],
  getStubConfig: () => ({
    config: { weeks: 16 },
    query: {
      descriptor: stubDescriptor(
        'Habit Heatmap',
        nodeQuery(OBSERVATION_SCHEMA_IRI, { first: 5000 })
      ),
      refresh: 'live'
    }
  }),
  component: StreakHeatmapWidget
}
