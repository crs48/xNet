/**
 * @xnetjs/plugins — the Connector primitive (exploration 0196).
 *
 * A Connector is xNet's answer to the agent-native CLI (Printing Press / OpenClaw):
 * instead of giving the agent a credentialed shell, it syncs an external service
 * into governed xNet nodes and exposes agent-callable tools over them. It is a
 * `FeatureModule` subtype that bundles three things:
 *
 *   1. a `capabilities` manifest — `secrets` (held by the hub broker, never the
 *      agent), `schemaWrite` (what it may materialize), `network` (where it may
 *      reach);
 *   2. a server-side `sync` adapter that pulls the external API into nodes; and
 *   3. `agentTools` the model can call over the synced, policy-evaluated store.
 *
 * `defineConnector` produces the `FeatureModule` (so it installs, consents, and
 * ships through the marketplace like any plugin) plus the sync spec and tools.
 * The hub half is wired by convention under `<id>.sync` (see the hub
 * `connectorSyncFeature`). The guards are enforced by composition — `guardStore`,
 * `guardedFetch`, `scopedEnv`, the policy evaluator — not by new code here.
 */

import type { AgentToolContribution } from '../agent-tools'
import type { FeatureModule, ModuleCapabilities } from '../feature-module'
import { isSchemaWriteAllowed } from '../ecosystem/capability-guard'
import { defineFeatureModule } from '../feature-module'

/** How often a connector re-syncs. `manual` = only on explicit/agent trigger. */
export type ConnectorCadence = 'manual' | 'hourly' | 'daily' | { everyMs: number }

/** The minimal node store surface a connector's `pull` writes through. */
export interface ConnectorStore {
  create(options: {
    schemaId: string
    properties: Record<string, unknown>
  }): Promise<{ id: string; schemaId: string }>
  get(id: string): Promise<{ schemaId: string } | null>
  update(id: string, options: { properties: Record<string, unknown> }): Promise<unknown>
}

/** A `fetch`-like the connector reaches the network through (host-allowlisted). */
export type ConnectorFetch = (input: string | { url: string }, init?: unknown) => Promise<unknown>

/** Context handed to `pull`: scoped secrets, guarded fetch + store, target space. */
export interface ConnectorSyncContext {
  /** Broker-scoped env — only the keys declared in `capabilities.secrets`. */
  env: Record<string, string | undefined>
  /** Guarded fetch — egress limited to `capabilities.network`. */
  fetch: ConnectorFetch
  /** Guarded store — writes limited to `capabilities.schemaWrite`, space-stamped. */
  store: ConnectorStore
  /** The target Space id every synced node is scoped to (the cascade boundary). */
  space: string
}

export interface ConnectorSyncResult {
  /** Number of nodes written this run. */
  written: number
  [key: string]: unknown
}

export interface ConnectorSyncSpec {
  /** Schema IRIs this connector materializes (must be a subset of `schemaWrite`). */
  schemas: string[]
  /**
   * The relation property each synced node carries the target Space in (default
   * `space`). The runner stamps it so an author cannot forget — that stamp is
   * what makes the space cascade (and thus cross-contamination protection) hold.
   */
  spaceProperty?: string
  /** Re-sync cadence (default `manual`). */
  cadence?: ConnectorCadence
  /** Pull external data into nodes. Runs hub-side with scoped secrets. */
  pull(ctx: ConnectorSyncContext): Promise<ConnectorSyncResult>
}

export interface ConnectorDefinition {
  /** Reverse-domain id, e.g. `dev.xnet.connector.slack`. */
  id: string
  /** Human-readable name. */
  name: string
  /** Semantic version (default `0.1.0`). */
  version?: string
  author?: string
  description?: string
  /** The capability surface — enforced, not advisory. `network` is required. */
  capabilities: ModuleCapabilities & { schemaWrite: string[]; network: string[] }
  /** Server-side sync adapter. */
  sync: ConnectorSyncSpec
  /** Model-facing tools over the synced store. */
  agentTools?: AgentToolContribution[]
}

/** The product of {@link defineConnector}: a module plus its runnable parts. */
export interface DefinedConnector {
  /** The installable, consent-gated, marketplace-shippable feature module. */
  module: FeatureModule
  /** The sync adapter (run by the hub `connectorSyncFeature`). */
  sync: ConnectorSyncSpec
  /** The contributed agent tools. */
  agentTools: AgentToolContribution[]
  /** The original definition. */
  definition: ConnectorDefinition
}

export class ConnectorDefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConnectorDefinitionError'
  }
}

const ID_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/i

function validate(def: ConnectorDefinition): void {
  if (!def.id || !ID_RE.test(def.id)) {
    throw new ConnectorDefinitionError(`id must be reverse-domain (got: ${JSON.stringify(def.id)})`)
  }
  if (!def.name) throw new ConnectorDefinitionError('name is required')
  if (!def.capabilities?.network || def.capabilities.network.length === 0) {
    throw new ConnectorDefinitionError(
      `connector '${def.id}' must declare at least one network host (closed by default)`
    )
  }
  if (!def.sync?.schemas || def.sync.schemas.length === 0) {
    throw new ConnectorDefinitionError(`connector '${def.id}' must sync at least one schema`)
  }
  // Every synced schema must be writable under the declared grant — otherwise the
  // capability guard would block the connector's own writes at runtime.
  for (const schema of def.sync.schemas) {
    if (!isSchemaWriteAllowed(def.capabilities, schema)) {
      throw new ConnectorDefinitionError(
        `connector '${def.id}' syncs ${schema} but it is not covered by capabilities.schemaWrite`
      )
    }
  }
}

/**
 * Define a Connector. Validates the capability/sync coherence (every synced
 * schema is writable; a network host is declared) and produces a `FeatureModule`
 * whose `hub.featureId` points at the sync feature mounted under `<id>.sync`.
 *
 * @throws {ConnectorDefinitionError} when the definition is incoherent.
 */
export function defineConnector(def: ConnectorDefinition): DefinedConnector {
  validate(def)
  const agentTools = def.agentTools ?? []
  const module = defineFeatureModule({
    id: def.id,
    name: def.name,
    version: def.version ?? '0.1.0',
    ...(def.author ? { author: def.author } : {}),
    ...(def.description ? { description: def.description } : {}),
    capabilities: def.capabilities,
    hub: { featureId: `${def.id}.sync` },
    contributes: { agentTools }
  })
  return { module, sync: def.sync, agentTools, definition: def }
}
