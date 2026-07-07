/**
 * WorkspaceSchema - A saved shell layout (exploration 0280).
 *
 * The workbench's layout tree serialized as a node: named, synced,
 * versioned by the change log, shareable via the owner's grants — the
 * shell's "map file". Only the PORTABLE half of a layout lives here
 * (placements, tiers, chrome posture, tabs capability); device-local
 * pixel sizes stay in the client's local store, keyed by this node's id.
 *
 * The tree payload is whole-value LWW JSON. The app validates it with
 * `parseWorkspacePayload` (apps/web/src/workbench/layout-tree.ts — the
 * canonical shape) before loading, so a malformed or malicious shared
 * workspace degrades to an empty region, never a crashed shell.
 */

import type { InferNode } from '../types'
import { presets } from '../../auth'
import { defineSchema } from '../define'
import { json, select, text } from '../properties'

/**
 * Structural mirror of the app's LayoutTree (source of truth:
 * apps/web/src/workbench/layout-tree.ts). Kept loose on purpose — the
 * data layer stores, the app validates.
 */
export interface WorkspaceTreeJson {
  workspaceId: string
  regions: Record<string, Array<{ viewId: string; tier: string; order: number }>>
  surface: { tabsEnabled: boolean }
  chrome: string
}

export const WorkspaceSchema = defineSchema({
  name: 'Workspace',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Display name in the workspace switcher ("Monday triage") */
    name: text({ required: true, maxLength: 200 }),

    /** Short description for the switcher / marketplace listing */
    description: text({ maxLength: 1000 }),

    /**
     * Preset provenance, for "Workspace: Reset to preset". `none` =
     * built from scratch.
     */
    preset: select({
      options: [
        { id: 'none', name: 'None', color: 'gray' },
        { id: 'quiet', name: 'Quiet', color: 'gray' },
        { id: 'calm', name: 'Calm', color: 'blue' },
        { id: 'bench', name: 'Bench', color: 'green' }
      ] as const,
      default: 'none'
    }),

    /**
     * Whether this is a read-only system preset (seeded) or a user save.
     * System workspaces are re-seeded idempotently and never edited in
     * place — "Save as…" forks them.
     */
    system: select({
      options: [
        { id: 'user', name: 'User', color: 'gray' },
        { id: 'system', name: 'System', color: 'yellow' }
      ] as const,
      default: 'user'
    }),

    /** The portable layout tree — whole-value LWW */
    tree: json<WorkspaceTreeJson>({})
  },
  // Personal shell state: owner-only by default; the owner's grants are
  // how a bench travels to a teammate (exploration 0280).
  authorization: presets.private()
})

export type Workspace = InferNode<(typeof WorkspaceSchema)['_properties']>
