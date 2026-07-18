/**
 * DebugReportSchema — a drained crash/debug report in the operator's triage
 * workspace (exploration 0315).
 *
 * The cloud ingest quarantines scrubbed reports; the operator's signing client
 * drains them into these nodes with deterministic ids (fingerprint for the
 * automatic lane → LWW upsert, so repeat crashes bump `occurrences` on one
 * node rather than flooding). The workbench then IS the triage console: table
 * views filter by release/surface/fingerprint, `status` drives the lifecycle,
 * and comments carry investigation notes.
 *
 * Content is already scrubbed twice before it reaches here (client + ingest);
 * these fields carry code-level diagnostics only, never document data.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { created, createdBy, json, number, relation, select, text } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

const lanes = [
  { id: 'auto', name: 'Automatic', color: 'gray' },
  { id: 'user', name: 'User report', color: 'blue' },
  { id: 'hub', name: 'Hub', color: 'purple' }
] as const

const surfaces = [
  { id: 'web', name: 'Web', color: 'blue' },
  { id: 'electron', name: 'Desktop', color: 'green' },
  { id: 'hub', name: 'Hub', color: 'purple' },
  { id: 'cloud', name: 'Cloud', color: 'orange' },
  { id: 'unknown', name: 'Unknown', color: 'gray' }
] as const

const statuses = [
  { id: 'new', name: 'New', color: 'red' },
  { id: 'acked', name: 'Acknowledged', color: 'yellow' },
  { id: 'in-progress', name: 'In progress', color: 'blue' },
  { id: 'fixed', name: 'Fixed', color: 'green' },
  { id: 'released', name: 'Released', color: 'gray' }
] as const

export const DebugReportSchema = defineSchema({
  name: 'DebugReport',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    // Home Space for the operator's triage workspace — drives access control.
    space: relation({}),
    lane: select({ options: lanes, required: true, default: 'auto' }),
    /** Grouping key: hash(errorName + normalized top frame + release). */
    fingerprint: text({ required: true, maxLength: 64 }),
    /** Cross-release issue identity: the fingerprint minus release (0341). */
    issueKey: text({ maxLength: 64 }),
    errorName: text({ required: true, maxLength: 120 }),
    message: text({ maxLength: 500 }),
    stack: text({ maxLength: 6000 }),
    release: text({ maxLength: 64 }),
    surface: select({ options: surfaces, required: true, default: 'unknown' }),
    bootStage: text({ maxLength: 64 }),
    uaFamily: text({ maxLength: 64 }),
    userDescription: text({ maxLength: 2000 }),
    /** Scrubbed recent console lines (user lane only). */
    breadcrumbs: json<string[]>({}),
    /** Hub lane only: hub-salted sender hash, never a raw DID. */
    didHash: text({ maxLength: 128 }),
    occurrences: number({ integer: true }),
    status: select({ options: statuses, required: true, default: 'new' }),
    firstSeen: number({}),
    lastSeen: number({}),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  // Reports live in the operator's diagnostics Space and inherit its access.
  authorization: spaceCascadeAuthorization('space')
})

export type DebugReport = InferNode<(typeof DebugReportSchema)['_properties']>
