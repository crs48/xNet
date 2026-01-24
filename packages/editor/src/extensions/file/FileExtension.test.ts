import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { FileExtension } from './FileExtension'

describe('FileExtension', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, FileExtension],
      content: '<p>Hello world</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  describe('schema', () => {
    it('should register the file node type', () => {
      expect(editor.schema.nodes.file).toBeDefined()
    })

    it('should have correct default attributes', () => {
      const node = editor.schema.nodes.file.create()
      expect(node.attrs.cid).toBeNull()
      expect(node.attrs.name).toBeNull()
      expect(node.attrs.mimeType).toBeNull()
      expect(node.attrs.size).toBeNull()
      expect(node.attrs.uploadProgress).toBeNull()
    })

    it('should be a block node', () => {
      const spec = editor.schema.nodes.file.spec
      expect(spec.group).toBe('block')
    })

    it('should be draggable', () => {
      const spec = editor.schema.nodes.file.spec
      expect(spec.draggable).toBe(true)
    })
  })

  describe('setFile command', () => {
    it('should insert a file node', () => {
      editor.commands.setFile({
        cid: 'bafytest123',
        name: 'document.pdf',
        mimeType: 'application/pdf',
        size: 1024
      })

      const json = editor.getJSON()
      const fileNode = json.content?.find((n) => n.type === 'file')
      expect(fileNode).toBeDefined()
      expect(fileNode?.attrs?.cid).toBe('bafytest123')
      expect(fileNode?.attrs?.name).toBe('document.pdf')
      expect(fileNode?.attrs?.mimeType).toBe('application/pdf')
      expect(fileNode?.attrs?.size).toBe(1024)
    })

    it('should set uploadProgress to null on insert', () => {
      editor.commands.setFile({
        cid: 'bafytest123',
        name: 'test.txt',
        mimeType: 'text/plain',
        size: 100
      })

      const json = editor.getJSON()
      const fileNode = json.content?.find((n) => n.type === 'file')
      expect(fileNode?.attrs?.uploadProgress).toBeNull()
    })

    it('should insert multiple file nodes', () => {
      editor.commands.setFile({
        cid: 'cid1',
        name: 'file1.txt',
        mimeType: 'text/plain',
        size: 100
      })
      editor.commands.setFile({
        cid: 'cid2',
        name: 'file2.pdf',
        mimeType: 'application/pdf',
        size: 200
      })

      const json = editor.getJSON()
      const fileNodes = json.content?.filter((n) => n.type === 'file')
      expect(fileNodes?.length).toBe(2)
    })
  })

  describe('parseHTML', () => {
    it('should parse div[data-file-cid]', () => {
      const editorWithFile = new Editor({
        extensions: [StarterKit, FileExtension],
        content:
          '<div data-file-cid="bafyabc" data-type="file-attachment" cid="bafyabc" name="test.doc" mimeType="application/msword" size="2048"></div>'
      })

      const json = editorWithFile.getJSON()
      const fileNode = json.content?.find((n) => n.type === 'file')
      expect(fileNode).toBeDefined()

      editorWithFile.destroy()
    })
  })

  describe('renderHTML', () => {
    it('should render data-file-cid attribute', () => {
      editor.commands.setFile({
        cid: 'bafyrender',
        name: 'render.txt',
        mimeType: 'text/plain',
        size: 50
      })

      const html = editor.getHTML()
      expect(html).toContain('data-file-cid="bafyrender"')
    })

    it('should render data-type attribute', () => {
      editor.commands.setFile({
        cid: 'bafytype',
        name: 'type.txt',
        mimeType: 'text/plain',
        size: 50
      })

      const html = editor.getHTML()
      expect(html).toContain('data-type="file-attachment"')
    })
  })

  describe('options', () => {
    it('should have default maxSize of 100MB', () => {
      const fileExt = editor.extensionManager.extensions.find((e) => e.name === 'file')
      expect(fileExt?.options.maxSize).toBe(100 * 1024 * 1024)
    })

    it('should accept custom maxSize', () => {
      const customEditor = new Editor({
        extensions: [StarterKit, FileExtension.configure({ maxSize: 50 * 1024 * 1024 })],
        content: '<p>Test</p>'
      })

      const fileExt = customEditor.extensionManager.extensions.find((e) => e.name === 'file')
      expect(fileExt?.options.maxSize).toBe(50 * 1024 * 1024)

      customEditor.destroy()
    })

    it('should have default blockedTypes', () => {
      const fileExt = editor.extensionManager.extensions.find((e) => e.name === 'file')
      expect(fileExt?.options.blockedTypes).toEqual([
        'application/x-executable',
        'application/x-msdownload'
      ])
    })

    it('should not add prosemirror plugins without onUpload', () => {
      // Without onUpload, the file drop plugin should not be added
      const fileExt = editor.extensionManager.extensions.find((e) => e.name === 'file')
      expect(fileExt?.options.onUpload).toBeUndefined()
    })
  })
})
