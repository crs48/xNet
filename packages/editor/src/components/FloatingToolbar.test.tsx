import type { Editor } from '@tiptap/react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { captureTextAnchor } from '../extensions/comment'
import { FloatingToolbar } from './FloatingToolbar'

vi.mock('../extensions/comment', () => ({
  captureTextAnchor: vi.fn(() => ({
    exact: 'selected text',
    prefix: '',
    suffix: '',
    position: {
      type: 'relative',
      anchor: 'anchor',
      head: 'head'
    }
  }))
}))

type MockEditor = {
  state: {
    selection: {
      from: number
      to: number
      empty: boolean
    }
    doc: {
      textBetween: ReturnType<typeof vi.fn>
    }
  }
  isFocused: boolean
  isActive: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  can: ReturnType<typeof vi.fn>
  chain: ReturnType<typeof vi.fn>
  commands: {
    focus: ReturnType<typeof vi.fn>
    setComment: ReturnType<typeof vi.fn>
    setDatabaseEmbed: ReturnType<typeof vi.fn>
    setEmbed: ReturnType<typeof vi.fn>
  }
  extensionManager: {
    extensions: Array<{
      name: string
      options?: {
        onSelectDatabase?: () => Promise<string | null>
      }
    }>
  }
  getAttributes: ReturnType<typeof vi.fn>
  _commands: {
    toggleBlockquote: ReturnType<typeof vi.fn>
    toggleCodeBlock: ReturnType<typeof vi.fn>
    setLink: ReturnType<typeof vi.fn>
    insertContent: ReturnType<typeof vi.fn>
    unsetLink: ReturnType<typeof vi.fn>
  }
  _emit: (event: string) => void
}

interface BubbleMenuMockProps {
  shouldShow?: (params: {
    editor: MockEditor
    from: number
    to: number
    state: MockEditor['state']
  }) => boolean
  editor: MockEditor
  className?: string
  children: React.ReactNode
  'data-canvas-interactive'?: string
  'data-editor-toolbar-surface'?: string
  'data-testid'?: string
  'aria-label'?: string
  role?: string
}

vi.mock('@tiptap/react/menus', () => {
  return {
    BubbleMenu: ({
      shouldShow,
      editor,
      className,
      children,
      'data-canvas-interactive': dataCanvasInteractive,
      'data-editor-toolbar-surface': dataEditorToolbarSurface,
      'data-testid': testId = 'editor-desktop-toolbar',
      'aria-label': ariaLabel,
      role
    }: BubbleMenuMockProps) => {
      const selection = editor.state.selection
      const visible =
        shouldShow?.({
          editor,
          from: selection.from,
          to: selection.to,
          state: editor.state
        }) ?? true

      if (!visible) {
        return null
      }

      return (
        <div
          data-testid={testId}
          className={className}
          data-canvas-interactive={dataCanvasInteractive}
          data-editor-toolbar-surface={dataEditorToolbarSurface}
          role={role}
          aria-label={ariaLabel}
        >
          {children}
        </div>
      )
    }
  }
})

function createMockEditor() {
  const listeners: Record<string, Set<() => void>> = {}
  const commands = {
    toggleBold: vi.fn(() => ({ run: vi.fn() })),
    toggleItalic: vi.fn(() => ({ run: vi.fn() })),
    toggleStrike: vi.fn(() => ({ run: vi.fn() })),
    toggleCode: vi.fn(() => ({ run: vi.fn() })),
    setLink: vi.fn(() => ({ run: vi.fn() })),
    unsetLink: vi.fn(() => ({ run: vi.fn() })),
    toggleHeading: vi.fn(() => ({ run: vi.fn() })),
    toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
    toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
    toggleTaskList: vi.fn(() => ({ run: vi.fn() })),
    toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
    toggleCodeBlock: vi.fn(() => ({ run: vi.fn() })),
    setHorizontalRule: vi.fn(() => ({ run: vi.fn() })),
    liftListItem: vi.fn(() => ({ run: vi.fn() })),
    sinkListItem: vi.fn(() => ({ run: vi.fn() })),
    setParagraph: vi.fn(() => ({ run: vi.fn() })),
    insertContent: vi.fn(() => ({ run: vi.fn() }))
  }
  const editor = {
    state: {
      selection: {
        from: 1,
        to: 1,
        empty: true
      },
      doc: {
        textBetween: vi.fn(() => '')
      }
    },
    isFocused: false,
    isActive: vi.fn(() => false),
    on: vi.fn((event: string, handler: () => void) => {
      if (!listeners[event]) listeners[event] = new Set()
      listeners[event].add(handler)
    }),
    off: vi.fn((event: string, handler: () => void) => {
      listeners[event]?.delete(handler)
    }),
    can: vi.fn(() => ({
      liftListItem: () => false,
      sinkListItem: () => false
    })),
    chain: vi.fn(() => ({
      focus: () => commands
    })),
    commands: {
      focus: vi.fn(),
      setComment: vi.fn(),
      setDatabaseEmbed: vi.fn(() => true),
      setEmbed: vi.fn(() => true)
    },
    extensionManager: {
      extensions: []
    },
    getAttributes: vi.fn(() => ({})),
    _commands: commands,
    _emit(event: string) {
      listeners[event]?.forEach((handler) => handler())
    }
  }

  return editor as MockEditor
}

