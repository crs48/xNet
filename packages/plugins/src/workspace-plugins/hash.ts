/**
 * Workspace-plugin content hashing (explorations 0331, 0327-E).
 *
 * A workspace plugin activates AT a content hash: the hash of its files map,
 * entry, and data manifest is pinned on consent (`publishedHash`), and any
 * later source drift renders as diff-and-consent — never a silent update.
 * This is the anti-rug-pull line: sync can move the source node freely, but
 * what RUNS only changes when the user (re)approves a hash.
 */

import type { PluginSourceNode, WorkspacePluginManifestData } from '../schemas/plugin-source'

/** Stable stringify: objects serialize with sorted keys at every depth. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
  return `{${entries.join(',')}}`
}

/** SHA-256 hex of a UTF-8 string via Web Crypto (browser + node ≥18). */
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The content hash a workspace plugin activates at. Covers exactly what runs:
 * files, entry, and the data manifest (permissions included — a permission
 * change is a consent-worthy change).
 */
export async function computePluginSourceHash(input: {
  files: Record<string, string> | undefined
  entry: string | undefined
  manifest: WorkspacePluginManifestData | undefined
}): Promise<string> {
  return sha256Hex(
    canonicalJson({
      files: input.files ?? {},
      entry: input.entry ?? '',
      manifest: input.manifest ?? null
    })
  )
}

// ─── Drift + update consent ────────────────────────────────────────────────

export interface PluginSourceDiff {
  added: string[]
  removed: string[]
  changed: string[]
  /** True when entry or manifest (not just file contents) changed. */
  manifestChanged: boolean
}

/** Compare two source snapshots at file granularity (for the consent dialog). */
export function diffPluginSourceFiles(
  before: { files?: Record<string, string>; entry?: string; manifest?: unknown },
  after: { files?: Record<string, string>; entry?: string; manifest?: unknown }
): PluginSourceDiff {
  const a = before.files ?? {}
  const b = after.files ?? {}
  const added = Object.keys(b)
    .filter((p) => !(p in a))
    .sort()
  const removed = Object.keys(a)
    .filter((p) => !(p in b))
    .sort()
  const changed = Object.keys(b)
    .filter((p) => p in a && a[p] !== b[p])
    .sort()
  const manifestChanged =
    before.entry !== after.entry ||
    canonicalJson(before.manifest ?? null) !== canonicalJson(after.manifest ?? null)
  return { added, removed, changed, manifestChanged }
}

export type PluginUpdateAssessment =
  | { status: 'unpinned' }
  | { status: 'up-to-date'; hash: string }
  | { status: 'drift'; pinnedHash: string; currentHash: string }

/**
 * Assess a source node against its pinned hash. `drift` means the running
 * (pinned) version and the source have diverged — the host must keep running
 * the pinned version and surface diff-and-consent before swapping.
 */
export async function assessPluginUpdate(source: PluginSourceNode): Promise<PluginUpdateAssessment> {
  const currentHash = await computePluginSourceHash({
    files: source.files,
    entry: source.entry,
    manifest: source.manifest
  })
  if (!source.publishedHash) return { status: 'unpinned' }
  if (source.publishedHash === currentHash) return { status: 'up-to-date', hash: currentHash }
  return { status: 'drift', pinnedHash: source.publishedHash, currentHash }
}
