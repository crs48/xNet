/**
 * Workspace-plugin publishing (exploration 0331, increment 5a).
 *
 * Two publish paths, both human-gated:
 *
 *  - **P2P share** — the source node already syncs like any node; "publishing"
 *    is pinning the consented content hash so receivers know what the author
 *    vouched for. Receivers RE-DERIVE trust from their own install action
 *    (provenance `synced` → user tier, re-consent before activation) — the
 *    hash pins content, never trust.
 *  - **Public marketplace** — export the source as a repo file map (the
 *    `xnet-plugin-template` shape) + a ready-made `registry/community.json`
 *    entry; the host wires `publishPluginRepo` (devkit, gh CLI) to push it.
 *    That backend is injected so this module stays browser-safe.
 */

import type { PluginSourceNode } from '../schemas/plugin-source'
import { computePluginSourceHash } from './hash'

// ─── P2P share (pin-and-share) ─────────────────────────────────────────────

export interface PublishConsentRequest {
  sourceId: string
  pluginId: string
  name: string
  version: string
  /** The content hash consent pins. */
  contentHash: string
  /** Declared permissions rendered for the dialog by the host. */
  permissions: unknown
}

export interface WorkspacePluginPublishResult {
  ok: boolean
  contentHash?: string
  declined?: boolean
}

/**
 * Pin-and-share: compute the content hash, ask the user, persist the pin.
 * After this the source node syncing IS the distribution channel.
 */
export async function requestWorkspacePluginPublish(options: {
  source: PluginSourceNode
  /** Human consent for the publish (capabilities + provenance dialog). */
  onConsent: (request: PublishConsentRequest) => boolean | Promise<boolean>
  /** Persist the pinned hash onto the source node. */
  persistPinnedHash: (sourceId: string, hash: string) => void | Promise<void>
}): Promise<WorkspacePluginPublishResult> {
  const { source } = options
  const manifest = source.manifest
  if (!manifest) return { ok: false }
  const contentHash = await computePluginSourceHash({
    files: source.files,
    entry: source.entry,
    manifest
  })
  const granted = await options.onConsent({
    sourceId: source.id,
    pluginId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    contentHash,
    permissions: manifest.permissions
  })
  if (!granted) return { ok: false, declined: true }
  await options.persistPinnedHash(source.id, contentHash)
  return { ok: true, contentHash }
}

// ─── Public marketplace (repo + registry entry) ────────────────────────────

/** The `registry/community.json` entry shape (see registry/README.md). */
export interface CommunityRegistryEntry {
  id: string
  name: string
  description?: string
  version: string
  author?: string
  category: string
  keywords?: string[]
  license: string
  platforms: string[]
  contributes: string[]
  homepage: string
}

/** Build the one-line community.json entry for a workspace plugin. */
export function buildCommunityRegistryEntry(
  source: PluginSourceNode,
  options: { repoUrl: string; category?: string; keywords?: string[] }
): CommunityRegistryEntry {
  const manifest = source.manifest
  if (!manifest) throw new Error('PluginSource has no manifest')
  const contributes = Object.entries(manifest.contributes ?? {})
    .filter(([, list]) => Array.isArray(list) && list.length > 0)
    .map(([key]) => key)
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description ?? source.description,
    version: manifest.version,
    author: manifest.author,
    category: options.category ?? 'workspace',
    keywords: options.keywords,
    license: 'MIT',
    platforms: ['web', 'electron'],
    contributes,
    homepage: options.repoUrl
  }
}

/**
 * Export the source node as a repo file map (README + manifest.json + source
 * files) — the input `publishPluginRepo` (devkit) pushes with the gh CLI.
 */
export function exportPluginSourceAsRepoFiles(source: PluginSourceNode): Record<string, string> {
  const manifest = source.manifest
  if (!manifest) throw new Error('PluginSource has no manifest')
  const files: Record<string, string> = {}
  for (const [path, contents] of Object.entries(source.files ?? {})) {
    files[`src/${path}`] = contents
  }
  files['manifest.json'] = `${JSON.stringify(manifest, null, 2)}\n`
  files['README.md'] =
    `# ${manifest.name}\n\n` +
    `${manifest.description ?? source.description ?? ''}\n\n` +
    `A workspace plugin authored inside xNet (entry: \`src/${source.entry ?? 'index.ts'}\`).\n` +
    `Install it from the xNet marketplace, or sync the source node directly.\n`
  return files
}