describe('FloatingToolbar', () => {
  it('shows desktop toolbar only for range selection', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    const { rerender } = render(
      <FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />
    )

    expect(screen.queryByTestId('editor-desktop-toolbar')).not.toBeInTheDocument()

    act(() => {
      editor.state.selection = { from: 2, to: 8, empty: false }
      editor._emit('selectionUpdate')
    })

    rerender(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)
    expect(screen.getByTestId('editor-desktop-toolbar')).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Editor formatting toolbar' })).toBeInTheDocument()

    act(() => {
      editor.isFocused = false
      editor._emit('blur')
    })

    expect(screen.queryByTestId('editor-desktop-toolbar')).not.toBeInTheDocument()
  })

  it('hides desktop toolbar in code blocks', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }
    editor.isActive.mockImplementation((name: string) => name === 'codeBlock')

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)
    expect(screen.queryByTestId('editor-desktop-toolbar')).not.toBeInTheDocument()
  })

  it('routes desktop block buttons through editor block commands', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Quote' }))
    expect(editor._commands.toggleBlockquote).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Code Block' }))
    expect(editor._commands.toggleCodeBlock).toHaveBeenCalledTimes(1)
  })

  it('keeps icon button names short while exposing shortcut tooltip hints', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    const boldButton = screen.getByRole('button', { name: 'Bold' })
    expect(boldButton.getAttribute('title')).toMatch(/^Bold \((⌘B|Ctrl\+B)\)$/)
    expect(boldButton.getAttribute('data-shortcut')).toMatch(/^(⌘B|Ctrl\+B)$/)

    const linkButton = screen.getByRole('button', { name: 'Link' })
    expect(linkButton.getAttribute('title')).toMatch(/^Link \((⌘K|Ctrl\+K)\)$/)
    expect(linkButton.getAttribute('data-shortcut')).toMatch(/^(⌘K|Ctrl\+K)$/)
  })

  it('routes desktop mark and link buttons through editor mark commands', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }))
    fireEvent.click(screen.getByRole('button', { name: 'Strikethrough' }))
    fireEvent.click(screen.getByRole('button', { name: 'Code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Link URL' }), {
      target: { value: ' https://xnet.fyi/docs ' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply link' }))

    expect(editor._commands.toggleBold).toHaveBeenCalledTimes(1)
    expect(editor._commands.toggleItalic).toHaveBeenCalledTimes(1)
    expect(editor._commands.toggleStrike).toHaveBeenCalledTimes(1)
    expect(editor._commands.toggleCode).toHaveBeenCalledTimes(1)
    expect(editor._commands.setLink).toHaveBeenCalledWith({ href: 'https://xnet.fyi/docs' })
  })

  it('closes link popover on Escape without mutating the document', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(screen.getByTestId('editor-link-popover')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByTestId('editor-link-popover'), { key: 'Escape' })

    expect(screen.queryByTestId('editor-link-popover')).not.toBeInTheDocument()
    expect(editor._commands.setLink).not.toHaveBeenCalled()
    expect(editor._commands.unsetLink).not.toHaveBeenCalled()
    expect(editor.commands.focus).toHaveBeenCalledTimes(1)
  })

  it('removes an existing link through the link popover', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }
    editor.getAttributes.mockImplementation((name: string) =>
      name === 'link' ? { href: 'https://xnet.fyi/old' } : {}
    )

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(screen.getByRole('textbox', { name: 'Link URL' })).toHaveValue('https://xnet.fyi/old')

    fireEvent.click(screen.getByRole('button', { name: 'Remove link' }))

    expect(editor._commands.unsetLink).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('editor-link-popover')).not.toBeInTheDocument()
  })

  it('keeps desktop toolbar visible while the link popover owns focus', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    const { rerender } = render(
      <FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    act(() => {
      editor.isFocused = false
      editor._emit('blur')
    })
    rerender(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    expect(screen.getByTestId('editor-desktop-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('editor-link-popover')).toBeInTheDocument()
  })

  it('inserts page references through the reference popover', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }
    editor.state.doc.textBetween.mockReturnValue('Existing Selection')

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Reference' }))
    expect(screen.getByRole('textbox', { name: 'Page reference' })).toHaveValue(
      'Existing Selection'
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Page reference' }), {
      target: { value: 'Launch Plan' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Insert page reference' }))

    expect(editor._commands.insertContent).toHaveBeenCalledWith({
      type: 'text',
      text: 'Launch Plan',
      marks: [
        {
          type: 'wikilink',
          attrs: {
            href: 'default/launch-plan',
            title: 'Launch Plan'
          }
        }
      ]
    })
    expect(screen.queryByTestId('editor-reference-popover')).not.toBeInTheDocument()
  })

  it('closes reference popover on Escape without mutating the document', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Reference' }))
    expect(screen.getByTestId('editor-reference-popover')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByTestId('editor-reference-popover'), { key: 'Escape' })

    expect(screen.queryByTestId('editor-reference-popover')).not.toBeInTheDocument()
    expect(editor._commands.insertContent).not.toHaveBeenCalled()
    expect(editor.commands.focus).toHaveBeenCalledTimes(1)
  })

  it('keeps desktop toolbar visible while the reference popover owns focus', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    const { rerender } = render(
      <FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reference' }))
    act(() => {
      editor.isFocused = false
      editor._emit('blur')
    })
    rerender(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    expect(screen.getByTestId('editor-desktop-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('editor-reference-popover')).toBeInTheDocument()
  })

  it('inserts database embeds through the database popover', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Database' }))
    expect(screen.getByTestId('editor-database-popover')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Database ID' }), {
      target: { value: ' db-roadmap ' }
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Board view' }))
    fireEvent.click(screen.getByRole('button', { name: 'Insert database embed' }))

    expect(editor.commands.setDatabaseEmbed).toHaveBeenCalledWith({
      databaseId: 'db-roadmap',
      viewType: 'board'
    })
    expect(screen.queryByTestId('editor-database-popover')).not.toBeInTheDocument()
  })

  it('keeps database popover open with an error when database ID is empty', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Database' }))
    fireEvent.click(screen.getByRole('button', { name: 'Insert database embed' }))

    expect(editor.commands.setDatabaseEmbed).not.toHaveBeenCalled()
    expect(screen.getByTestId('editor-database-popover')).toBeInTheDocument()
    expect(screen.getByText('Enter a database ID')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Database ID' })).toHaveAttribute(
      'aria-invalid',
      'true'
    )
  })

  it('closes database popover on Escape without mutating the document', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Database' }))
    expect(screen.getByTestId('editor-database-popover')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByTestId('editor-database-popover'), { key: 'Escape' })

    expect(screen.queryByTestId('editor-database-popover')).not.toBeInTheDocument()
    expect(editor.commands.setDatabaseEmbed).not.toHaveBeenCalled()
    expect(editor.commands.focus).toHaveBeenCalledTimes(1)
  })

  it('keeps desktop toolbar visible while the database popover owns focus', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    const { rerender } = render(
      <FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Database' }))
    act(() => {
      editor.isFocused = false
      editor._emit('blur')
    })
    rerender(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    expect(screen.getByTestId('editor-desktop-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('editor-database-popover')).toBeInTheDocument()
  })

  it('fills the database popover from the configured database picker', async () => {
    const editor = createMockEditor()
    const picker = vi.fn().mockResolvedValue('db-picked')
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }
    editor.extensionManager.extensions = [
      {
        name: 'databaseEmbed',
        options: { onSelectDatabase: picker }
      }
    ]

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Database' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick database' }))

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Database ID' })).toHaveValue('db-picked')
    })
    expect(picker).toHaveBeenCalledTimes(1)
  })

  it('inserts media embeds through the media popover', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Media' }))
    expect(screen.getByTestId('editor-media-popover')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Media URL' }), {
      target: { value: ' https://www.youtube.com/watch?v=dQw4w9WgXcQ ' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Insert media embed' }))

    expect(editor.commands.setEmbed).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    )
    expect(screen.queryByTestId('editor-media-popover')).not.toBeInTheDocument()
  })

  it('keeps media popover open with an error when media URL is empty', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Media' }))
    fireEvent.click(screen.getByRole('button', { name: 'Insert media embed' }))

    expect(editor.commands.setEmbed).not.toHaveBeenCalled()
    expect(screen.getByTestId('editor-media-popover')).toBeInTheDocument()
    expect(screen.getByText('Enter a supported media URL')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Media URL' })).toHaveAttribute(
      'aria-invalid',
      'true'
    )
  })

  it('keeps media popover open with an error when media URL is unsupported', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }
    editor.commands.setEmbed.mockReturnValue(false)

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Media' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Media URL' }), {
      target: { value: 'https://example.com/not-media' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Insert media embed' }))

    expect(editor.commands.setEmbed).toHaveBeenCalledWith('https://example.com/not-media')
    expect(screen.getByTestId('editor-media-popover')).toBeInTheDocument()
    expect(screen.getByText('Enter a supported media URL')).toBeInTheDocument()
  })

  it('closes media popover on Escape without mutating the document', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByRole('button', { name: 'Media' }))
    expect(screen.getByTestId('editor-media-popover')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByTestId('editor-media-popover'), { key: 'Escape' })

    expect(screen.queryByTestId('editor-media-popover')).not.toBeInTheDocument()
    expect(editor.commands.setEmbed).not.toHaveBeenCalled()
    expect(editor.commands.focus).toHaveBeenCalledTimes(1)
  })

  it('keeps desktop toolbar visible while the media popover owns focus', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    const { rerender } = render(
      <FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Media' }))
    act(() => {
      editor.isFocused = false
      editor._emit('blur')
    })
    rerender(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    expect(screen.getByTestId('editor-desktop-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('editor-media-popover')).toBeInTheDocument()
  })

  it('routes desktop comment button through anchor capture and comment commands', async () => {
    const editor = createMockEditor()
    const onCreateComment = vi.fn().mockResolvedValue('comment-1')
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(
      <FloatingToolbar
        editor={editor as unknown as Editor}
        mode="desktop"
        onCreateComment={onCreateComment}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }))

    await waitFor(() => {
      expect(onCreateComment).toHaveBeenCalledWith(
        JSON.stringify({
          exact: 'selected text',
          prefix: '',
          suffix: '',
          position: {
            type: 'relative',
            anchor: 'anchor',
            head: 'head'
          }
        })
      )
    })
    expect(captureTextAnchor).toHaveBeenCalledWith(editor)
    expect(editor.commands.setComment).toHaveBeenCalledWith('comment-1')
  })

  it('prevents toolbar button mouse down from stealing editor focus', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true
    })

    screen.getByRole('button', { name: 'Bold' }).dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('uses compact desktop toolbar policy for canvas inline selections', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    const { rerender } = render(
      <FloatingToolbar
        editor={editor as unknown as Editor}
        mode="desktop"
        surface="canvas-inline"
      />
    )

    expect(screen.queryByTestId('editor-desktop-toolbar')).not.toBeInTheDocument()

    act(() => {
      editor.state.selection = { from: 2, to: 8, empty: false }
      editor._emit('selectionUpdate')
    })

    rerender(
      <FloatingToolbar
        editor={editor as unknown as Editor}
        mode="desktop"
        surface="canvas-inline"
      />
    )

    expect(screen.getByTestId('editor-desktop-toolbar')).toHaveClass(
      'max-w-[min(360px,calc(100vw-24px))]'
    )
    expect(screen.getByTestId('editor-desktop-toolbar')).toHaveAttribute(
      'data-canvas-interactive',
      'true'
    )
    expect(screen.getByTestId('editor-desktop-toolbar')).toHaveAttribute(
      'data-editor-toolbar-surface',
      'canvas-inline'
    )
    expect(
      screen.getByRole('toolbar', { name: 'Canvas editor formatting toolbar' })
    ).toBeInTheDocument()
  })

  it('hides canvas inline compact toolbar when focus leaves an existing range selection', () => {
    const editor = createMockEditor()
    editor.isFocused = false
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(
      <FloatingToolbar
        editor={editor as unknown as Editor}
        mode="desktop"
        surface="canvas-inline"
      />
    )

    expect(screen.queryByTestId('editor-desktop-toolbar')).not.toBeInTheDocument()
  })

  it('shows mobile toolbar on focus in mobile mode', () => {
    const editor = createMockEditor()
    render(<FloatingToolbar editor={editor as unknown as Editor} mode="mobile" />)
    expect(screen.queryByTestId('editor-mobile-toolbar')).not.toBeInTheDocument()

    act(() => {
      editor.isFocused = true
      editor._emit('focus')
    })

    expect(screen.getByTestId('editor-mobile-toolbar')).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Editor formatting toolbar' })).toBeInTheDocument()

    act(() => {
      editor.isFocused = false
      editor._emit('blur')
    })

    expect(screen.queryByTestId('editor-mobile-toolbar')).not.toBeInTheDocument()
  })

  it('keeps canvas inline toolbar canvas-interactive when mobile mode is requested', () => {
    const editor = createMockEditor()
    editor.isFocused = true
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(
      <FloatingToolbar editor={editor as unknown as Editor} mode="mobile" surface="canvas-inline" />
    )

    expect(screen.getByTestId('editor-desktop-toolbar')).toHaveAttribute(
      'data-canvas-interactive',
      'true'
    )
    expect(screen.getByTestId('editor-desktop-toolbar')).toHaveAttribute(
      'data-editor-toolbar-surface',
      'canvas-inline'
    )
  })
})
