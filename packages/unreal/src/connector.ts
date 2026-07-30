/**
 * The Unreal Engine 6 game connector (exploration 0200).
 *
 * A game is "just another external service": `buildUnrealConnector` produces a
 * `@xnetjs/plugins` `ConnectorDefinition` that pulls a title's normalized event
 * stream into governed, space-scoped nodes — the same capability-scoped,
 * marketplace-shippable shape as the Slack/GitHub connectors (exploration 0196).
 * The agent never holds the game's token; the hub broker does, and the agent sees
 * only policy-evaluated nodes.
 *
 * Kept deliberately free of a runtime dependency on `@xnetjs/plugins`: the return
 * value is typed against its `ConnectorDefinition` (a type-only import) and is
 * structurally a valid input to `defineConnector`, but this package builds the
 * plain definition so it stays light and unit-testable. The host wraps it with the
 * real `defineConnector` (see the package README / exploration 0200).
 */

import type {
  AgentToolContribution,
  ConnectorDefinition,
  ConnectorSyncContext,
  ConnectorSyncResult
} from '@xnetjs/plugins'
import { GAME_SCHEMA_IRIS } from '@xnetjs/data'
import { mapGameEventToNode, type GameEvent } from './events'
import { assertDurableCadence, assertDurableSchemas, type SyncCadence } from './granularity'

/** A reader the agent tools query the governed (policy-evaluated) store through. */
export type UnrealNodeQuery = (schemaId: string, limit: number) => Promise<unknown[]>

export interface UnrealConnectorOptions {
  /** Reverse-domain connector id (default `fyi.xnet.connector.unreal`). */
  id?: string
  /** Human-readable name (default `Unreal Engine 6 Game Bridge`). */
  name?: string
  /** Base URL of the title's events API. Its host is always allowed in `network`. */
  apiBaseUrl: string
  /** Extra network hosts to allow (the `apiBaseUrl` host is always included). */
  network?: string[]
  /** Re-sync cadence (default `daily`). Validated against the durable floor. */
  cadence?: SyncCadence
  /** Secret env keys the hub broker scopes in (default `['UNREAL_*', 'EPIC_*']`). */
  secrets?: string[]
  /** Which durable game schemas to sync (default: the whole pack). */
  schemas?: readonly string[]
  /** Optional reader enabling agent tools over the synced nodes. */
  query?: UnrealNodeQuery
}

const DEFAULT_ID = 'fyi.xnet.connector.unreal'
const DEFAULT_NAME = 'Unreal Engine 6 Game Bridge'
const DEFAULT_SECRETS = ['UNREAL_*', 'EPIC_*']

/** Host of a URL, or the raw string if it cannot be parsed (best-effort). */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Tolerantly pull an event array out of whatever the guarded fetch returned. */
export function extractEvents(raw: unknown): GameEvent[] {
  if (Array.isArray(raw)) return raw as GameEvent[]
  if (raw && typeof raw === 'object' && Array.isArray((raw as { events?: unknown }).events)) {
    return (raw as { events: GameEvent[] }).events
  }
  return []
}

/** Authorization header derived from the broker-scoped env, when a token is set. */
function authHeaders(env: Record<string, string | undefined>): Record<string, string> {
  const token = env.UNREAL_API_TOKEN ?? env.EPIC_API_TOKEN
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Build the Unreal game connector definition. Validates the durability rules at
 * build time (cadence floor + schema allowlist) so a misconfigured connector
 * fails loudly rather than melting the hub.
 *
 * @throws {GranularityError} when the cadence is too fast or a schema is non-durable.
 */
export function buildUnrealConnector(options: UnrealConnectorOptions): ConnectorDefinition {
  const cadence: SyncCadence = options.cadence ?? 'daily'
  const schemas = options.schemas ?? GAME_SCHEMA_IRIS

  assertDurableCadence(cadence)
  assertDurableSchemas(schemas, GAME_SCHEMA_IRIS)

  const host = hostOf(options.apiBaseUrl)
  const network = Array.from(new Set([host, ...(options.network ?? [])]))
  const schemaWrite = [...schemas]

  const agentTools = options.query ? buildAgentTools(options.id ?? DEFAULT_ID, options.query) : []

  return {
    id: options.id ?? DEFAULT_ID,
    name: options.name ?? DEFAULT_NAME,
    description:
      'Syncs an Unreal Engine 6 title’s durable player data (identity, inventory, ' +
      'achievements, matches, economy) into governed xNet nodes (exploration 0200).',
    capabilities: {
      secrets: options.secrets ?? DEFAULT_SECRETS,
      schemaWrite,
      network
    },
    sync: {
      schemas: schemaWrite,
      cadence,
      async pull(ctx: ConnectorSyncContext): Promise<ConnectorSyncResult> {
        const raw = await ctx.fetch(`${options.apiBaseUrl}/events`, {
          headers: authHeaders(ctx.env)
        })
        const events = extractEvents(raw)
        let written = 0
        for (const event of events) {
          const node = mapGameEventToNode(event)
          await ctx.store.create(node)
          written += 1
        }
        return { written }
      }
    },
    ...(agentTools.length > 0 ? { agentTools } : {})
  }
}

/** The model-facing read tools over the synced, policy-evaluated nodes. */
function buildAgentTools(id: string, query: UnrealNodeQuery): AgentToolContribution[] {
  return [
    {
      id: `${id}.list`,
      name: 'unreal_list_game_nodes',
      title: 'List Unreal game nodes',
      description:
        'List recent synced game nodes of a given durable schema IRI (player, ' +
        'inventory, item, achievement, match, economy). Reads the governed store.',
      risk: 'low',
      inputSchema: {
        type: 'object',
        properties: {
          schemaId: { type: 'string', description: 'A game-interop schema IRI to list' },
          limit: { type: 'number', description: 'Max nodes to return (default 20)' }
        },
        required: ['schemaId']
      },
      invoke: (args: Record<string, unknown>) =>
        query(String(args.schemaId), typeof args.limit === 'number' ? args.limit : 20)
    }
  ]
}
