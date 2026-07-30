/**
 * Workspaces seeder — the three shell presets as read-only system
 * workspace nodes (exploration 0280). The trees come from the canonical
 * preset fixtures in @xnetjs/plugins, so the seeded nodes can never drift
 * from what `applyPreset` builds client-side; "Save as…" forks them into
 * user workspaces.
 */

import type { SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import { WorkspaceSchema } from '@xnetjs/data'
import { createPresetTree, PRESET_IDS, serializeWorkspacePayload } from '@xnetjs/plugins'
import { seedId } from '../seed-ids'

export const workspaceNodeId = (slug: string): string => seedId('workspace', slug)

const PRESET_LABELS: Record<string, { name: string; description: string }> = {
  quiet: {
    name: 'Quiet',
    description: 'Bare surface; chrome summoned from corners, edges and ⌘K.'
  },
  calm: {
    name: 'Calm',
    description: 'Mode switch, navigator and surface — the everyperson shell.'
  },
  bench: {
    name: 'Bench',
    description: 'Tabs, docks and status bar — the full workbench.'
  }
}

export const workspacesSeeder: SeederModule = {
  domain: 'workspaces',
  label: 'Workspaces (shell presets)',
  schemaIds: [WorkspaceSchema._schemaId],
  seed: () => {
    const drafts: DeterministicNodeImportDraft[] = PRESET_IDS.map((preset) => {
      const payload = serializeWorkspacePayload({
        name: PRESET_LABELS[preset].name,
        preset,
        tree: createPresetTree(preset)
      })
      return {
        id: workspaceNodeId(preset),
        schemaId: WorkspaceSchema._schemaId,
        properties: {
          name: payload.name,
          description: PRESET_LABELS[preset].description,
          preset,
          system: 'system',
          tree: payload.tree
        }
      }
    })
    return { drafts }
  }
}
