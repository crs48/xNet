/**
 * @xnetjs/plugins/ecosystem — the plugin-ecosystem platform layer (0192).
 *
 * The enforceable substrate beneath the marketplace, authoring DX, and trust
 * story: capability enforcement, provenance→trust derivation, install consent,
 * version compatibility, dependency resolution, the marketplace index/search,
 * supply-chain provenance verification, and a plugin test harness.
 */

export {
  CapabilityError,
  matchSchemaIri,
  isSchemaWriteAllowed,
  isSchemaReadAllowed,
  isNetworkAllowed,
  assertSchemaWrite,
  assertNetwork,
  guardStore
} from './capability-guard'

export { deriveTrustTier, requiresCapabilityReprompt, sandboxForTier } from './provenance-trust'
export type { InstallProvenance, PluginTrustTier, SandboxKind } from './provenance-trust'

export { describeCapabilities, evaluateInstallConsent, shortSchemaName } from './consent'
export type { ConsentLine, ConsentDecision } from './consent'

export {
  parseVersion,
  compareVersions,
  satisfiesRange,
  isHostCompatible,
  hasUpdate
} from './compatibility'
export type { SemVer } from './compatibility'

export { findMissingDependencies, resolveInstallOrder, DependencyCycleError } from './dependencies'
export type { DependencyNode, MissingDependency } from './dependencies'

export {
  searchMarketplace,
  sortMarketplace,
  filterByCategory,
  aggregateRatings,
  MarketplaceClient,
  MARKETPLACE_PROVENANCE
} from './marketplace'
export type {
  MarketplaceEntry,
  MarketplaceSort,
  MarketplaceClientOptions,
  FetchJson,
  PluginRating,
  RatingSummary
} from './marketplace'

export { failClosedVerifier, verifyProvenance, summarizeProvenance } from './provenance'
export type {
  Provenance,
  ProvenanceResult,
  ProvenanceVerifier,
  VerifyProvenanceInput
} from './provenance'

export { createTestNodeStore, createTestPluginHarness } from './testing'
export type { TestNodeStore, TestPluginHarness, TestHarnessOptions } from './testing'
