/**
 * Tests for EditorToolbar component
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { EditorToolbar } from './EditorToolbar'

describe('EditorToolbar', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit, TaskList, TaskItem],
      content: '<p>Test content</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  describe('rendering', () => {
    it('should return null when editor is null', () => {
      const { container } = render(<EditorToolbar editor={null} />)
      expect(container.firstChild).toBeNull()
    })

    it('should render toolbar when editor is provided', () => {
      const { container } = render(<EditorToolbar editor={editor} />)
      // Toolbar should render a div with flex layout (Tailwind classes)
      const toolbar = container.firstChild as HTMLElement
      expect(toolbar).toBeInTheDocument()
      expect(toolbar.tagName).toBe('DIV')
    })

    it('should apply custom className', () => {
      render(<EditorToolbar editor={editor} className="my-toolbar" />)
      expect(document.querySelector('.my-toolbar')).toBeInTheDocument()
    })

    it('should merge custom className with default classes', () => {
      const { container } = render(<EditorToolbar editor={editor} className="my-toolbar" />)
      const toolbar = container.firstChild as HTMLElement
      expect(toolbar.classList.contains('my-toolbar')).toBe(true)
      // Should also have flex from Tailwind
      expect(toolbar.classList.contains('flex')).toBe(true)
    })
  })

  describe('text formatting buttons', () => {
    it('should render bold button', () => {
      render(<EditorToolbar editor={editor} />)
      expect(screen.getByTitle('Bold (Cmd+B)')).toBeInTheDocument()
    })

    it('should render italic button', () => {
      render(<EditorToolbar editor={editor} />)
      expect(screen.getByTitle('Italic (Cmd+I)')).toBeInTheDocument()
    })

    it('should render strikethrough button', () => {
      render(<EditorToolbar editor={editor} />)
      expect(screen.getByTitle('Strikethrough')).toBeInTheDocument()
    })

    it('should render inline code button', () => {
      render(<EditorToolbar editor={editor} />)
      expect(screen.getByTitle('Inline Code')).toBeInTheDocument()
    })
  })

  describe('heading buttons', () => {
    it('should render H1 button', () => {
      render(<EditorToolbar editor={editor} />)
      expect(screen.getByTitle('Heading 1')).toBeInTheDocument()
    })

    it('should render H2 button', () => {
      render(<EditorToolbar editor={editor} />)
      expect(screen.getByTitle('Heading 2')).toBeInTheDocument()
    })

    it('should render H3 button', () => {
      render(<EditorToolbar editor={editor} />)
      expect(screen.getByTitle('Heading 3')).toBeInTheDocument()
    })
  })

  describe('list buttons', () => {
    it('should render bullet list button', () => {
      render(<EditorToolbar editor={editor} />)
      expect(screen.getByTitle('Bullet List')).toBeInTheDocument()
    })

    it('should render numbered list button', () => {
      render(<EditorToolbar editor={editor} />)
      expect(screen.getByTitle('Numbered List')).toBeInTheDocument()
    })

    it('should render task list button', () => {
      render(<EditorToolbar editor={editor} />)
      expect(screen.getByTitle('Task List')).toBeInTheDocument()
    })
  })

  describe('block buttons', () => {
    it('should render quote button', () => {
      render(<EditorToolbar editor={editor} />)
      expect(screen.getByTitle('Quote')).toBeInTheDocument()
    })

    it('should render code block button', () => {
      render(<EditorToolbar editor={editor} />)
      expect(screen.getByTitle('Code Block')).toBeInTheDocument()
    })

    it('should render horizontal rule button', () => {
      render(<EditorToolbar editor={editor} />)
      expect(screen.getByTitle('Horizontal Rule')).toBeInTheDocument()
    })
  })

  describe('dividers', () => {
    it('should render toolbar dividers', () => {
      const { container } = render(<EditorToolbar editor={editor} />)
      // Dividers are now spans with w-px h-6 bg-border classes
      const dividers = container.querySelectorAll('span.w-px')
      expect(dividers.length).toBe(3)
    })
  })

  describe('button interactions', () => {
    it('should toggle bold when button is clicked', async () => {
      const user = userEvent.setup()
      render(<EditorToolbar editor={editor} />)

      editor.commands.selectAll()

      const boldButton = screen.getByTitle('Bold (Cmd+B)')
      await user.click(boldButton)

      expect(editor.isActive('bold')).toBe(true)
    })

    it('should toggle italic when button is clicked', async () => {
      const user = userEvent.setup()
      render(<EditorToolbar editor={editor} />)

      editor.commands.selectAll()

      const italicButton = screen.getByTitle('Italic (Cmd+I)')
      await user.click(italicButton)

      expect(editor.isActive('italic')).toBe(true)
    })

    it('should toggle heading when button is clicked', async () => {
      const user = userEvent.setup()
      render(<EditorToolbar editor={editor} />)

      const h1Button = screen.getByTitle('Heading 1')
      await user.click(h1Button)

      expect(editor.isActive('heading', { level: 1 })).toBe(true)
    })

    it('should toggle bullet list when button is clicked', async () => {
      const user = userEvent.setup()
      render(<EditorToolbar editor={editor} />)

      const bulletButton = screen.getByTitle('Bullet List')
      await user.click(bulletButton)

      expect(editor.isActive('bulletList')).toBe(true)
    })

    it('should insert horizontal rule when button is clicked', async () => {
      const user = userEvent.setup()
      render(<EditorToolbar editor={editor} />)

      const hrButton = screen.getByTitle('Horizontal Rule')
      await user.click(hrButton)

      const html = editor.getHTML()
      expect(html).toContain('<hr>')
    })
  })

  describe('active state', () => {
    it('should show active styling when bold is active', () => {
      editor.commands.selectAll()
      editor.commands.toggleBold()

      render(<EditorToolbar editor={editor} />)

      const boldButton = screen.getByTitle('Bold (Cmd+B)')
      // Active buttons have bg-primary and text-white classes
      expect(boldButton).toHaveClass('bg-primary')
      expect(boldButton).toHaveClass('text-white')
    })

    it('should show active styling when italic is active', () => {
      editor.commands.selectAll()
      editor.commands.toggleItalic()

      render(<EditorToolbar editor={editor} />)

      const italicButton = screen.getByTitle('Italic (Cmd+I)')
      expect(italicButton).toHaveClass('bg-primary')
      expect(italicButton).toHaveClass('text-white')
    })

    it('should show active styling when heading is active', () => {
      editor.commands.toggleHeading({ level: 2 })

      render(<EditorToolbar editor={editor} />)

      const h2Button = screen.getByTitle('Heading 2')
      expect(h2Button).toHaveClass('bg-primary')
      expect(h2Button).toHaveClass('text-white')
    })

    it('should not show active styling when format is not active', () => {
      render(<EditorToolbar editor={editor} />)

      const boldButton = screen.getByTitle('Bold (Cmd+B)')
      expect(boldButton).not.toHaveClass('bg-primary')
    })
  })

  describe('button types', () => {
    it('should have type="button" on all buttons to prevent form submission', () => {
      const { container } = render(<EditorToolbar editor={editor} />)

      const buttons = container.querySelectorAll('button')
      buttons.forEach((button) => {
        expect(button.getAttribute('type')).toBe('button')
      })
    })
  })
})
