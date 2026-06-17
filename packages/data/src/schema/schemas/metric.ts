/**
 * MetricSchema - a tracked variable for the experiment journal + habit tracker
 * (exploration 0180).
 *
 * A Metric is the *definition* of something you measure: a mood scale, a sleep
 * latency in minutes, or a yes/no habit. Individual datapoints are Observation
 * nodes. A Metric becomes a **habit** when it carries a recurring `schedule`;
 * a Metric with `schedule: 'none'` is an ad-hoc / continuously tracked variable
 * (mood, weight) that any number of experiments can reference.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, number, select, json, relation } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const MetricSchema = defineSchema({
  name: 'Metric',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Display name, e.g. "Meditate" or "Sleep latency". */
    name: text({ required: true, maxLength: 200 }),

    /** Emoji or icon URL. */
    icon: text({ maxLength: 500 }),

    /** Accent color for streak chips / charts. */
    color: text({ maxLength: 40 }),

    /**
     * What kind of value an Observation carries — drives both logging UI and
     * aggregation. `boolean` is the classic habit check-in (value 0/1);
     * `scale` is a bounded rating (mood 1–5); the rest are free numerics.
     */
    kind: select({
      options: [
        { id: 'boolean', name: 'Yes / No' },
        { id: 'count', name: 'Count' },
        { id: 'duration', name: 'Duration' },
        { id: 'scale', name: 'Scale' },
        { id: 'number', name: 'Number' }
      ] as const,
      default: 'boolean'
    }),

    /** Unit label for numeric kinds, e.g. "min", "pages", "glasses". */
    unit: text({ maxLength: 40 }),

    /** Lower bound for `scale` kind (e.g. 1). */
    scaleMin: number({}),

    /** Upper bound for `scale` kind (e.g. 5). */
    scaleMax: number({}),

    /**
     * A recurring schedule makes this Metric a habit. `none` = ad-hoc /
     * continuous (no streak, no "miss").
     */
    schedule: select({
      options: [
        { id: 'none', name: 'No schedule' },
        { id: 'daily', name: 'Daily' },
        { id: 'weekly', name: 'Weekly' },
        { id: 'specificDays', name: 'Specific days' }
      ] as const,
      default: 'none'
    }),

    /** Weekdays (0 = Sun … 6 = Sat) for `specificDays`, or anchor for `weekly`. */
    scheduleDays: json({}),

    /** Which direction counts as improvement, for the verdict engine. */
    polarity: select({
      options: [
        { id: 'higherBetter', name: 'Higher is better' },
        { id: 'lowerBetter', name: 'Lower is better' },
        { id: 'neutral', name: 'Neutral' }
      ] as const,
      default: 'higherBetter'
    }),

    /** Optional target value (e.g. "50 pushups", "≥ 7 h sleep"). */
    target: number({}),

    /**
     * Implementation intention — "after I pour my morning coffee, I will…".
     * A written cue roughly doubles follow-through (Gollwitzer, 1999).
     */
    cue: text({ maxLength: 280 }),

    /**
     * Optional owning experiment. A Metric can be standalone (mood, sleep) and
     * referenced by many experiments, so this is not required.
     */
    experiment: relation({ target: 'xnet://xnet.fyi/Experiment@1.0.0' as const }),

    /** Canonical home; empty = Unfiled (exploration 0169). */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

    /** Order among siblings — fractional index. */
    sortKey: text({ maxLength: 500 }),

    /** Workspace-wide labels, referenced by id (exploration 0169). */
    tags: relation({ target: 'xnet://xnet.fyi/Tag@1.0.0' as const, multiple: true }),

    /** Canonical SECURITY home; empty = personal/private (exploration 0179). */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /**
     * Per-node visibility. Defaults to `private` — mood/health/habit data is
     * sensitive and must never leak to public surfaces by accident (0180).
     */
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

/** A Metric node type (inferred from schema). */
export type Metric = InferNode<(typeof MetricSchema)['_properties']>

export type MetricKind = 'boolean' | 'count' | 'duration' | 'scale' | 'number'
export type MetricScheduleId = 'none' | 'daily' | 'weekly' | 'specificDays'
export type MetricPolarity = 'higherBetter' | 'lowerBetter' | 'neutral'
