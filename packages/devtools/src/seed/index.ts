/**
 * Dev-tools database seed — a thorough, idempotent fixture covering every
 * registered content type and the relationships between them. See README.md.
 */

export { runSeed, collectSeed, SCALES, DEMO_SPACE_ID } from './seed-runner'
export type { RunSeedOptions } from './seed-runner'
export {
  SEEDERS,
  TIER1_SCHEMA_IDS,
  SEED_EXCLUDED_SCHEMA_IDS,
  LANDING_SEED_PROFILE,
  getAutoSchemas,
  resolveAllSchemas
} from './seed-manifest'
export { autoDraft, autoValue } from './auto-generator'
export { buildSnapshot } from './snapshot'
export type { SeedSnapshot } from './snapshot'
export {
  seedId,
  isSeedId,
  makeRng,
  SEED_PREFIX,
  SEED_ACCRETE_PREFIX,
  SEED_AUTO_PREFIX,
  DEMO_PEOPLE
} from './seed-ids'
export type {
  SeedContext,
  SeedDoc,
  SeederModule,
  SeederResult,
  SeedMode,
  SeedScale,
  SeedScaleConfig,
  SeedReport,
  SeedProgress,
  SeedSchemaTally
} from './types'
