/**
 * @xnetjs/plugins — the outbound Action primitive (exploration 0213).
 *
 * Connectors *pull* an external service into nodes; an Action is the reverse —
 * "when something happens in xNet, reach out." It is the other half of the
 * Zapier/IFTTT story (post to Discord on task close, send an email, hit a
 * webhook) and the symmetric twin of {@link ../connectors/define-connector}:
 *
 *   1. a `capabilities` manifest — `network` (where it may POST, closed by
 *      default) and `secrets` (held by the hub broker, e.g. a Discord webhook
 *      URL or a bot token);
 *   2. a `trigger` declaring what fires it (a node change on given schemas, a
 *      schedule, or manual); and
 *   3. a `dispatch(event, ctx)` that does the outbound call through a guarded,
 *      SSRF-checked `fetch`.
 *
 * Like a Connector it produces a `FeatureModule` (so it installs, consents, and
 * ships through the marketplace), with the hub half wired by convention under
 * `<id>.trigger`. The guards are enforced by composition in the action runner
 * (see {@link ./runner}); this module is just the shape + validation.
 */

import type { AgentToolContribution } from '../agent-tools'
import type { ConnectorCadence } from '../connectors/define-connector'
import type { FetchLike } from '../ecosystem/network-endowment'
import type { FeatureModule, ModuleCapabilities } from '../feature-module'
import { defineFeatureModule } from '../feature-module'

/** What fires an action. */
export type ActionTrigger =
  | { kind: 'schema-change'; schemas: string[] }
  | { kind: 'schedule'; cadence: ConnectorCadence }
  | { kind: 'manual' }

/** The change that triggered a dispatch (schema-change triggers carry a node). */
export interface ActionEvent {
  trigger: 'schema-change' | 'schedule' | 'manual'
  /** Change kind for schema-change events. */
  change?: 'create' | 'update' | 'delete'
  /** The affected node for schema-change events. */
  node?: { id: string; schemaId: string; properties?: Record<string, unknown> }
}

/** Context handed to `dispatch`: scoped secrets + a guarded, SSRF-checked fetch. */
export interface ActionContext {
  /** Broker-scoped env — only the keys declared in `capabilities.secrets`. */
  env: Record<string, string | undefined>
  /** Guarded fetch — egress limited to `capabilities.network`, SSRF-checked. */
  fetch: FetchLike
}

export interface ActionDefinition {
  /** Reverse-domain id, e.g. `dev.xnet.action.discord`. */
  id: string
  name: string
  version?: string
  author?: string
  description?: string
  /** Capability surface — `network` is required (closed by default). */
  capabilities: ModuleCapabilities & { network: string[] }
  /** What fires this action. */
  trigger: ActionTrigger
  /** Perform the outbound call. Runs hub-side with scoped secrets. */
  dispatch(event: ActionEvent, ctx: ActionContext): Promise<void>
  /** Optional model-facing tools (e.g. a manual "send now"). */
  agentTools?: AgentToolContribution[]
}

/** The product of {@link defineAction}. */
export interface DefinedAction {
  module: FeatureModule
  trigger: ActionTrigger
  dispatch: ActionDefinition['dispatch']
  agentTools: AgentToolContribution[]
  definition: ActionDefinition
}

export class ActionDefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionDefinitionError'
  }
}

const ID_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/i

function validate(def: ActionDefinition): void {
  if (!def.id || !ID_RE.test(def.id)) {
    throw new ActionDefinitionError(`id must be reverse-domain (got: ${JSON.stringify(def.id)})`)
  }
  if (!def.name) throw new ActionDefinitionError('name is required')
  if (!def.capabilities?.network || def.capabilities.network.length === 0) {
    throw new ActionDefinitionError(
      `action '${def.id}' must declare at least one network host (closed by default)`
    )
  }
  if (def.trigger.kind === 'schema-change' && def.trigger.schemas.length === 0) {
    throw new ActionDefinitionError(
      `action '${def.id}' has a schema-change trigger but lists no schemas`
    )
  }
}

/**
 * Whether `action`'s trigger should fire for `event`. The "when X happens"
 * decision, kept pure so a host can fan an event out to matching actions.
 */
export function shouldDispatch(trigger: ActionTrigger, event: ActionEvent): boolean {
  switch (trigger.kind) {
    case 'manual':
      return event.trigger === 'manual'
    case 'schedule':
      return event.trigger === 'schedule'
    case 'schema-change':
      return (
        event.trigger === 'schema-change' &&
        !!event.node &&
        trigger.schemas.includes(event.node.schemaId)
      )
  }
}

/**
 * Define an outbound Action. Validates the capability/trigger coherence (a
 * network host is declared; a schema-change trigger lists schemas) and produces
 * a `FeatureModule` whose `hub.featureId` points at `<id>.trigger`.
 *
 * @throws {ActionDefinitionError} when the definition is incoherent.
 */
export function defineAction(def: ActionDefinition): DefinedAction {
  validate(def)
  const agentTools = def.agentTools ?? []
  const module = defineFeatureModule({
    id: def.id,
    name: def.name,
    version: def.version ?? '0.1.0',
    ...(def.author ? { author: def.author } : {}),
    ...(def.description ? { description: def.description } : {}),
    capabilities: def.capabilities,
    hub: { featureId: `${def.id}.trigger` },
    contributes: { agentTools }
  })
  return { module, trigger: def.trigger, dispatch: def.dispatch, agentTools, definition: def }
}
