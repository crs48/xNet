import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PageEmbedExtension } from './PageEmbedExtension'

describe('PageEmbedExtension', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, PageEmbedExtension],
      content: '<p>Hello world</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  describe('schema', () => {
    it('registers a selectable block atom', () => {
      const spec = editor.schema.nodes.pageEmbed.spec

      expect(spec.group).toBe('block')
      expect(spec.atom).toBe(true)
      expect(spec.selectable).toBe(true)
      expect(spec.draggable).toBe(true)
      expect(spec.isolating).toBe(true)
    })

    it('has page-focused default attributes', () => {
      const node = editor.schema.nodes.pageEmbed.create()

      expect(node.attrs.pageId).toBeNull()
      expect(node.attrs.title).toBeNull()
      expect(node.attrs.subtitle).toBeNull()
      expect(node.attrs.icon).toBe('PG')
      expect(node.attrs.preview).toBeNull()
    })
  })

  describe('setPageEmbed command', () => {
    it('inserts a page embed with normalized attributes', () => {
      const result = editor.commands.setPageEmbed({
        pageId: ' default/roadmap ',
        title: ' Roadmap ',
        subtitle: ' Planning page ',
        icon: 'RD',
        preview: ' Next milestones and launch notes. '
      })

      expect(result).toBe(true)
      expect(editor.getJSON().content?.find((node) => node.type === 'pageEmbed')).toMatchObject({
        attrs: {
          pageId: 'default/roadmap',
          title: 'Roadmap',
          subtitle: 'Planning page',
          icon: 'RD',
          preview: 'Next milestones and launch notes.'
        }
      })
    })

    it('uses page id as the fallback title', () => {
      editor.commands.setPageEmbed({ pageId: 'default/notes' })

      expect(editor.getJSON().content?.find((node) => node.type === 'pageEmbed')).toMatchObject({
        attrs: {
          pageId: 'default/notes',
          title: 'default/notes',
          icon: 'PG'
        }
      })
    })

    it('rejects blank page ids', () => {
      expect(editor.commands.setPageEmbed({ pageId: '   ' })).toBe(false)
      expect(editor.getJSON().content?.some((node) => node.type === 'pageEmbed')).toBe(false)
    })
  })

  describe('updatePageEmbed command', () => {
    it('updates metadata on the selected page embed', () => {
      editor.commands.setPageEmbed({ pageId: 'default/roadmap', title: 'Roadmap' })
      const position = findPageEmbedPos(editor)
      editor.commands.setNodeSelection(position)

      expect(
        editor.commands.updatePageEmbed({
          title: 'Product Roadmap',
          subtitle: 'Updated overview',
          preview: 'Release plan'
        })
      ).toBe(true)

      expect(editor.getJSON().content?.find((node) => node.type === 'pageEmbed')).toMatchObject({
        attrs: {
          title: 'Product Roadmap',
          subtitle: 'Updated overview',
          preview: 'Release plan'
        }
      })
    })
  })

  describe('HTML serialization', () => {
    it('renders page embed data attributes', () => {
      editor.commands.setPageEmbed({ pageId: 'default/roadmap', title: 'Roadmap' })

      expect(editor.getHTML()).toContain('data-page-embed')
      expect(editor.getHTML()).toContain('data-page-id="default/roadmap"')
    })

    it('parses page embed HTML', () => {
      const htmlEditor = new Editor({
        extensions: [StarterKit, PageEmbedExtension],
        content:
          '<article data-page-embed data-page-id="default/spec" pageId="default/spec" title="Spec"></article>'
      })

      expect(htmlEditor.getJSON().content?.[0]).toMatchObject({
        type: 'pageEmbed',
        attrs: { pageId: 'default/spec', title: 'Spec' }
      })

      htmlEditor.destroy()
    })
  })
})

function findPageEmbedPos(editor: Editor): number {
  let pos = -1
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === 'pageEmbed' && pos === -1) {
      pos = nodePos
      return false
    }
  })
  return pos
}
