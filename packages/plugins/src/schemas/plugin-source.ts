/**
 * PluginSource schema (exploration 0331).
 *
 * A workspace plugin's SOURCE is a node: a multi-file `files` map (path →
 * contents), an `entry` module, and the manifest's contributions as pure data.
 * Because the source is a node it syncs, branches, and drafts like any other
 * data — "publish" is CRDT sync, not a deploy pipeline. Code from a
 * PluginSource NEVER runs in the host realm; the workspace-plugin host loads
 * it only inside the opaque-origin iframe rung (see `workspace-plugins/`).
 *
 * This is 0180's Lab grown one storey: a Lab holds one `code` string executed
 * as a script; a PluginSource holds a package that exports contributions.
 */

import { defineSchema, json, relation, text } from '@xnetjs/data'
import type { PluginPermissions } from '../types'

export const PluginSourceSchema = defineSchema({
  name: 'PluginSource',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Human-readable plugin name (also the manifest name fallback). */
    name: text({ required: true, maxLength: 500 }),
    /** What the plugin does. */
    description: text({}),
    /** Source files: path → contents (v1; blob refs for big assets later). */
    files: json({}),
    /** Entry module path within `files`, e.g. "index.ts". */
    entry: text({}),
    /** The manifest as pure data (contributions declared, never functions). */
    manifest: json({}),
    /** The spec Page that drove this plugin (the Patchwork spec-doc convention). */
    spec: relation({ target: 'xnet://xnet.fyi/Page@1.0.0' as const }),
    /**
     * Content hash pinned at activation consent (0327-E). Source drift from
     * this hash renders as diff-and-consent, never a silent update.
     */
    publishedHash: text({}),
    /** Canonical SECURITY home; empty = personal/private. */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const })
  }
})

/** Schema IRI for PluginSource nodes (matches the versioned IRI `defineSchema` builds). */
export const PLUGIN_SOURCE_SCHEMA_IRI = 'xnet://xnet.fyi/PluginSource@1.0.0'

/**
 * The manifest a PluginSource declares — a pure-data subset of `XNetExtension`.
 * Contributions are DECLARATIONS ONLY (ids, names, metadata); the handlers are
 * the sandboxed module's exports, proxied over the contribution RPC. Anything
 * function-shaped in here is ignored by the host.
 */
export interface WorkspacePluginManifestData {
  /** Reverse-domain plugin id, e.g. `com.example.habit-tracker`. */
  id: string
  name: string
  version: string
  description?: string
  author?: string
  /** Permission declarations — drive the consent dialog + store RPC gates. */
  permissions?: PluginPermissions
  /** Data-declared contributions the sandboxed module implements. */
  contributes?: WorkspacePluginContributionsData
}

/** The sandbox-eligible contribution points, declared as pure data (0331). */
export interface WorkspacePluginContributionsData {
  /** Views rendered as sandboxed frames (`renderView(id, props)` in the module). */
  views?: Array<{
    type: string
    name: string
    icon?: string
    supportedSchemas?: string[]
  }>
  /** Palette commands proxied to the module's `commands[id]` handler. */
  commands?: Array<{
    id: string
    name: string
    description?: string
    keybinding?: string
    keywords?: string[]
    icon?: string
  }>
  /** Slash commands proxied to the module's `slashCommands[id]` handler. */
  slashCommands?: Array<{
    id: string
    name: string
    description?: string
    aliases?: string[]
    icon?: string
  }>
  /** Dashboard widgets rendered through the SafeNode tree contract. */
  widgets?: Array<{
    type: string
    name: string
    description?: string
    defaultSize: { w: number; h: number; minW?: number; minH?: number }
  }>
  /** Model-facing agent tools proxied to the module's `agentTools[name]`. */
  agentTools?: Array<{
    name: string
    description: string
    inputSchema?: {
      type: 'object'
      properties: Record<string, unknown>
      required?: readonly string[]
    }
  }>
}

/** Type-safe shape of a PluginSource node's properties. */
export interface PluginSourceNode {
  id: string
  name: string
  description?: string
  files?: Record<string, string>
  entry?: string
  manifest?: WorkspacePluginManifestData
  spec?: string
  publishedHash?: string
}

/**
 * Read a PluginSource node's properties into the typed shape, tolerating
 * missing/foreign values (synced nodes are attacker-supplied data).
 */
export function readPluginSourceNode(node: {
  id: string
  properties: Record<string, unknown>
}): PluginSourceNode {
  const p = node.properties
  const files =
    p.files && typeof p.files === 'object' && !Array.isArray(p.files)
      ? Object.fromEntries(
          Object.entries(p.files as Record<string, unknown>).filter(
            ([, v]) => typeof v === 'string'
          )
        )
      : undefined
  const manifest =
    p.manifest && typeof p.manifest === 'object' && !Array.isArray(p.manifest)
      ? (p.manifest as WorkspacePluginManifestData)
      : undefined
  return {
    id: node.id,
    name: typeof p.name === 'string' ? p.name : 'Untitled plugin',
    description: typeof p.description === 'string' ? p.description : undefined,
    files: files as Record<string, string> | undefined,
    entry: typeof p.entry === 'string' && p.entry ? p.entry : undefined,
    manifest,
    spec: typeof p.spec === 'string' ? p.spec : undefined,
    publishedHash: typeof p.publishedHash === 'string' ? p.publishedHash : undefined
  }
}
