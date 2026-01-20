/**
 * Tests for RichTextEditor component
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as Y from 'yjs'
import { RichTextEditor } from './RichTextEditor'

describe('RichTextEditor', () => {
  let ydoc: Y.Doc

  beforeEach(() => {
    ydoc = new Y.Doc()
  })

  afterEach(() => {
    ydoc.destroy()
  })

  describe('initialization', () => {
    it('should render editor container', async () => {
      render(<RichTextEditor ydoc={ydoc} />)

      // The editor container should be rendered
      await waitFor(() => {
        expect(document.querySelector('.editor-container')).toBeInTheDocument()
      })
    })

    it('should render editor content area', async () => {
      render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        expect(document.querySelector('.editor-content')).toBeInTheDocument()
      })
    })

    it('should render ProseMirror editor', async () => {
      render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
      })
    })

    it('should show placeholder text', async () => {
      render(<RichTextEditor ydoc={ydoc} placeholder="Start typing..." />)

      await waitFor(() => {
        const placeholder = document.querySelector('[data-placeholder]')
        expect(placeholder?.getAttribute('data-placeholder')).toBe('Start typing...')
      })
    })

    it('should use default placeholder', async () => {
      render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        const placeholder = document.querySelector('[data-placeholder]')
        expect(placeholder?.getAttribute('data-placeholder')).toBe('Start writing...')
      })
    })
  })

  describe('toolbar visibility', () => {
    it('should render toolbar by default', async () => {
      render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        expect(document.querySelector('.editor-toolbar')).toBeInTheDocument()
      })
    })

    it('should hide toolbar when showToolbar is false', async () => {
      render(<RichTextEditor ydoc={ydoc} showToolbar={false} />)

      await waitFor(() => {
        expect(document.querySelector('.editor-container')).toBeInTheDocument()
      })

      expect(document.querySelector('.editor-toolbar')).not.toBeInTheDocument()
    })
  })

  describe('custom className', () => {
    it('should apply custom className to container', async () => {
      render(<RichTextEditor ydoc={ydoc} className="my-custom-editor" />)

      await waitFor(() => {
        expect(document.querySelector('.my-custom-editor')).toBeInTheDocument()
      })
    })

    it('should preserve editor-container class', async () => {
      render(<RichTextEditor ydoc={ydoc} className="my-custom-editor" />)

      await waitFor(() => {
        const container = document.querySelector('.my-custom-editor')
        expect(container?.classList.contains('editor-container')).toBe(true)
      })
    })
  })

  describe('Yjs collaboration', () => {
    it('should create XmlFragment with specified field name', async () => {
      render(<RichTextEditor ydoc={ydoc} field="customField" />)

      await waitFor(() => {
        expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
      })

      // Verify the XmlFragment was created
      const fragment = ydoc.getXmlFragment('customField')
      expect(fragment).toBeDefined()
    })

    it('should use default field name "content"', async () => {
      render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
      })

      const fragment = ydoc.getXmlFragment('content')
      expect(fragment).toBeDefined()
    })
  })

  describe('read-only mode', () => {
    it('should be editable by default', async () => {
      render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        const editor = document.querySelector('.ProseMirror')
        expect(editor?.getAttribute('contenteditable')).toBe('true')
      })
    })

    it('should not be editable when readOnly is true', async () => {
      render(<RichTextEditor ydoc={ydoc} readOnly={true} />)

      await waitFor(() => {
        const editor = document.querySelector('.ProseMirror')
        expect(editor?.getAttribute('contenteditable')).toBe('false')
      })
    })
  })

  describe('navigation callback', () => {
    it('should accept onNavigate prop without error', async () => {
      const onNavigate = vi.fn()

      // Should not throw
      expect(() => {
        render(<RichTextEditor ydoc={ydoc} onNavigate={onNavigate} />)
      }).not.toThrow()

      await waitFor(() => {
        expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
      })
    })
  })

  describe('cleanup', () => {
    it('should unmount without errors', async () => {
      const { unmount } = render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
      })

      // Should not throw
      expect(() => unmount()).not.toThrow()
    })
  })
})

describe('RichTextEditor toolbar integration', () => {
  let ydoc: Y.Doc

  beforeEach(() => {
    ydoc = new Y.Doc()
  })

  afterEach(() => {
    ydoc.destroy()
  })

  it('should render all toolbar buttons', async () => {
    render(<RichTextEditor ydoc={ydoc} />)

    await waitFor(() => {
      expect(screen.getByTitle('Bold (Cmd+B)')).toBeInTheDocument()
      expect(screen.getByTitle('Italic (Cmd+I)')).toBeInTheDocument()
      expect(screen.getByTitle('Strikethrough')).toBeInTheDocument()
      expect(screen.getByTitle('Inline Code')).toBeInTheDocument()
      expect(screen.getByTitle('Heading 1')).toBeInTheDocument()
      expect(screen.getByTitle('Heading 2')).toBeInTheDocument()
      expect(screen.getByTitle('Heading 3')).toBeInTheDocument()
      expect(screen.getByTitle('Bullet List')).toBeInTheDocument()
      expect(screen.getByTitle('Numbered List')).toBeInTheDocument()
      expect(screen.getByTitle('Task List')).toBeInTheDocument()
      expect(screen.getByTitle('Quote')).toBeInTheDocument()
      expect(screen.getByTitle('Code Block')).toBeInTheDocument()
      expect(screen.getByTitle('Horizontal Rule')).toBeInTheDocument()
    })
  })

  it('should allow clicking toolbar buttons without error', async () => {
    const user = userEvent.setup()
    render(<RichTextEditor ydoc={ydoc} />)

    await waitFor(() => {
      expect(screen.getByTitle('Bold (Cmd+B)')).toBeInTheDocument()
    })

    const boldButton = screen.getByTitle('Bold (Cmd+B)')

    // Should not throw when clicking
    await expect(user.click(boldButton)).resolves.not.toThrow()
  })

  it('should render toolbar dividers', async () => {
    render(<RichTextEditor ydoc={ydoc} />)

    await waitFor(() => {
      const dividers = document.querySelectorAll('.toolbar-divider')
      expect(dividers.length).toBe(3)
    })
  })
})
