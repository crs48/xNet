import type { EditorContribution } from '@xnetjs/plugins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mergeEditorContributions } from './usePlugins'

describe('mergeEditorContributions (BlockNote, 0312)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('merges specs and slash menu items in priority order', () => {
    const contributions: EditorContribution[] = [
      {
        id: 'late',
        priority: 200,
        blockSpecs: { callout: 'late-callout' },
        slashMenuItems: [{ id: 'late-item', name: 'Late', execute: () => {} }]
      },
      {
        id: 'early',
        priority: 10,
        blockSpecs: { callout: 'early-callout' },
        inlineContentSpecs: { mention: 'mention-spec' },
        styleSpecs: { aiGenerated: 'style-spec' },
        slashMenuItems: [{ id: 'early-item', name: 'Early', execute: () => {} }]
      }
    ]

    const merged = mergeEditorContributions(contributions, ['callout', 'mention', 'aiGenerated'])

    // Later (higher priority number) contribution wins on collision.
    expect(merged.blockSpecs.callout).toBe('late-callout')
    expect(merged.inlineContentSpecs.mention).toBe('mention-spec')
    expect(merged.styleSpecs.aiGenerated).toBe('style-spec')
    expect(merged.slashMenuItems.map((item) => item.id)).toEqual(['early-item', 'late-item'])
  })

  it('warns on and excludes specs not statically bundled (skew guard)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const contributions: EditorContribution[] = [
      {
        id: 'rogue',
        blockSpecs: { rogueBlock: 'spec' },
        slashMenuItems: [{ id: 'safe-item', name: 'Safe', execute: () => {} }]
      }
    ]

    const merged = mergeEditorContributions(contributions, ['callout'])

    expect(merged.blockSpecs).toEqual({})
    // Behavior-only contributions are skew-safe and survive.
    expect(merged.slashMenuItems).toHaveLength(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rogueBlock'))
  })

  it('keeps bundled spec names without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const merged = mergeEditorContributions(
      [{ id: 'ok', blockSpecs: { callout: 'spec' } }],
      ['callout']
    )

    expect(merged.blockSpecs.callout).toBe('spec')
    expect(warn).not.toHaveBeenCalled()
  })
})
