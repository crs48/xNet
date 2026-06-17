/**
 * @xnetjs/plugins — connector artifacts + interop (exploration 0196).
 *
 * A Connector is governed *inside* xNet, but it should also be a good citizen of
 * the wider CLI/MCP ecosystem. From one definition this emits:
 *
 *   - a `connectors`-category marketplace entry (so it ships like any plugin);
 *   - per-tool descriptors for advertisement (what the user's own harness, e.g.
 *     `xnet mcp serve`, exposes to Claude Code / Codex / OpenClaw);
 *   - a per-connector `SKILL.md` fragment for external/files-first harnesses; and
 *   - an `ImporterContribution`-shaped adapter, so a connector's sync doubles as
 *     a one-shot importer (generalizing the dormant 0189 importers point).
 *
 * All pure — no I/O — so the marketplace publisher, the MCP server, and the CLI
 * each consume what they need.
 */

import type { AgentToolContribution } from '../agent-tools'
import type { ImporterContribution } from '../contributions'
import type { DefinedConnector } from './define-connector'
import type { MarketplaceEntry } from '../ecosystem/marketplace'

/** The marketplace category every Connector lists under. */
export const CONNECTOR_CATEGORY = 'connectors'

/** A model-facing descriptor of one connector tool (for tool advertisement). */
export interface ConnectorToolDescriptor {
  name: string
  description: string
  risk: string
}

export interface ConnectorArtifacts {
  /** Tool descriptors the user's harness advertises (MCP `tools/list`-style). */
  agentTools: ConnectorToolDescriptor[]
  /** A per-connector SKILL.md fragment for external / files-first harnesses. */
  skillMarkdown: string
  /** A `connectors`-category marketplace entry. */
  marketplaceEntry: MarketplaceEntry
}

/** `dev.xnet.connector.slack` → `slack`. */
function lastSegment(id: string): string {
  return id.split('.').pop() ?? id
}

function toolDescriptors(tools: readonly AgentToolContribution[]): ConnectorToolDescriptor[] {
  return tools.map((t) => ({ name: t.name, description: t.description, risk: t.risk ?? 'medium' }))
}

/** Build a `connectors`-category marketplace entry from a connector. */
export function connectorMarketplaceEntry(
  connector: DefinedConnector,
  options: { manifestUrl?: string } = {}
): MarketplaceEntry {
  const def = connector.definition
  return {
    id: def.id,
    name: def.name,
    description: def.description ?? `${def.name} — an xNet connector`,
    version: def.version ?? '0.1.0',
    author: def.author ?? 'unknown',
    category: CONNECTOR_CATEGORY,
    keywords: ['connector', lastSegment(def.id)],
    capabilities: def.capabilities,
    manifestUrl: options.manifestUrl ?? `xnet://connector/${def.id}`
  }
}

/**
 * Expose a connector's sync as an `ImporterContribution` — the connector's
 * `pull` doubles as a one-shot importer for the source platform. The adapter is
 * opaque to the importers registry (the import flow casts it), matching the 0189
 * "defined now, consumed later" shape.
 */
export function connectorAsImporter(connector: DefinedConnector): ImporterContribution {
  const def = connector.definition
  return {
    id: `${def.id}.import`,
    platform: lastSegment(def.id),
    version: def.version ?? '0.1.0',
    name: `${def.name} import`,
    adapter: { connectorId: def.id, schemas: connector.sync.schemas, sync: connector.sync }
  }
}

/** A short SKILL.md fragment describing the connector + its tools for an agent. */
function skillMarkdown(connector: DefinedConnector): string {
  const def = connector.definition
  const tools = connector.agentTools
  const toolLines = tools.length
    ? tools.map((t) => `- \`${t.name}\` — ${t.description}`).join('\n')
    : '- (no agent tools declared)'
  return `## ${def.name} connector (\`${def.id}\`)

${def.description ?? `${def.name} synced into governed xNet nodes.`}

Data is synced into your workspace as nodes (schemas: ${connector.sync.schemas
    .map((s) => `\`${s}\``)
    .join(', ')}) and scoped to the active Space. The service credential stays in
the hub — these tools read the policy-evaluated nodes, never the raw API:

${toolLines}
`
}

/**
 * Emit the portable artifacts for a connector: tool descriptors, a SKILL.md
 * fragment, and a marketplace entry. One definition → every surface.
 */
export function emitConnectorArtifacts(
  connector: DefinedConnector,
  options: { manifestUrl?: string } = {}
): ConnectorArtifacts {
  return {
    agentTools: toolDescriptors(connector.agentTools),
    skillMarkdown: skillMarkdown(connector),
    marketplaceEntry: connectorMarketplaceEntry(connector, options)
  }
}
