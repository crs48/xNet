import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EmbedExtension } from './EmbedExtension'

describe('EmbedExtension', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, EmbedExtension],
      content: '<p>Hello world</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  describe('schema', () => {
    it('should register the embed node type', () => {
      expect(editor.schema.nodes.embed).toBeDefined()
    })

    it('should have correct default attributes', () => {
      const node = editor.schema.nodes.embed.create()
      expect(node.attrs.url).toBeNull()
      expect(node.attrs.provider).toBeNull()
      expect(node.attrs.embedId).toBeNull()
      expect(node.attrs.embedUrl).toBeNull()
      expect(node.attrs.title).toBeNull()
    })

    it('should be a block node', () => {
      const spec = editor.schema.nodes.embed.spec
      expect(spec.group).toBe('block')
    })

    it('should be draggable', () => {
      const spec = editor.schema.nodes.embed.spec
      expect(spec.draggable).toBe(true)
    })
  })

  describe('setEmbed command', () => {
    it('should insert a YouTube embed', () => {
      const result = editor.commands.setEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      expect(result).toBe(true)

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'embed')
      expect(embedNode).toBeDefined()
      expect(embedNode?.attrs?.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      expect(embedNode?.attrs?.provider).toBe('youtube')
      expect(embedNode?.attrs?.embedId).toBe('dQw4w9WgXcQ')
      expect(embedNode?.attrs?.embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('should insert a Vimeo embed', () => {
      editor.commands.setEmbed('https://vimeo.com/123456789')

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'embed')
      expect(embedNode?.attrs?.provider).toBe('vimeo')
      expect(embedNode?.attrs?.embedId).toBe('123456789')
      expect(embedNode?.attrs?.embedUrl).toBe('https://player.vimeo.com/video/123456789')
    })

    it('should insert a Spotify embed', () => {
      editor.commands.setEmbed('https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh')

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'embed')
      expect(embedNode?.attrs?.provider).toBe('spotify')
      expect(embedNode?.attrs?.embedId).toBe('track/4iV5W9uYEdYUVa79Axb7Rh')
    })

    it('should insert a Loom embed', () => {
      editor.commands.setEmbed('https://www.loom.com/share/abc123def456')

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'embed')
      expect(embedNode?.attrs?.provider).toBe('loom')
      expect(embedNode?.attrs?.embedUrl).toBe('https://www.loom.com/embed/abc123def456')
    })

    it('should return false for unsupported URLs', () => {
      const result = editor.commands.setEmbed('https://example.com/not-embeddable')
      expect(result).toBe(false)

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'embed')
      expect(embedNode).toBeUndefined()
    })

    it('should return false for empty URL', () => {
      const result = editor.commands.setEmbed('')
      expect(result).toBe(false)
    })

    it('should preserve original URL in url attribute', () => {
      const originalUrl = 'https://youtu.be/dQw4w9WgXcQ'
      editor.commands.setEmbed(originalUrl)

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'embed')
      expect(embedNode?.attrs?.url).toBe(originalUrl)
    })
  })

  describe('parseHTML', () => {
    it('should parse div[data-embed-url]', () => {
      const editorWithEmbed = new Editor({
        extensions: [StarterKit, EmbedExtension],
        content:
          '<div data-embed-url="https://youtube.com/watch?v=test" data-embed-provider="youtube" url="https://youtube.com/watch?v=test" provider="youtube" embedId="test" embedUrl="https://www.youtube.com/embed/test"></div>'
      })

      const json = editorWithEmbed.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'embed')
      expect(embedNode).toBeDefined()

      editorWithEmbed.destroy()
    })
  })

  describe('renderHTML', () => {
    it('should render data-embed-url attribute', () => {
      editor.commands.setEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')

      const html = editor.getHTML()
      expect(html).toContain('data-embed-url')
    })

    it('should render data-embed-provider attribute', () => {
      editor.commands.setEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')

      const html = editor.getHTML()
      expect(html).toContain('data-embed-provider="youtube"')
    })
  })

  describe('options', () => {
    it('should default autoEmbed to true', () => {
      const embedExt = editor.extensionManager.extensions.find((e) => e.name === 'embed')
      expect(embedExt?.options.autoEmbed).toBe(true)
    })

    it('should default allowedProviders to empty array', () => {
      const embedExt = editor.extensionManager.extensions.find((e) => e.name === 'embed')
      expect(embedExt?.options.allowedProviders).toEqual([])
    })

    it('should restrict to allowed providers', () => {
      const restrictedEditor = new Editor({
        extensions: [StarterKit, EmbedExtension.configure({ allowedProviders: ['youtube'] })],
        content: '<p>Test</p>'
      })

      // YouTube should work
      const ytResult = restrictedEditor.commands.setEmbed(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      )
      expect(ytResult).toBe(true)

      // Vimeo should be blocked
      const vimeoResult = restrictedEditor.commands.setEmbed('https://vimeo.com/123456789')
      expect(vimeoResult).toBe(false)

      restrictedEditor.destroy()
    })
  })
})
