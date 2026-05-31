import type { Slice } from '@tiptap/pm/model'
import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import '@tiptap/markdown'

export const markdownClipboardPluginKey = new PluginKey('markdownClipboard')

const MARKDOWN_PATTERNS = [
  /^\s{0,3}#{1,6}\s+\S/m,
  /^\s{0,3}>\s+\S/m,
  /^\s{0,3}(?:[-+*]|\d+\.)\s+\S/m,
  /^\s{0,3}[-+*]\s+\[[ xX]\]\s+\S/m,
  /^```[\s\S]*```/m,
  /!\[[^\]]*]\([^)]+\)/,
  /\[[^\]]+]\([^)]+\)/,
  /\*\*[^*\n][\s\S]*?\*\*/,
  /~~[^~\n][\s\S]*?~~/,
  /`[^`\n]+`/
] as const

function hasHtmlClipboardPayload(event: ClipboardEvent): boolean {
  return (event.clipboardData?.getData('text/html') ?? '').trim().length > 0
}

export function isMarkdownClipboardCandidate(text: string): boolean {
  const trimmed = text.trim()

  if (!trimmed) return false
  if (/^https?:\/\/\S+$/i.test(trimmed)) return false

  return MARKDOWN_PATTERNS.some((pattern) => pattern.test(trimmed))
}

function serializeSliceAsMarkdown(slice: Slice, editor: Editor): string {
  if (editor.markdown) {
    return editor.markdown.serialize({ type: 'doc', content: slice.content.toJSON() }).trimEnd()
  }

  return slice.content.textBetween(0, slice.content.size, '\n\n')
}

export const MarkdownClipboard = Extension.create({
  name: 'markdownClipboard',

  priority: 900,

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin({
        key: markdownClipboardPluginKey,
        props: {
          handlePaste(_view, event) {
            if (hasHtmlClipboardPayload(event)) return false

            const text = event.clipboardData?.getData('text/plain') ?? ''
            if (!isMarkdownClipboardCandidate(text)) return false

            event.preventDefault()

            return editor.commands.insertContent(text, { contentType: 'markdown' })
          },

          clipboardTextSerializer(slice) {
            return serializeSliceAsMarkdown(slice, editor)
          }
        }
      })
    ]
  }
})
