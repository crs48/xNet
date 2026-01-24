import { Extension } from '@tiptap/core'
import { createInlineMarksPlugin, type InlineMarksPluginOptions } from './inline-marks'
import { createLinkPreviewPlugin } from './link-preview'

export interface LivePreviewOptions extends InlineMarksPluginOptions {
  /** Enable link syntax preview */
  links?: boolean
}

/**
 * LivePreview extension for Obsidian-style markdown editing.
 *
 * Shows markdown syntax (like ** for bold) when the cursor is inside
 * or adjacent to formatted text. Hides syntax when cursor moves away.
 *
 * @example
 * ```ts
 * import { LivePreview } from '@xnet/editor/extensions'
 *
 * const editor = useEditor({
 *   extensions: [
 *     StarterKit,
 *     LivePreview.configure({
 *       marks: ['bold', 'italic', 'code'],
 *       links: true,
 *     }),
 *   ]
 * })
 * ```
 */
export const LivePreview = Extension.create<LivePreviewOptions>({
  name: 'livePreview',

  addOptions() {
    return {
      marks: ['bold', 'italic', 'strike', 'code'],
      links: true,
      syntaxClass: 'md-syntax'
    }
  },

  addProseMirrorPlugins() {
    const plugins = [
      createInlineMarksPlugin({
        marks: this.options.marks,
        syntaxClass: this.options.syntaxClass
      })
    ]

    if (this.options.links) {
      plugins.push(createLinkPreviewPlugin())
    }

    return plugins
  }
})

// Re-exports
export { MARK_SYNTAX, getSyntax, getEnabledMarks } from './syntax'
export { findMarkRange } from './mark-range'
export { createInlineMarksPlugin, inlineMarksPluginKey } from './inline-marks'
export { createLinkPreviewPlugin, linkPreviewPluginKey } from './link-preview'
export type { InlineMarksPluginOptions }
export type { MarkSyntax } from './syntax'
export type { MarkRange } from './mark-range'
