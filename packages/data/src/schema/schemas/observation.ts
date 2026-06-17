/**
 * ObservationSchema - a single datapoint for a Metric (exploration 0180).
 *
 * The universal log entry: a habit check-in, a mood rating, a sleep-latency
 * reading, and an experiment outcome are all Observations of some Metric. One
 * node per datapoint — the same one-node-per-record pattern ChatMessage uses —
 * so observations are individually queryable, indexable, and calendar-bindable.
 *
 * `phase` is denormalized from the owning experiment's *active* phase at entry
 * time, so the verdict engine can group by phase with no join-walking.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, number, select, json, date, relation } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const ObservationSchema = defineSchema({
  name: 'Observation',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** The metric this datapoint measures. */
    metric: relation({ target: 'xnet://xnet.fyi/Metric@1.0.0' as const, required: true }),

    /**
     * Canonical day — UTC midnight ms of the calendar day (see
     * @xnetjs/experiments `canonicalDay`). One observation per day per metric is
     * the norm; using `date()` gives date-aware filters + calendar binding.
     */
    day: date({ required: true }),

    /** Measured value. Booleans encode 1 (done) / 0 (not). */
    value: number({ required: true }),

    /** Free-text note for the datapoint (qualitative context). */
    note: text({ maxLength: 2000 }),

    /** Stamped from the experiment's active phase at entry time. */
    phase: select({
      options: [
        { id: 'none', name: 'None' },
        { id: 'baseline', name: 'Baseline' },
        { id: 'intervention', name: 'Intervention' },
        { id: 'washout', name: 'Washout' }
      ] as const,
      default: 'none'
    }),

    /** Where the value came from. */
    source: select({
      options: [
        { id: 'manual', name: 'Manual' },
        { id: 'sensor', name: 'Sensor' },
        { id: 'import', name: 'Import' }
      ] as const,
      default: 'manual'
    }),

    /** Confounds logged for the day, e.g. ["alcohol","poor sleep"]. */
    confounds: json({}),

    /** Denormalized owning experiment (for fast per-experiment queries). */
    experiment: relation({ target: 'xnet://xnet.fyi/Experiment@1.0.0' as const }),

    /** Canonical SECURITY home; empty = personal/private (exploration 0179). */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /** Per-node visibility. Defaults to `private` (sensitive data, 0180). */
    visibility: select({
      options: [
        { id: 'inherit', name: 'Inherit', color: 'gray' },
        { id: 'private', name: 'Private', color: 'gray' },
        { id: 'unlisted', name: 'Unlisted', color: 'yellow' },
        { id: 'public', name: 'Public', color: 'green' }
      ] as const,
      default: 'private'
    })
  },
  // Inherits access from its home Space (exploration 0181/0192).
  authorization: spaceCascadeAuthorization()
})

/** An Observation node type (inferred from schema). */
export type Observation = InferNode<(typeof ObservationSchema)['_properties']>

export type ObservationPhase = 'none' | 'baseline' | 'intervention' | 'washout'
