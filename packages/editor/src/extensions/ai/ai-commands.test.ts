/**
 * Tests for the AI-in-the-editor core (0194 Phase 3).
 */

import { describe, it, expect, vi } from 'vitest'
import {
  AI_INTENTS,
  applyAiTransform,
  createAiSlashCommands,
  selectedText,
  type AiEditorLike
} from './ai-commands'

/** A fake editor recording the chain calls the transform makes. */
function fakeEditor(text: string, from = 0, to = text.length) {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const chain = {
    focus: () => chain,
    insertContentAt: (...args: unknown[]) => (
      calls.push({ method: 'insertContentAt', args }),
      chain
    ),
    deleteRange: (...args: unknown[]) => (calls.push({ method: 'deleteRange', args }), chain),
    run: () => true
  }
  const editor: AiEditorLike = {
    state: {
      selection: { from, to },
      doc: { textBetween: (a, b) => text.slice(a, b) }
    },
    chain: () => chain
  }
  return { editor, calls }
}

describe('selectedText', () => {
  it('returns the text between the selection bounds', () => {
    const { editor } = fakeEditor('hello world', 0, 5)
    expect(selectedText(editor)).toBe('hello')
  })
})

describe('applyAiTransform', () => {
  it('transforms the selection and replaces it with the result', async () => {
    const { editor, calls } = fakeEditor('the cat sat')
    const transform = vi.fn().mockResolvedValue('THE CAT SAT')
    const result = await applyAiTransform(editor, 'improve', { transform })

    expect(transform).toHaveBeenCalledWith({ intent: 'improve', selectedText: 'the cat sat' })
    expect(result).toBe('THE CAT SAT')
    expect(calls).toContainEqual({
      method: 'insertContentAt',
      args: [{ from: 0, to: 11 }, 'THE CAT SAT']
    })
  })

  it('does nothing when there is no selection', async () => {
    const { editor, calls } = fakeEditor('   ', 0, 3) // whitespace only
    const transform = vi.fn()
    const result = await applyAiTransform(editor, 'rewrite', { transform })
    expect(result).toBeNull()
    expect(transform).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('routes transform errors to onError and never throws', async () => {
    const { editor } = fakeEditor('text')
    const onError = vi.fn()
    const transform = vi.fn().mockRejectedValue(new Error('model offline'))
    const result = await applyAiTransform(editor, 'summarize', { transform, onError })
    expect(result).toBeNull()
    expect(onError).toHaveBeenCalledOnce()
  })
})

describe('createAiSlashCommands', () => {
  it('produces one slash item per AI intent', () => {
    const items = createAiSlashCommands({ transform: vi.fn() })
    expect(items).toHaveLength(AI_INTENTS.length)
    expect(items.map((i) => i.title)).toContain('AI: Improve writing')
    expect(items.every((i) => i.searchTerms?.includes('ai'))).toBe(true)
  })

  it('the command drops the slash trigger then transforms the selection', async () => {
    const { editor, calls } = fakeEditor('draft text')
    const transform = vi.fn().mockResolvedValue('polished')
    const [item] = createAiSlashCommands({ transform })

    item.command({ editor: editor as never, range: { from: 0, to: 1 } })
    await vi.waitFor(() => expect(transform).toHaveBeenCalled())

    expect(calls[0]).toEqual({ method: 'deleteRange', args: [{ from: 0, to: 1 }] })
    expect(transform).toHaveBeenCalledWith({ intent: 'improve', selectedText: 'draft text' })
  })
})
