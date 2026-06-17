/**
 * @xnetjs/plugins — wrap an external CLI as a Connector (exploration 0196).
 *
 * The interop play: an existing agent-native CLI (e.g. a Printing Press tool)
 * becomes a governed Connector by running it and mapping its output into nodes.
 * The wrapper governs the **output mapping** — the synced schema, the target
 * Space, the write budget — so the agent reads policy-evaluated nodes instead of
 * the raw CLI.
 *
 * Honest caveat: the wrapped CLI is a subprocess that reaches the network itself,
 * so its *egress* is NOT enforced by `guardedFetch`. `network` here is for the
 * consent/marketplace display; a wrapped CLI should be a trusted, clearly-labeled
 * tier. The `runCli` port is injected (no `@xnetjs/devkit` edge here), so the
 * caller decides how the CLI actually runs (and can sandbox it).
 */

import type { AgentToolContribution } from '../agent-tools'
import type { DefinedConnector } from './define-connector'
import { defineConnector } from './define-connector'

export interface WrapCliConnectorOptions {
  /** Reverse-domain id, e.g. `dev.acme.connector.wikipedia-cli`. */
  id: string
  name: string
  version?: string
  author?: string
  description?: string
  /** The schema each parsed record is materialized as. */
  schema: string
  /** Hosts the CLI reaches — for display only (subprocess egress is not enforced). */
  network: string[]
  /** Secrets the CLI needs (held by the hub broker). */
  secrets?: string[]
  /** The Space relation property to stamp (default `space`). */
  spaceProperty?: string
  /** Run the external CLI and return its stdout. Injected (e.g. a CommandRunner). */
  runCli: () => Promise<string>
  /** Parse the CLI stdout into records; each becomes one node's properties. */
  parse: (stdout: string) => Array<Record<string, unknown>>
  /** Optional agent tools over the synced nodes. */
  agentTools?: AgentToolContribution[]
}

/**
 * Produce a governed Connector that runs an external CLI and maps its output
 * into nodes. The CLI runs once per sync; each parsed record is written through
 * the guarded, space-stamped, budget-charged store.
 */
export function wrapCliConnector(options: WrapCliConnectorOptions): DefinedConnector {
  return defineConnector({
    id: options.id,
    name: options.name,
    ...(options.version ? { version: options.version } : {}),
    ...(options.author ? { author: options.author } : {}),
    ...(options.description ? { description: options.description } : {}),
    capabilities: {
      ...(options.secrets ? { secrets: options.secrets } : {}),
      schemaWrite: [options.schema],
      network: options.network
    },
    sync: {
      schemas: [options.schema],
      ...(options.spaceProperty ? { spaceProperty: options.spaceProperty } : {}),
      pull: async ({ store, space }) => {
        const stdout = await options.runCli()
        const records = options.parse(stdout)
        for (const record of records) {
          await store.create({ schemaId: options.schema, properties: { ...record, space } })
        }
        return { written: records.length }
      }
    },
    ...(options.agentTools ? { agentTools: options.agentTools } : {})
  })
}
