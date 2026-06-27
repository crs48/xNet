/**
 * "What we know about you" mirror (xNet Humane Internet Charter §Consent,
 * exploration 0234). Because xNet keeps no behavioral surplus, it can do the one
 * move a surveillance company can't: enumerate *everything* it has derived about
 * you, from every producer, and let you purge any of it.
 *
 * This module is the framework-agnostic aggregator + the canonical registry of
 * derived-data producers. Each producer (telemetry buffer, embeddings, AI
 * memory) supplies a {@link DerivedDataSource}; {@link describeWhatWeKnow}
 * flattens them. {@link missingDerivedKinds} is the completeness guard: if a new
 * producer kind is registered without a surfacing source, it shows up here (and
 * the test fails), so the mirror can never silently omit a category.
 */

import type { TelemetryRecord } from '../collection'

/**
 * The canonical set of things xNet can derive about a user. Adding a new
 * producer to the system means adding its kind here AND giving it a
 * {@link DerivedDataSource} — the registry test enforces both.
 */
export type DerivedDataKind = 'telemetry' | 'embedding' | 'ai-memory'

export const DERIVED_DATA_KINDS: readonly DerivedDataKind[] = [
  'telemetry',
  'embedding',
  'ai-memory'
]

/** Where a derived artifact physically lives. */
export type DerivedDataLocation = 'this device' | 'your hub'

/** A single derived artifact the user can inspect and purge. */
export interface DerivedItem {
  id: string
  kind: DerivedDataKind
  /** Human-readable one-liner: what this is. */
  label: string
  location: DerivedDataLocation
  /** Remove this artifact from its underlying store. */
  purge: () => void | Promise<void>
}

/** A producer of derived data that can enumerate and surface its artifacts. */
export interface DerivedDataSource {
  kind: DerivedDataKind
  list(): DerivedItem[] | Promise<DerivedItem[]>
}

/** Flatten every source into one purgeable inventory — the whole truth. */
export async function describeWhatWeKnow(sources: DerivedDataSource[]): Promise<DerivedItem[]> {
  const lists = await Promise.all(sources.map((source) => source.list()))
  return lists.flat()
}

/**
 * Registered kinds that no source covers. Empty ⇒ the mirror is complete. A
 * non-empty result means a producer exists in the registry but isn't surfaced —
 * the mirror would be lying by omission.
 */
export function missingDerivedKinds(sources: DerivedDataSource[]): DerivedDataKind[] {
  const covered = new Set(sources.map((source) => source.kind))
  return DERIVED_DATA_KINDS.filter((kind) => !covered.has(kind))
}

/** The slice of TelemetryCollector the mirror needs (kept structural to avoid coupling). */
export interface TelemetryMirrorPort {
  getLocalTelemetry(options?: { limit?: number }): TelemetryRecord[]
  deleteTelemetry(ids: string | string[]): void
}

/**
 * Surface the local telemetry buffer in the mirror. These records are already
 * PII-scrubbed and k-anon bucketed; here they're simply made visible and
 * purgeable so "what we know" includes anything queued to (maybe) leave.
 */
export function telemetryDerivedSource(collector: TelemetryMirrorPort): DerivedDataSource {
  return {
    kind: 'telemetry',
    list: () =>
      collector.getLocalTelemetry().map((record) => ({
        id: record.id,
        kind: 'telemetry' as const,
        label: `${labelForSchema(record.schemaId)} (${record.status})`,
        location: 'this device' as const,
        purge: () => collector.deleteTelemetry(record.id)
      }))
  }
}

function labelForSchema(schemaId: string): string {
  const tail = schemaId.split('/').pop() ?? schemaId
  return tail.replace(/@.*$/, '')
}
