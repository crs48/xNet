/**
 * Metrics seeder — Metrics with a trail of Observations, plus one Experiment
 * linking a primary Metric. Observation volume scales with the scale knob.
 */

import { ExperimentSchema, MetricSchema, ObservationSchema } from '@xnetjs/data'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import type { SeederModule } from '../types'
import { int, METRIC_DEFS, seedId } from '../seed-ids'

const DAY = 86_400_000
const BASE_TS = 1_750_000_000_000

export const metricId = (slug: string): string => seedId('metric', slug)

export const metricsSeeder: SeederModule = {
  domain: 'metrics',
  label: 'Metrics & experiments',
  schemaIds: [MetricSchema._schemaId, ObservationSchema._schemaId, ExperimentSchema._schemaId],
  seed: ({ space, scale, rng }) => {
    const drafts: DeterministicNodeImportDraft[] = []

    METRIC_DEFS.forEach((m) => {
      const slug = m.name
      const metric = metricId(slug)
      drafts.push({
        id: metric,
        schemaId: MetricSchema._schemaId,
        properties: {
          name: m.name,
          icon: m.icon,
          kind: m.kind,
          unit: m.unit,
          polarity: m.polarity,
          schedule: 'daily',
          space
        }
      })

      for (let i = 0; i < scale.observationsPerMetric; i++) {
        const value =
          m.kind === 'boolean'
            ? rng() < 0.7
              ? 1
              : 0
            : m.kind === 'scale'
              ? int(rng, 1, 5)
              : int(rng, 1, 100)
        drafts.push({
          id: seedId('observation', slug, i),
          schemaId: ObservationSchema._schemaId,
          properties: {
            metric,
            day: BASE_TS - i * DAY,
            value,
            source: 'manual',
            phase: 'none',
            space
          }
        })
      }
    })

    // One experiment referencing the first metric.
    drafts.push({
      id: seedId('experiment', 'latency'),
      schemaId: ExperimentSchema._schemaId,
      properties: {
        title: 'Reduce p95 latency',
        icon: '🧪',
        status: 'intervention',
        design: 'AB',
        primaryMetric: metricId('p95 latency'),
        startDate: BASE_TS - 30 * DAY,
        space
      }
    })

    return { drafts }
  }
}
