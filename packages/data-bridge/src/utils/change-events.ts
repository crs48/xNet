/**
 * Shared helpers for routing NodeStore change events to query caches.
 */

import type { NodeChangeEvent, SchemaIRI } from '@xnetjs/data'

/**
 * Group change events by the schema they affect, dropping events whose
 * schema cannot be determined. Used by both the main-thread bridge and the
 * data worker to fan batched store changes out to per-schema cache entries.
 */
export function groupNodeChangeEventsBySchema(
  events: readonly NodeChangeEvent[]
): Map<SchemaIRI, NodeChangeEvent[]> {
  const eventsBySchema = new Map<SchemaIRI, NodeChangeEvent[]>()

  for (const event of events) {
    const schemaId: SchemaIRI | undefined = event.node?.schemaId ?? event.change.payload.schemaId
    if (!schemaId) continue

    const next = eventsBySchema.get(schemaId) ?? []
    next.push(event)
    eventsBySchema.set(schemaId, next)
  }

  return eventsBySchema
}
