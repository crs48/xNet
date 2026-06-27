/**
 * Charter §Agency receipt: AI-authored text discloses itself in the editor —
 * a provenance mark carrying the assist mode and cited sources, rendered as a
 * badge with a sources tooltip, that round-trips through HTML.
 */
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { AiGeneratedMark, aiGeneratedTitle } from './AiGeneratedMark'

function makeEditor(content = '<p>hello world</p>'): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, AiGeneratedMark],
    content
  })
}

function aiMarkAttrs(editor: Editor): Record<string, unknown> | null {
  let attrs: Record<string, unknown> | null = null
  editor.state.doc.descendants((node) => {
    const mark = node.marks.find((m) => m.type.name === 'aiGenerated')
    if (mark) attrs = mark.attrs
  })
  return attrs
}

describe('AiGeneratedMark', () => {
  it('marks a range with assist mode + citations', () => {
    const editor = makeEditor()
    const citations = [{ nodeId: 'n1', title: 'Source A' }]
    editor.commands.setAiGeneratedRange(1, 6, { assistMode: 'draft', citations })

    expect(aiMarkAttrs(editor)).toEqual({ assistMode: 'draft', citations })
    editor.destroy()
  })

  it('defaults to scaffold with no citations', () => {
    const editor = makeEditor()
    editor.commands.setAiGeneratedRange(1, 6)
    expect(aiMarkAttrs(editor)).toEqual({ assistMode: 'scaffold', citations: null })
    editor.destroy()
  })

  it('renders a disclosing badge with a sources tooltip', () => {
    const editor = makeEditor()
    editor.commands.setAiGeneratedRange(1, 6, {
      assistMode: 'scaffold',
      citations: [{ nodeId: 'n1', title: 'Roadmap' }]
    })
    const html = editor.getHTML()

    expect(html).toContain('data-ai-generated')
    expect(html).toContain('xnet-ai-generated-mark')
    expect(html).toContain('data-assist-mode="scaffold"')
    expect(html).toContain('Sources: Roadmap')
    editor.destroy()
  })

  it('round-trips provenance through HTML', () => {
    const first = makeEditor()
    first.commands.setAiGeneratedRange(1, 6, {
      assistMode: 'draft',
      citations: [{ nodeId: 'n2', title: 'Spec' }]
    })
    const restored = makeEditor(first.getHTML())

    expect(aiMarkAttrs(restored)).toEqual({
      assistMode: 'draft',
      citations: [{ nodeId: 'n2', title: 'Spec' }]
    })
    first.destroy()
    restored.destroy()
  })

  it('unsets the mark', () => {
    const editor = makeEditor()
    editor.commands.setAiGeneratedRange(1, 6)
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.commands.unsetAiGenerated()
    expect(aiMarkAttrs(editor)).toBeNull()
    editor.destroy()
  })

  it('aiGeneratedTitle summarizes provenance + sources', () => {
    expect(aiGeneratedTitle({ assistMode: 'scaffold', citations: null })).toBe(
      'AI-generated · scaffold'
    )
    expect(
      aiGeneratedTitle({
        assistMode: 'draft',
        citations: [
          { nodeId: 'a', title: 'A' },
          { nodeId: 'b', title: 'B' }
        ]
      })
    ).toBe('AI-generated · draft · Sources: A, B')
  })
})
