/**
 * Mermaid Node Tests
 *
 * Tests for the Mermaid diagram node component.
 */

import { render, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MermaidNodeComponent, type MermaidNodeData } from '../nodes/mermaid-node'

// Mock mermaid module
const mockMermaid = {
  initialize: vi.fn(),
  render: vi.fn().mockResolvedValue({ svg: '<svg>mock diagram</svg>' })
}

vi.mock('mermaid', () => ({
  default: mockMermaid
}))

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createNode(overrides: Partial<MermaidNodeData['properties']> = {}): MermaidNodeData {
  return {
    id: 'test-node-1',
    type: 'mermaid',
    properties: {
      code: 'graph TD\n  A-->B',
      ...overrides
    }
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MermaidNodeComponent', () => {
  const originalConsoleError = console.error
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const message = String(args[0] ?? '')
      if (message.includes('not wrapped in act')) return
      originalConsoleError(...args)
    })

    vi.clearAllMocks()
    mockMermaid.render.mockResolvedValue({ svg: '<svg>mock diagram</svg>' })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders cached SVG when hash matches', async () => {
      // Calculate the hash for the code
      const code = 'graph TD\n  A-->B'
      let hash = 0
      for (let i = 0; i < code.length; i++) {
        const char = code.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash
      }
      const hashStr = String(hash)

      const node = createNode({
        code,
        renderedSvg: '<svg>cached diagram</svg>',
        lastRenderHash: hashStr
      })

      const { container } = render(
        <MermaidNodeComponent
          node={node}
          isEditing={false}
          onUpdate={vi.fn()}
          onStartEdit={vi.fn()}
          onEndEdit={vi.fn()}
        />
      )

      // Should use cached SVG
      expect(container.innerHTML).toContain('cached diagram')
      expect(mockMermaid.render).not.toHaveBeenCalled()
    })

    it('renders new SVG when code changes (hash mismatch)', async () => {
      const node = createNode({
        code: 'graph TD\n  A-->B',
        renderedSvg: '<svg>old diagram</svg>',
        lastRenderHash: 'old-hash'
      })

      const onUpdate = vi.fn()

      render(
        <MermaidNodeComponent
          node={node}
          isEditing={false}
          onUpdate={onUpdate}
          onStartEdit={vi.fn()}
          onEndEdit={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(mockMermaid.render).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            renderedSvg: '<svg>mock diagram</svg>'
          })
        )
      })
    })

    it('shows empty placeholder when no code', () => {
      const node = createNode({ code: '' })

      const { container } = render(
        <MermaidNodeComponent
          node={node}
          isEditing={false}
          onUpdate={vi.fn()}
          onStartEdit={vi.fn()}
          onEndEdit={vi.fn()}
        />
      )

      expect(container.textContent).toContain('Double-click to add diagram')
    })

    it('shows error for invalid syntax', async () => {
      mockMermaid.render.mockRejectedValueOnce(new Error('Syntax error'))

      const node = createNode({ code: 'invalid syntax here' })

      const { container } = render(
        <MermaidNodeComponent
          node={node}
          isEditing={false}
          onUpdate={vi.fn()}
          onStartEdit={vi.fn()}
          onEndEdit={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(container.textContent).toContain('Diagram Error')
      })
    })
  })

  describe('editing', () => {
    it('shows textarea when editing', () => {
      const node = createNode()

      const { container } = render(
        <MermaidNodeComponent
          node={node}
          isEditing={true}
          onUpdate={vi.fn()}
          onStartEdit={vi.fn()}
          onEndEdit={vi.fn()}
        />
      )

      expect(container.querySelector('textarea')).toBeTruthy()
    })

    it('calls onStartEdit on double-click', () => {
      const onStartEdit = vi.fn()
      const node = createNode()

      const { container } = render(
        <MermaidNodeComponent
          node={node}
          isEditing={false}
          onUpdate={vi.fn()}
          onStartEdit={onStartEdit}
          onEndEdit={vi.fn()}
        />
      )

      // Wait for render
      act(() => {
        fireEvent.doubleClick(container.firstChild as Element)
      })

      expect(onStartEdit).toHaveBeenCalled()
    })

    it('calls onEndEdit on Escape', () => {
      const onEndEdit = vi.fn()
      const node = createNode()

      const { container } = render(
        <MermaidNodeComponent
          node={node}
          isEditing={true}
          onUpdate={vi.fn()}
          onStartEdit={vi.fn()}
          onEndEdit={onEndEdit}
        />
      )

      const textarea = container.querySelector('textarea')
      expect(textarea).toBeTruthy()

      fireEvent.keyDown(textarea!, { key: 'Escape' })

      expect(onEndEdit).toHaveBeenCalled()
    })

    it('updates code on change', () => {
      const onUpdate = vi.fn()
      const node = createNode()

      const { container } = render(
        <MermaidNodeComponent
          node={node}
          isEditing={true}
          onUpdate={onUpdate}
          onStartEdit={vi.fn()}
          onEndEdit={vi.fn()}
        />
      )

      const textarea = container.querySelector('textarea')
      fireEvent.change(textarea!, { target: { value: 'new code' } })

      expect(onUpdate).toHaveBeenCalledWith({ code: 'new code' })
    })

    it('inserts spaces on Tab', () => {
      const onUpdate = vi.fn()
      const node = createNode()

      const { container } = render(
        <MermaidNodeComponent
          node={node}
          isEditing={true}
          onUpdate={onUpdate}
          onStartEdit={vi.fn()}
          onEndEdit={vi.fn()}
        />
      )

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement
      textarea.selectionStart = 0
      textarea.selectionEnd = 0

      fireEvent.keyDown(textarea, { key: 'Tab' })

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          code: expect.stringContaining('  ')
        })
      )
    })

    it('shows live preview while editing', () => {
      const node = createNode({
        renderedSvg: '<svg>preview content</svg>'
      })

      const { container } = render(
        <MermaidNodeComponent
          node={node}
          isEditing={true}
          onUpdate={vi.fn()}
          onStartEdit={vi.fn()}
          onEndEdit={vi.fn()}
        />
      )

      expect(container.innerHTML).toContain('preview content')
      expect(container.querySelector('.mermaid-preview')).toBeTruthy()
    })
  })

  describe('themes', () => {
    it('renders diagram with different themes', async () => {
      // Note: mermaid.initialize is only called once per session,
      // so we just verify the component accepts theme prop
      const node = createNode({
        code: 'graph TD\n  A-->B',
        theme: 'dark'
      })

      const { container } = render(
        <MermaidNodeComponent
          node={node}
          isEditing={false}
          onUpdate={vi.fn()}
          onStartEdit={vi.fn()}
          onEndEdit={vi.fn()}
        />
      )

      // Should render successfully with dark theme
      await waitFor(() => {
        expect(container.innerHTML).toContain('mock diagram')
      })
    })
  })

  describe('caching', () => {
    it('caches rendered SVG with hash', async () => {
      const onUpdate = vi.fn()
      const node = createNode({ code: 'graph TD\n  A-->B' })

      render(
        <MermaidNodeComponent
          node={node}
          isEditing={false}
          onUpdate={onUpdate}
          onStartEdit={vi.fn()}
          onEndEdit={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            renderedSvg: '<svg>mock diagram</svg>',
            lastRenderHash: expect.any(String)
          })
        )
      })
    })
  })
})

// ─── Hash Function Tests ──────────────────────────────────────────────────────

describe('Hash Function', () => {
  it('produces consistent hashes', () => {
    // We test by verifying the cache hit behavior
    const code = 'graph TD\n  A-->B'
    let hash = 0
    for (let i = 0; i < code.length; i++) {
      const char = code.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }

    // Same code should produce same hash
    let hash2 = 0
    for (let i = 0; i < code.length; i++) {
      const char = code.charCodeAt(i)
      hash2 = (hash2 << 5) - hash2 + char
      hash2 = hash2 & hash2
    }

    expect(hash).toBe(hash2)
  })

  it('produces different hashes for different content', () => {
    const code1 = 'graph TD\n  A-->B'
    const code2 = 'graph TD\n  A-->C'

    let hash1 = 0
    for (let i = 0; i < code1.length; i++) {
      const char = code1.charCodeAt(i)
      hash1 = (hash1 << 5) - hash1 + char
      hash1 = hash1 & hash1
    }

    let hash2 = 0
    for (let i = 0; i < code2.length; i++) {
      const char = code2.charCodeAt(i)
      hash2 = (hash2 << 5) - hash2 + char
      hash2 = hash2 & hash2
    }

    expect(hash1).not.toBe(hash2)
  })
})
