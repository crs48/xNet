/**
 * Deployment diagnostics console bootstrap (exploration 0341 P2).
 *
 * The operator side of "every hub is its own Sentry": first run creates a
 * dedicated Diagnostics Space plus the three saved views 0315 described but
 * never shipped (Inbox / By release / By fingerprint), and `importDebugReports`
 * drains the hub's quarantine into `debug-report` nodes inside that Space.
 * Everything uses deterministic ids, so re-running bootstraps nothing twice
 * and a drain raced by another device LWW-upserts instead of duplicating.
 *
 * Pure over its two ports (workspace `store`, hub `request`) so it is directly
 * testable without React — the `useDiagnosticsInbox` hook is the thin host.
 */

import {
  DebugReportSchema,
  defineNodeQueryAST,
  defineSavedViewDescriptor,
  queryOperators,
  SavedViewSchema,
  SpaceMembershipSchema,
  SpaceSchema,
  spaceMembershipId,
  type NodeStore
} from '@xnetjs/data'
import {
  drainDebugReports,
  HUB_DRAIN_PATHS,
  type DrainReportsResult,
  type IngestRequest
} from './debug-report-drain'

/** Deterministic home for drained reports — one per workspace, never seeded twice. */
export const DIAGNOSTICS_SPACE_ID = 'space_diagnostics'

export const DIAGNOSTICS_VIEW_IDS = {
  inbox: 'savedview_diagnostics_inbox',
  byRelease: 'savedview_diagnostics_by_release',
  byFingerprint: 'savedview_diagnostics_by_fingerprint'
} as const

/** The console's landing view — where "Open console" deep-links. */
export const DIAGNOSTICS_CONSOLE_VIEW_ID = DIAGNOSTICS_VIEW_IDS.inbox

const dr = queryOperators<(typeof DebugReportSchema)['_properties']>()

const CONSOLE_VIEWS: Array<{
  id: string
  title: string
  description: string
  query: ReturnType<typeof defineNodeQueryAST>
}> = [
  {
    id: DIAGNOSTICS_VIEW_IDS.inbox,
    title: 'Diagnostics — Inbox',
    description: 'New crash and debug reports awaiting triage, newest first.',
    query: defineNodeQueryAST(DebugReportSchema, {
      where: dr.eq('status', 'new'),
      orderBy: { lastSeen: 'desc' }
    })
  },
  {
    id: DIAGNOSTICS_VIEW_IDS.byRelease,
    title: 'Diagnostics — By release',
    description: 'All reports grouped by the release that produced them.',
    query: defineNodeQueryAST(DebugReportSchema, {
      orderBy: { release: 'desc', lastSeen: 'desc' }
    })
  },
  {
    id: DIAGNOSTICS_VIEW_IDS.byFingerprint,
    title: 'Diagnostics — By fingerprint',
    description: 'Issues ordered by how often they recur.',
    query: defineNodeQueryAST(DebugReportSchema, {
      orderBy: { occurrences: 'desc', lastSeen: 'desc' }
    })
  }
]

/**
 * Idempotently create the Diagnostics Space + saved views. Safe to call before
 * every import; only missing nodes are written.
 */
export async function ensureDiagnosticsConsole(
  store: NodeStore,
  did: string | null
): Promise<void> {
  if ((await store.get(DIAGNOSTICS_SPACE_ID)) === null) {
    await store.create({
      id: DIAGNOSTICS_SPACE_ID,
      schemaId: SpaceSchema.schema['@id'],
      properties: {
        name: 'Diagnostics',
        kind: 'workspace',
        visibility: 'private',
        description: 'Crash and debug reports drained from this deployment’s hub (0341).',
        ...(did ? { owners: [did] } : {})
      }
    })
    // Seed the creator's owner membership so the roster + cascade have an edge
    // (the useSpaces.createSpace convention).
    if (did) {
      await store.create({
        id: spaceMembershipId(DIAGNOSTICS_SPACE_ID, did),
        schemaId: SpaceMembershipSchema.schema['@id'],
        properties: {
          space: DIAGNOSTICS_SPACE_ID,
          member: did,
          role: 'owner',
          addedBy: did,
          addedAt: Date.now()
        }
      })
    }
  }

  for (const view of CONSOLE_VIEWS) {
    if ((await store.get(view.id)) !== null) continue
    const descriptor = defineSavedViewDescriptor({
      title: view.title,
      description: view.description,
      scope: 'workspace',
      query: view.query
    })
    await store.create({
      id: view.id,
      schemaId: SavedViewSchema.schema['@id'],
      properties: {
        title: view.title,
        description: view.description,
        descriptor: JSON.stringify(descriptor),
        scope: 'workspace'
      }
    })
  }
}

/**
 * Bootstrap the console (idempotent) and drain the hub's pending quarantine
 * into it. Returns how many reports were imported.
 */
export async function importDebugReports(
  store: NodeStore,
  request: IngestRequest,
  did: string | null
): Promise<DrainReportsResult> {
  await ensureDiagnosticsConsole(store, did)
  return drainDebugReports(store, request, DIAGNOSTICS_SPACE_ID, HUB_DRAIN_PATHS)
}
