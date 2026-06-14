/**
 * Reactive habit/metric data + the one-tap logging mutations the Today panel
 * uses. Writes go through useMutate so every other open surface (heatmaps,
 * dashboards, the experiment verdict) updates live.
 */
import { MetricSchema, ObservationSchema } from '@xnetjs/data'
import { canonicalDay } from '@xnetjs/experiments'
import { useMutate, useQuery } from '@xnetjs/react'
import { useCallback, useMemo } from 'react'
import {
  habitSummary,
  todaysHabits,
  type HabitSummary,
  type MetricLike,
  type ObservationLike
} from './habit-logic'

const OBSERVATION_WINDOW = 3000

export interface UseHabitsResult {
  metrics: MetricLike[]
  observations: ObservationLike[]
  loading: boolean
  today: number
  /** Habits scheduled for today with their summaries. */
  due: Array<{ metric: MetricLike; summary: HabitSummary }>
  summaryFor: (metric: MetricLike) => HabitSummary
  /** Toggle a boolean habit's completion for today. */
  toggleHabit: (metric: MetricLike, summary: HabitSummary, done: boolean) => Promise<void>
  /** Log a numeric/scale value for today (upserts today's observation). */
  logValue: (metric: MetricLike, value: number) => Promise<void>
  createHabit: (input: {
    name: string
    kind?: string
    schedule?: string
    scheduleDays?: number[]
  }) => Promise<string | null>
}

export function useHabits(): UseHabitsResult {
  const metricsQ = useQuery(MetricSchema, { orderBy: { sortKey: 'asc' } })
  const obsQ = useQuery(ObservationSchema, { orderBy: { day: 'desc' }, limit: OBSERVATION_WINDOW })
  const { create, update, remove } = useMutate()

  const metrics = (metricsQ.data ?? []) as unknown as MetricLike[]
  const observations = useMemo(
    () => (obsQ.data ?? []) as unknown as ObservationLike[],
    [obsQ.data]
  )
  const today = canonicalDay()

  const toggleHabit = useCallback(
    async (metric: MetricLike, summary: HabitSummary, done: boolean) => {
      const existing = summary.byDay.get(today)
      if (done) {
        if (existing) {
          await update(ObservationSchema, existing.id, { value: 1 })
        } else {
          await create(ObservationSchema, {
            metric: metric.id,
            day: today,
            value: 1,
            phase: 'none',
            source: 'manual'
          })
        }
      } else if (existing) {
        await remove(existing.id)
      }
    },
    [create, update, remove, today]
  )

  const logValue = useCallback(
    async (metric: MetricLike, value: number) => {
      const existing = observations.find(
        (o) => o.metric === metric.id && typeof o.day === 'number' && canonicalDay(o.day) === today
      )
      if (existing) {
        await update(ObservationSchema, existing.id, { value })
      } else {
        await create(ObservationSchema, {
          metric: metric.id,
          day: today,
          value,
          phase: 'none',
          source: 'manual'
        })
      }
    },
    [create, update, observations, today]
  )

  const createHabit = useCallback<UseHabitsResult['createHabit']>(
    async (input) => {
      const node = await create(MetricSchema, {
        name: input.name,
        kind: (input.kind ?? 'boolean') as 'boolean',
        schedule: (input.schedule ?? 'daily') as 'daily',
        ...(input.scheduleDays ? { scheduleDays: input.scheduleDays } : {})
      })
      return node?.id ?? null
    },
    [create]
  )

  return {
    metrics,
    observations,
    loading: metricsQ.loading || obsQ.loading,
    today,
    due: todaysHabits(metrics, observations, today),
    summaryFor: (metric) => habitSummary(metric, observations, today),
    toggleHabit,
    logValue,
    createHabit
  }
}
