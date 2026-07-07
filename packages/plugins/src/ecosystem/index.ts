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
  filterByKind,
  aggregateRatings,
  recommendExtensions,
  MarketplaceClient,
  MARKETPLACE_PROVENANCE
} from './marketplace'
export type {
  MarketplaceEntry,
  MarketplaceListingKind,
  MarketplaceSort,
  MarketplaceClientOptions,
  FetchJson,
  PluginRating,
  RatingSummary,
  UsageSignal,
  RecommendOptions
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

// Network endowment — enforce the `network` allowlist at the fetch boundary.
export { guardedFetch } from './network-endowment'
export type { FetchLike } from './network-endowment'

// Plugin project scaffolder (the pure core behind `create-xnet-plugin`).
export { scaffoldPlugin, pascalCase, packageName, ScaffoldError } from './scaffold'
export type { ScaffoldTemplate, ScaffoldSpec, ScaffoldResult } from './scaffold'

// Paid-plugin license policy (exploration 0196) — allowed SPDX set + LICENSE text.
export {
  ALLOWED_PLUGIN_LICENSES,
  DEFAULT_PLUGIN_LICENSE,
  isAllowedPluginLicense,
  pluginLicenseText
} from './license-policy'
export type { AllowedPluginLicense } from './license-policy'

// AI-authored plugin transform — validated generated script → installable plugin.
export { scriptToPluginManifest, AiAuthoringError } from './ai-authoring'
export type {
  GeneratedScript,
  ScriptExecutor,
  ScriptToManifestInput,
  AiAuthoredPlugin
} from './ai-authoring'

// Run plugin code on the labs runtime ladder (0194 Phase 1) — port-based.
export { ladderTierForTrust, runPluginCode, PluginRuntimeError } from './runtime'
export type {
  LadderRuntimeTier,
  PluginRunInput,
  PluginRunResult,
  PluginRuntimeLadder,
  RunPluginCodeInput
} from './runtime'

// AI→Lab→Plugin assembly line (0194 Phase 2) — generate → lab-test → consent → publish.
export { runAiPluginPipeline } from './ai-pipeline'
export type {
  LabRunOutcome,
  AiPluginPipelinePorts,
  AiPluginPipelineInput,
  AiPluginPipelineResult
} from './ai-pipeline'
