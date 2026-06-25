/**
 * Shared types for the dev-tools database seed.
 *
 * Seeders are pure functions: given a {@link SeedContext} they return plain node
 * drafts (and optionally deterministic Yjs document builders). They never touch
 * the store directly — the {@link SeedRunner} owns all I/O — so they are trivially
 * unit-testable and reusable by tests, stories and a future CLI.
 */

import type { DeterministicNodeImportDraft, NodeId, SchemaIRI } from '@xnetjs/data'
import type * as Y from 'yjs'

/** Coarse volume knob; multiplies the volume-bearing collections only. */
export type SeedScale = 'small' | 'medium' | 'large'

/**
 * - `converge` (default): idempotent upsert of every managed fixture. Re-running
 *   never duplicates; values LWW-merge back to canonical.
 * - `accrete`: converge, then append random-ID volume nodes (non-idempotent by
 *   design, for scale/perf testing).
 * - `reseed`: delete the managed set, then converge to a clean state.
 */
export type SeedMode = 'converge' | 'accrete' | 'reseed'

/** Resolved per-scale counts. */
export interface SeedScaleConfig {
  scale: SeedScale
  projects: number
  tasksPerProject: number
  pages: number
  channels: number
  messagesPerChannel: number
  observationsPerMetric: number
  /** Extra random-ID nodes per volume schema when mode === 'accrete'. */
  accretePerSchema: number
}

/** Everything a seeder needs; all randomness flows from `rng`. */
export interface SeedContext {
  /** The demo Space node ID every content node is scoped into. */
  space: NodeId
  /** The real signing author (owner of the demo Space → cascade authz). */
  authorDID: string
  /** Stable demo DIDs for assignees / members / reactors. */
  people: ReadonlyArray<{ did: string; name: string; emoji: string }>
  /** Resolved volume counts. */
  scale: SeedScaleConfig
  /** Deterministic PRNG (seeded). */
  rng: () => number
}

/** A deterministic Yjs document attached to a created node. */
export interface SeedDoc {
  nodeId: NodeId
  /** Build the Y.Doc fresh; only applied when the node is newly created. */
  build: () => Y.Doc
}

/** What a seeder returns. */
export interface SeederResult {
  drafts: DeterministicNodeImportDraft[]
  docs?: SeedDoc[]
}

/** A registered Tier-1 domain seeder. */
export interface SeederModule {
  /** Stable domain key (also the per-domain toggle id in the UI). */
  domain: string
  /** Human label for the UI. */
  label: string
  /** Schemas this seeder is responsible for (drives the coverage guard). */
  schemaIds: SchemaIRI[]
  /** Pure factory. */
  seed: (ctx: SeedContext) => SeederResult
}

/** Per-schema created/updated tally. */
export interface SeedSchemaTally {
  created: number
  updated: number
}

/** Result of a seed run. */
export interface SeedReport {
  mode: SeedMode
  scale: SeedScale
  created: number
  updated: number
  docsApplied: number
  /** Keyed by schema IRI. */
  perSchema: Record<string, SeedSchemaTally>
  durationMs: number
}

/** Progress callback payload. */
export interface SeedProgress {
  phase: 'resolve' | 'collect' | 'import' | 'docs' | 'index' | 'done'
  message: string
}
