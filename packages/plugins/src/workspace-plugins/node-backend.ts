/**
 * NodeStore-backed workspace-plugin source backend + the `agent-tools`
 * provider registration (explorations 0331 → 0455).
 *
 * 0331 built the `plugin_*` tools with an injected backend and no production
 * implementation ever wired one — the tools sat tested and unreachable. This
 * module supplies both halves the hosts need: a `WorkspacePluginSourceBackend`
 * over the ordinary `NodeStoreAPI` (PluginSource nodes, so sources sync,
 * branch, and draft like any data), and a one-call registration that publishes
 * the tool set on a `ServiceRegistry` — after which every host that passes
 * that registry to its AI surface exposes `plugin_*` automatically.
 */

import type { WorkspacePluginAgentToolsOptions, WorkspacePluginSourceBackend } from './agent-tools'
import type { NodeStoreAPI } from '../services/local-api'
import type { Disposable } from '../types'
import { PLUGIN_SOURCE_SCHEMA_IRI, readPluginSourceNode } from '../schemas/plugin-source'
import { AGENT_TOOLS_SERVICE, type ServiceRegistry } from '../service-registry'
import { createWorkspacePluginAgentTools } from './agent-tools'

/** Source CRUD over PluginSource nodes in the ordinary store. */
export function createNodeStoreWorkspacePluginBackend(
  store: NodeStoreAPI
): WorkspacePluginSourceBackend {
  return {
    async createSource(input) {
      const node = await store.create({
        schemaId: PLUGIN_SOURCE_SCHEMA_IRI,
        properties: {
          name: input.name,
          description: input.description ?? '',
          files: input.files,
          entry: input.entry,
          manifest: input.manifest,
          ...(input.spec ? { spec: input.spec } : {})
        }
      })
      return { id: node.id }
    },

    async getSource(id) {
      const node = await store.get(id)
      if (!node || node.schemaId !== PLUGIN_SOURCE_SCHEMA_IRI) return null
      return readPluginSourceNode(node)
    },

    async listSources() {
      const nodes = await store.list({ schemaId: PLUGIN_SOURCE_SCHEMA_IRI })
      return nodes.map((node) => {
        const source = readPluginSourceNode(node)
        return { id: source.id, name: source.name }
      })
    },

    async updateSource(id, patch) {
      const properties: Record<string, unknown> = {}
      if (patch.name !== undefined) properties.name = patch.name
      if (patch.description !== undefined) properties.description = patch.description
      if (patch.files !== undefined) properties.files = patch.files
      if (patch.entry !== undefined) properties.entry = patch.entry
      if (patch.manifest !== undefined) properties.manifest = patch.manifest
      await store.update(id, { properties })
    }
  }
}

/**
 * Publish the `plugin_*` tool set as an `agent-tools` provider. The 0455
 * wiring in one call: hosts register once, every surface built with the same
 * `ServiceRegistry` resolves the tools — no per-host `extraTools` threading.
 */
export function registerWorkspacePluginAgentTools(
  services: ServiceRegistry,
  options: WorkspacePluginAgentToolsOptions
): Disposable {
  return services.provide(AGENT_TOOLS_SERVICE, createWorkspacePluginAgentTools(options))
}
