import type { Editor } from '@tiptap/react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FloatingToolbar } from './FloatingToolbar'

type MockEditor = {
  state: {
    selection: {
      from: number
      to: number
      empty: boolean
    }
  }
  isFocused: boolean
  isActive: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  can: ReturnType<typeof vi.fn>
  chain: ReturnType<typeof vi.fn>
  _commands: {
    toggleBlockquote: ReturnType<typeof vi.fn>
    toggleCodeBlock: ReturnType<typeof vi.fn>
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
  })

  it('hides desktop toolbar in code blocks', () => {
    const editor = createMockEditor()
    editor.state.selection = { from: 2, to: 8, empty: false }
    editor.isActive.mockImplementation((name: string) => name === 'codeBlock')

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)
    expect(screen.queryByTestId('editor-desktop-toolbar')).not.toBeInTheDocument()
  })

  it('routes desktop block buttons through editor block commands', () => {
    const editor = createMockEditor()
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByTitle('Quote'))
    expect(editor._commands.toggleBlockquote).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTitle('Code Block'))
    expect(editor._commands.toggleCodeBlock).toHaveBeenCalledTimes(1)
  })

  it('routes desktop mark buttons through editor mark commands', () => {
    const editor = createMockEditor()
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    fireEvent.click(screen.getByTitle('Bold'))
    fireEvent.click(screen.getByTitle('Italic'))
    fireEvent.click(screen.getByTitle('Strikethrough'))
    fireEvent.click(screen.getByTitle('Code'))

    expect(editor._commands.toggleBold).toHaveBeenCalledTimes(1)
    expect(editor._commands.toggleItalic).toHaveBeenCalledTimes(1)
    expect(editor._commands.toggleStrike).toHaveBeenCalledTimes(1)
    expect(editor._commands.toggleCode).toHaveBeenCalledTimes(1)
  })

  it('prevents toolbar button mouse down from stealing editor focus', () => {
    const editor = createMockEditor()
    editor.state.selection = { from: 2, to: 8, empty: false }

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)

    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true
    })

    screen.getByTitle('Bold').dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('uses compact desktop toolbar policy for canvas inline selections', () => {
    const editor = createMockEditor()
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
