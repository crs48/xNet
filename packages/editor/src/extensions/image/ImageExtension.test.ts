import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ImageExtension } from './ImageExtension'

describe('ImageExtension', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, ImageExtension],
      content: '<p>Hello world</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  describe('schema', () => {
    it('should register the image node type', () => {
      expect(editor.schema.nodes.image).toBeDefined()
    })

    it('should have correct default attributes', () => {
      const attrs = editor.schema.nodes.image.spec.attrs
      expect(attrs).toBeDefined()
      // Check defaults via a created node
      const node = editor.schema.nodes.image.create()
      expect(node.attrs.alignment).toBe('center')
      expect(node.attrs.src).toBeNull()
      expect(node.attrs.alt).toBeNull()
      expect(node.attrs.width).toBeNull()
      expect(node.attrs.height).toBeNull()
      expect(node.attrs.cid).toBeNull()
      expect(node.attrs.uploadProgress).toBeNull()
    })

    it('should be a block node by default', () => {
      const spec = editor.schema.nodes.image.spec
      // group is computed via a function in the extension
      expect(spec.inline).toBeFalsy()
    })

    it('should be draggable', () => {
      const spec = editor.schema.nodes.image.spec
      expect(spec.draggable).toBe(true)
    })
  })

  describe('setImage command', () => {
    it('should insert an image node', () => {
      editor.commands.setImage({
        src: 'https://example.com/image.jpg',
        alt: 'Test image'
      })

      const json = editor.getJSON()
      const imageNode = json.content?.find((n) => n.type === 'image')
      expect(imageNode).toBeDefined()
      expect(imageNode?.attrs?.src).toBe('https://example.com/image.jpg')
      expect(imageNode?.attrs?.alt).toBe('Test image')
    })

    it('should set default alignment to center', () => {
      editor.commands.setImage({
        src: 'https://example.com/image.jpg'
      })

      const json = editor.getJSON()
      const imageNode = json.content?.find((n) => n.type === 'image')
      expect(imageNode?.attrs?.alignment).toBe('center')
    })

    it('should accept custom alignment', () => {
      editor.commands.setImage({
        src: 'https://example.com/image.jpg',
        alignment: 'left'
      })

      const json = editor.getJSON()
      const imageNode = json.content?.find((n) => n.type === 'image')
      expect(imageNode?.attrs?.alignment).toBe('left')
    })

    it('should accept width and height', () => {
      editor.commands.setImage({
        src: 'https://example.com/image.jpg',
        width: 800,
        height: 600
      })

      const json = editor.getJSON()
      const imageNode = json.content?.find((n) => n.type === 'image')
      expect(imageNode?.attrs?.width).toBe(800)
      expect(imageNode?.attrs?.height).toBe(600)
    })

    it('should accept cid attribute', () => {
      editor.commands.setImage({
        src: 'blob:http://localhost/abc',
        cid: 'bafk1234567890'
      })

      const json = editor.getJSON()
      const imageNode = json.content?.find((n) => n.type === 'image')
      expect(imageNode?.attrs?.cid).toBe('bafk1234567890')
    })

    it('should accept uploadProgress', () => {
      editor.commands.setImage({
        src: '',
        uploadProgress: 50
      })

      const json = editor.getJSON()
      const imageNode = json.content?.find((n) => n.type === 'image')
      expect(imageNode?.attrs?.uploadProgress).toBe(50)
    })
  })

  describe('updateImage command', () => {
    it('should update alt text via setNodeMarkup', () => {
      editor.commands.setImage({
        src: 'https://example.com/image.jpg'
      })

      // Find the image node and update it directly via transaction
      let imagePos = -1
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'image') {
          imagePos = pos
          return false
        }
      })

      expect(imagePos).toBeGreaterThanOrEqual(0)

      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(imagePos, undefined, {
          ...editor.state.doc.nodeAt(imagePos)!.attrs,
          alt: 'Updated alt'
        })
      )

      const json = editor.getJSON()
      const imageNode = json.content?.find((n) => n.type === 'image')
      expect(imageNode?.attrs?.alt).toBe('Updated alt')
    })

    it('should update alignment via setNodeMarkup', () => {
      editor.commands.setImage({
        src: 'https://example.com/image.jpg'
      })

      let imagePos = -1
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'image') {
          imagePos = pos
          return false
        }
      })

      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(imagePos, undefined, {
          ...editor.state.doc.nodeAt(imagePos)!.attrs,
          alignment: 'right'
        })
      )

      const json = editor.getJSON()
      const imageNode = json.content?.find((n) => n.type === 'image')
      expect(imageNode?.attrs?.alignment).toBe('right')
    })

    it('should update width via setNodeMarkup', () => {
      editor.commands.setImage({
        src: 'https://example.com/image.jpg',
        width: 400
      })

      let imagePos = -1
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'image') {
          imagePos = pos
          return false
        }
      })

      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(imagePos, undefined, {
          ...editor.state.doc.nodeAt(imagePos)!.attrs,
          width: 600
        })
      )

      const json = editor.getJSON()
      const imageNode = json.content?.find((n) => n.type === 'image')
      expect(imageNode?.attrs?.width).toBe(600)
    })
  })

  describe('parseHTML', () => {
    it('should parse img tags with src', () => {
      const editorWithContent = new Editor({
        extensions: [StarterKit, ImageExtension],
        content: '<img src="https://example.com/test.png" alt="parsed">'
      })

      const json = editorWithContent.getJSON()
      const imageNode = json.content?.find((n) => n.type === 'image')
      expect(imageNode).toBeDefined()
      expect(imageNode?.attrs?.src).toBe('https://example.com/test.png')
      expect(imageNode?.attrs?.alt).toBe('parsed')

      editorWithContent.destroy()
    })
  })

  describe('renderHTML', () => {
    it('should render data-cid attribute', () => {
      editor.commands.setImage({
        src: 'blob:http://localhost/abc',
        cid: 'bafk123'
      })

      const html = editor.getHTML()
      expect(html).toContain('data-cid="bafk123"')
    })

    it('should render data-alignment attribute', () => {
      editor.commands.setImage({
        src: 'https://example.com/image.jpg',
        alignment: 'left'
      })

      const html = editor.getHTML()
      expect(html).toContain('data-alignment="left"')
    })
  })

  describe('options', () => {
    it('should have default maxSize of 10MB', () => {
      const ext = editor.extensionManager.extensions.find((e) => e.name === 'image')
      expect(ext?.options.maxSize).toBe(10 * 1024 * 1024)
    })

    it('should have default allowed MIME types', () => {
      const ext = editor.extensionManager.extensions.find((e) => e.name === 'image')
      expect(ext?.options.allowedMimeTypes).toContain('image/jpeg')
      expect(ext?.options.allowedMimeTypes).toContain('image/png')
      expect(ext?.options.allowedMimeTypes).toContain('image/gif')
      expect(ext?.options.allowedMimeTypes).toContain('image/webp')
      expect(ext?.options.allowedMimeTypes).toContain('image/svg+xml')
    })

    it('should accept custom options', () => {
      const customEditor = new Editor({
        extensions: [
          StarterKit,
          ImageExtension.configure({
            maxSize: 5 * 1024 * 1024,
            inline: true
          })
        ]
      })

      const ext = customEditor.extensionManager.extensions.find((e) => e.name === 'image')
      expect(ext?.options.maxSize).toBe(5 * 1024 * 1024)

      customEditor.destroy()
    })
  })

  describe('paste plugin', () => {
    it('should not add paste plugin when onUpload is not provided', () => {
      // The default editor has no onUpload, so no paste plugin
      const plugins = editor.view.state.plugins
      const pastePlugin = plugins.find((p) => (p as any).key === 'imagePaste$')
      expect(pastePlugin).toBeUndefined()
    })

    it('should add paste plugin when onUpload is provided', () => {
      const uploadEditor = new Editor({
        extensions: [
          StarterKit,
          ImageExtension.configure({
            onUpload: async () => ({ src: 'test.jpg' })
          })
        ]
      })

      const plugins = uploadEditor.view.state.plugins
      const pastePlugin = plugins.find((p) => (p as any).key === 'imagePaste$')
      expect(pastePlugin).toBeDefined()

      uploadEditor.destroy()
    })
  })
})
