/**
 * The ordered registry of Tier-1 domain seeders, the exclusion allowlist for
 * system/meta schemas, and helpers to resolve the Tier-2 auto-coverage set.
 *
 * Coverage rule (enforced by `seed-coverage.test.ts`): every registered schema
 * is either covered by a Tier-1 seeder, handled by the Tier-2 auto-generator, or
 * explicitly excluded here.
 */

import type { SeederModule, SeedScale } from './types'
import type { DefinedSchema, SchemaIRI } from '@xnetjs/data'
import {
  AccountRecordSchema,
  DebugReportSchema,
  DeviceRecordSchema,
  ExtensionFieldSchema,
  GrantSchema,
  InboxStateSchema,
  PresenceSummarySchema,
  RecoveryRecordSchema,
  RevocationRecordSchema,
  SchemaCompatibilitySchema,
  SchemaDefinitionSchema,
  SchemaExtensionSchema,
  SyncPolicySchema,
  schemaRegistry
} from '@xnetjs/data'
import { accountingSeeder } from './seeders/accounting'
import { commsSeeder } from './seeders/comms'
import { crmSeeder } from './seeders/crm'
import { databaseSeeder } from './seeders/database'
import { docsSeeder } from './seeders/docs'
import { integrationSeeder } from './seeders/integration'
import { meetingsSeeder } from './seeders/meetings'
import { metricsSeeder } from './seeders/metrics'
import { sceneSeeder } from './seeders/scene'
import { spacesSeeder } from './seeders/spaces'
import { vizSeeder } from './seeders/viz'
import { workSeeder } from './seeders/work'
import { workspacesSeeder } from './seeders/workspaces'

/** Ordered Tier-1 seeders. Spaces first; the rest only cross-link by id. */
export const SEEDERS: readonly SeederModule[] = [
  spacesSeeder,
  sceneSeeder,
  workSeeder,
  docsSeeder,
  meetingsSeeder,
  databaseSeeder,
  vizSeeder,
  commsSeeder,
  metricsSeeder,
  crmSeeder,
  accountingSeeder,
  integrationSeeder,
  workspacesSeeder
]

/** Schemas a Tier-1 seeder is responsible for (canonical `_schemaId`s). */
export const TIER1_SCHEMA_IDS: ReadonlySet<string> = new Set(SEEDERS.flatMap((s) => s.schemaIds))

/**
 * Curated first-visit demo profile for the landing-page "Try the app" flow
 * (exploration 0384). A lived-in-looking subset — documents, tasks, a
 * database, chat, CRM, and a canvas scene — small enough to seed in well
 * under a second, without the auto-generated placeholder rows the full seed
 * adds for exotic schemas. Pass to `runSeed`/`collectSeed`:
 *
 *   runSeed({ store, ...LANDING_SEED_PROFILE })
 */
export const LANDING_SEED_PROFILE: {
  domains: string[]
  scale: SeedScale
  includeAuto: boolean
} = {
  domains: ['spaces', 'scene', 'work', 'docs', 'database', 'comms', 'crm'],
  scale: 'small',
  includeAuto: false
}

/**
 * System / meta schemas intentionally left unseeded — infrastructure, not
 * user-facing content. Adding a new schema of this kind means adding it here.
 */
export const SEED_EXCLUDED_SCHEMA_IDS: ReadonlySet<string> = new Set([
  SchemaDefinitionSchema._schemaId,
  SchemaExtensionSchema._schemaId,
  ExtensionFieldSchema._schemaId,
  SchemaCompatibilitySchema._schemaId,
  SyncPolicySchema._schemaId,
  GrantSchema._schemaId,
  InboxStateSchema._schemaId,
  PresenceSummarySchema._schemaId,
  // Account/device ledger (0149/0243) — identity infrastructure, not seeded content.
  AccountRecordSchema._schemaId,
  DeviceRecordSchema._schemaId,
  RecoveryRecordSchema._schemaId,
  RevocationRecordSchema._schemaId,
  // Debug reports (0315) — operator triage infrastructure drained from the
  // diagnostics ingest, not user-authored demo content.
  DebugReportSchema._schemaId
])

/**
 * Resolve every registered schema to its canonical DefinedSchema, de-duplicating
 * the versioned (`@1.0.0`) and bare IRIs that the registry exposes for each.
 */
export async function resolveAllSchemas(): Promise<DefinedSchema[]> {
  const iris = schemaRegistry.getAllIRIs() as SchemaIRI[]
  const byCanonical = new Map<string, DefinedSchema>()
  for (const iri of iris) {
    const schema = await schemaRegistry.get(iri)
    if (schema) byCanonical.set(schema._schemaId, schema)
  }
  return [...byCanonical.values()]
}

/** Schemas the Tier-2 auto-generator is responsible for (registered − Tier-1 − excluded). */
export async function getAutoSchemas(): Promise<DefinedSchema[]> {
  const all = await resolveAllSchemas()
  return all.filter(
    (s) => !TIER1_SCHEMA_IDS.has(s._schemaId) && !SEED_EXCLUDED_SCHEMA_IDS.has(s._schemaId)
  )
}
