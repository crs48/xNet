/**
 * @xnetjs/plugins — connector sync runner (exploration 0196).
 *
 * Runs a connector's `pull` with the guardrails composed, so the *author* writes
 * plain `store.create(...)` / `fetch(...)` and the *framework* guarantees:
 *
 *   - **egress containment** — `fetch` is `guardedFetch`, limited to the declared
 *     `capabilities.network`;
 *   - **schema-write containment** — `store` is `guardStore`, limited to the
 *     declared `capabilities.schemaWrite`;
 *   - **space scoping** — every created node is stamped with the target Space, so
 *     the authorization cascade keeps one space's synced data invisible to agents
 *     working in another (no cross-contamination);
 *   - **budget** — writes are charged against the `connector` surface, separate
 *     from the interactive agent's `localApi` budget, so a bulk backfill is
 *     throttled rather than unbounded.
 *
 * Secret scoping is the hub's job: `mountFeatures` hands `pull` a `scopedEnv`, so
 * this runner never sees (or needs) the full process env — keeping the dependency
 * direction clean (no `@xnetjs/plugins` → `@xnetjs/hub` edge).
 */

import type {
  ConnectorDefinition,
  ConnectorFetch,
  ConnectorStore,
  ConnectorSyncResult
} from './define-connector'
import { guardStore } from '../ecosystem/capability-guard'
import { guardedFetch } from '../ecosystem/network-endowment'
import { createConnectorWriteGuardrail, type McpWriteGuardrail } from '../services/mcp-guardrail'

export class ConnectorSyncError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConnectorSyncError'
  }
}

/** A node store with the methods the runner guards (create/get/update). */
export type GuardableConnectorStore = ConnectorStore

export interface RunConnectorSyncPorts {
  /** Broker-scoped env (the hub scopes it; tests pass a minimal object). */
  env: Record<string, string | undefined>
  /** Underlying fetch — wrapped in `guardedFetch` before reaching `pull`. */
  fetch: ConnectorFetch
  /** Underlying store — wrapped in `guardStore` + space-stamp before `pull`. */
  store: GuardableConnectorStore
  /** Target Space id. Required unless `allowUnscoped` is set. */
  space: string | null
  /** Write guardrail; defaults to a fresh `connector`-surface guardrail. */
  guardrail?: McpWriteGuardrail
  /** Opt out of the space requirement (personal / intentionally unscoped sync). */
  allowUnscoped?: boolean
}

/**
 * Run a connector's sync with all guards composed. The connector author's `pull`
 * sees a guarded fetch + store and a target space; it cannot reach undeclared
 * hosts, write undeclared schemas, leak across spaces, or exceed its budget.
 *
 * @throws {ConnectorSyncError} when a target space is required but missing.
 */
export async function runConnectorSync(
  def: ConnectorDefinition,
  ports: RunConnectorSyncPorts
): Promise<ConnectorSyncResult> {
  const space = ports.space
  if (!space && !ports.allowUnscoped) {
    throw new ConnectorSyncError(
      `connector '${def.id}' sync requires a target space (pass allowUnscoped to opt out)`
    )
  }

  const spaceProp = def.sync.spaceProperty ?? 'space'
  const guardrail = ports.guardrail ?? createConnectorWriteGuardrail()
  const fetch = guardedFetch(def.capabilities, def.id, ports.fetch)
  const guarded = guardStore(ports.store, def.capabilities, def.id)

  // The store handed to `pull`: schema-guarded (via `guarded`), budget-charged,
  // and space-stamped. The author never has to remember the space or the budget.
  const store: ConnectorStore = {
    async create({ schemaId, properties }) {
      const verdict = guardrail.evaluate({ kind: 'create', schemaId, confirm: true })
      if (verdict.decision !== 'allow') {
        // Sync passes confirm:true, so the only non-allow outcome is a budget
        // block (both non-allow verdicts carry a `reason`).
        throw new ConnectorSyncError(
          `connector '${def.id}' write blocked on the connector surface: ${verdict.reason}`
        )
      }
      const props =
        space === null
          ? properties
          : { ...properties, [spaceProp]: stampSpace(properties[spaceProp], space, def.id) }
      const created = await guarded.create({ schemaId, properties: props })
      guardrail.recordApplied({ kind: 'create', schemaId, confirm: true }, verdict, created.id)
      return created
    },
    get: (id) => guarded.get(id),
    update: (id, options) => guarded.update(id, options)
  }

  return def.sync.pull({ env: ports.env, fetch, store, space: space ?? '' })
}

/**
 * Enforce that a created node's space is the connector's target space. An author
 * may omit it (we stamp it) but may not point it elsewhere — that would be a
 * cross-space leak.
 */
function stampSpace(existing: unknown, space: string, connectorId: string): string {
  if (existing !== undefined && existing !== space) {
    throw new ConnectorSyncError(
      `connector '${connectorId}' tried to write a node into space ${JSON.stringify(
        existing
      )} but its sync target is ${JSON.stringify(space)} (cross-space write refused)`
    )
  }
  return space
}
