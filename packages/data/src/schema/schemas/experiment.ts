/**
 * ExperimentSchema - a personal scientific experiment (exploration 0180).
 *
 * Mirrors Project (a thin set of typed fields + a collaborative Yjs document
 * for the protocol / journal narrative) and adds the rigor scaffolding: an
 * explicit null AND alternative hypothesis, a single-case design, a phase
 * timeline, and a recorded conclusion. The same Observations that power habit
 * streaks power an experiment's verdict — an experiment is a hypothesis +
 * phases layered over a Metric's datapoints.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, select, json, date, relation } from '../properties'

export const ExperimentSchema = defineSchema({
  name: 'Experiment',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Experiment title. */
    title: text({ required: true, maxLength: 300 }),

    /** Emoji or icon URL. */
    icon: text({ maxLength: 500 }),

    /**
     * The null hypothesis — what you're trying to reject, stated up front so
     * the verdict can be framed against it (e.g. "Magnesium has no effect on
     * sleep latency").
     */
    hypothesisNull: text({ maxLength: 1000 }),

    /** The alternative hypothesis — the effect you expect if the null is wrong. */
    hypothesisAlt: text({ maxLength: 1000 }),

    /** Lifecycle status. */
    status: select({
      options: [
        { id: 'design', name: 'Design', color: 'gray' },
        { id: 'baseline', name: 'Baseline', color: 'blue' },
        { id: 'intervention', name: 'Intervention', color: 'purple' },
        { id: 'washout', name: 'Washout', color: 'yellow' },
        { id: 'analysis', name: 'Analysis', color: 'orange' },
        { id: 'concluded', name: 'Concluded', color: 'green' },
        { id: 'abandoned', name: 'Abandoned', color: 'red' }
      ] as const,
      default: 'design'
    }),

    /** Single-case experimental design (Kazdin). */
    design: select({
      options: [
        { id: 'observational', name: 'Observational' },
        { id: 'AB', name: 'AB (baseline → intervention)' },
        { id: 'ABAB', name: 'ABAB (reversal)' },
        { id: 'multipleBaseline', name: 'Multiple baseline' },
        { id: 'crossover', name: 'Crossover' },
        { id: 'alternating', name: 'Alternating treatments' }
      ] as const,
      default: 'AB'
    }),

    /** Primary outcome — the one metric locked before the intervention starts. */
    primaryMetric: relation({ target: 'xnet://xnet.fyi/Metric@1.0.0' as const }),

    /**
     * Phase timeline: [{ label, start, end, isIntervention }]. Whole-value LWW
     * json (like DatabaseView.filters); the phase a datapoint falls in is
     * denormalized onto each Observation, so analysis never walks this list.
     */
    phases: json({}),

    /** Recorded outcome — empty until concluded. Never "proven". */
    conclusion: select({
      options: [
        { id: 'rejectsNull', name: 'Rejects the null', color: 'green' },
        { id: 'failsToRejectNull', name: 'Fails to reject the null', color: 'gray' },
        { id: 'inconclusive', name: 'Inconclusive', color: 'yellow' }
      ] as const
    }),

    /** When the experiment began. */
    startDate: date({}),

    /** When the experiment ended. */
    endDate: date({}),

    /** Canonical home; empty = Unfiled (exploration 0169). */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

    /** Order among folder siblings — fractional index. */
    sortKey: text({ maxLength: 500 }),

    /** Workspace-wide labels, referenced by id (exploration 0169). */
    tags: relation({ target: 'xnet://xnet.fyi/Tag@1.0.0' as const, multiple: true }),

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
  document: 'yjs' // Collaborative protocol / journal / observations narrative
})

/** An Experiment node type (inferred from schema). */
export type Experiment = InferNode<(typeof ExperimentSchema)['_properties']>

export type ExperimentStatus =
  | 'design'
  | 'baseline'
  | 'intervention'
  | 'washout'
  | 'analysis'
  | 'concluded'
  | 'abandoned'

export type ExperimentDesign =
  | 'observational'
  | 'AB'
  | 'ABAB'
  | 'multipleBaseline'
  | 'crossover'
  | 'alternating'

/**
 * A single phase in an experiment's timeline. Stored as a json array on
 * `Experiment.phases`; the canonical day fields are UTC-midnight ms.
 */
export interface ExperimentPhase {
  label: string
  /** ObservationPhase category this phase contributes to. */
  kind: 'baseline' | 'intervention' | 'washout'
  start: number
  end: number | null
}
