import type { Editor } from '@tiptap/react'
import { act, render, screen } from '@testing-library/react'
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
  children: React.ReactNode
}

vi.mock('@tiptap/react/menus', () => {
  return {
    BubbleMenu: ({ shouldShow, editor, children }: BubbleMenuMockProps) => {
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

      return <div data-testid="editor-desktop-toolbar">{children}</div>
    }
  }
})

function createMockEditor() {
  const listeners: Record<string, Set<() => void>> = {}
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
      focus: () => ({
        toggleBold: () => ({ run: () => {} }),
        toggleItalic: () => ({ run: () => {} }),
        toggleStrike: () => ({ run: () => {} }),
        toggleCode: () => ({ run: () => {} }),
        toggleHeading: () => ({ run: () => {} }),
        toggleBulletList: () => ({ run: () => {} }),
        toggleOrderedList: () => ({ run: () => {} }),
        toggleTaskList: () => ({ run: () => {} }),
        toggleBlockquote: () => ({ run: () => {} }),
        toggleCodeBlock: () => ({ run: () => {} }),
        setHorizontalRule: () => ({ run: () => {} }),
        liftListItem: () => ({ run: () => {} }),
        sinkListItem: () => ({ run: () => {} }),
        setParagraph: () => ({ run: () => {} }),
        insertContent: () => ({ run: () => {} })
      })
    })),
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
  })

  it('hides desktop toolbar in code blocks', () => {
    const editor = createMockEditor()
    editor.state.selection = { from: 2, to: 8, empty: false }
    editor.isActive.mockImplementation((name: string) => name === 'codeBlock')

    render(<FloatingToolbar editor={editor as unknown as Editor} mode="desktop" />)
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
  })
})
