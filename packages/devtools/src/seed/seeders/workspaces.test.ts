/**
 * Workspaces seeder (0280): the seeded system presets must round-trip
 * through the workspace payload parser back to the exact client-side
 * preset trees — preset → node → tree, lossless.
 */
import { parseWorkspacePayload, createPresetTree, PRESET_IDS } from '@xnetjs/plugins'
import { describe, expect, it } from 'vitest'
import { workspacesSeeder } from './workspaces'

describe('workspaces seeder', () => {
  const result = workspacesSeeder.seed({} as never)

  it('seeds one system workspace per preset', () => {
    expect(result.drafts).toHaveLength(PRESET_IDS.length)
    for (const draft of result.drafts) {
      expect(draft.properties?.system).toBe('system')
    }
  })

  it('round-trips every seeded tree back to the client preset', () => {
    for (const preset of PRESET_IDS) {
      const draft = result.drafts.find((entry) => entry.properties?.preset === preset)
      expect(draft).toBeDefined()
      const parsed = parseWorkspacePayload({
        name: draft?.properties?.name,
        preset,
        tree: JSON.parse(JSON.stringify(draft?.properties?.tree))
      })
      expect(parsed?.tree).toEqual(createPresetTree(preset))
    }
  })
})
