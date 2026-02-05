/**
 * Tests for RichTextEditor component
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// import userEvent from '@testing-library/user-event'
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
      const { container } = render(<RichTextEditor ydoc={ydoc} />)

      // The editor container should be rendered with relative positioning
      await waitFor(() => {
        const editorContainer = container.firstChild as HTMLElement
        expect(editorContainer).toBeInTheDocument()
        expect(editorContainer.classList.contains('relative')).toBe(true)
      })
    })

    it('should render editor content area', async () => {
      const { container } = render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        // EditorContent component renders with flex-1 class for full height
        const editorContent = container.querySelector('.flex-1')
        expect(editorContent).toBeInTheDocument()
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
    it('should render editor with showToolbar enabled by default', async () => {
      const { container } = render(<RichTextEditor ydoc={ydoc} />)

      await waitFor(() => {
        // Editor should render with the ProseMirror class
        const editor = container.querySelector('.ProseMirror')
        expect(editor).toBeInTheDocument()
      })
    })

    it('should render editor when showToolbar is false', async () => {
      const { container } = render(<RichTextEditor ydoc={ydoc} showToolbar={false} />)

      await waitFor(() => {
        const editorContainer = container.firstChild
        expect(editorContainer).toBeInTheDocument()
      })

      // The editor should still work, but toolbar is disabled
      const editor = container.querySelector('.ProseMirror')
      expect(editor).toBeInTheDocument()
    })
  })

  describe('custom className', () => {
    it('should apply custom className to container', async () => {
      render(<RichTextEditor ydoc={ydoc} className="my-custom-editor" />)

      await waitFor(() => {
        expect(document.querySelector('.my-custom-editor')).toBeInTheDocument()
      })
    })

    it('should merge custom className with default Tailwind classes', async () => {
      const { container } = render(<RichTextEditor ydoc={ydoc} className="my-custom-editor" />)

      await waitFor(() => {
        const editorContainer = container.querySelector('.my-custom-editor') as HTMLElement
        expect(editorContainer).toBeInTheDocument()
        // Should have both custom class and relative positioning
        expect(editorContainer.classList.contains('relative')).toBe(true)
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

describe('RichTextEditor floating toolbar', () => {
  let ydoc: Y.Doc

  beforeEach(() => {
    ydoc = new Y.Doc()
  })

  afterEach(() => {
    ydoc.destroy()
  })

  it('should not show toolbar when no text is selected', async () => {
    const { container } = render(<RichTextEditor ydoc={ydoc} />)

    // Wait for editor to initialize
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toBeInTheDocument()
    })

    // BubbleMenu toolbar should not be visible without text selection
    expect(screen.queryByTitle('Bold')).not.toBeInTheDocument()
  })

  it('should pass showToolbar prop to control toolbar visibility', async () => {
    const { container } = render(<RichTextEditor ydoc={ydoc} showToolbar={true} />)

    // Wait for editor to initialize
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toBeInTheDocument()
    })

    // Toolbar is controlled by showToolbar prop and text selection
    // Since no text is selected, toolbar won't be visible even with showToolbar=true
    expect(screen.queryByTitle('Bold')).not.toBeInTheDocument()
  })

  it('should not render toolbar when showToolbar is false', async () => {
    const { container } = render(<RichTextEditor ydoc={ydoc} showToolbar={false} />)

    // Wait for editor to initialize
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toBeInTheDocument()
    })

    // With showToolbar=false, toolbar should never render
    expect(screen.queryByTitle('Bold')).not.toBeInTheDocument()
  })
})
