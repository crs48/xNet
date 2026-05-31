import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { EditorSurface } from './EditorSurface'

function createDoc(): Y.Doc {
  return new Y.Doc()
}

describe('EditorSurface', () => {
  it('renders page surfaces with document layout metadata', () => {
    render(<EditorSurface ydoc={createDoc()} surfaceMode="page" surfaceDensity="compact" />)

    const surface = document.querySelector('[data-editor-surface="true"]')
    expect(surface).toHaveAttribute('data-editor-surface-mode', 'page')
    expect(surface).toHaveAttribute('data-editor-surface-density', 'compact')
    expect(surface).toHaveClass('px-4')
    expect(document.querySelector('[data-editor-surface-content="true"]')).toHaveClass('max-w-3xl')
  })

  it('marks canvas inline surfaces as canvas editing surfaces', async () => {
    render(
      <EditorSurface
        ydoc={createDoc()}
        surfaceMode="canvas-inline"
        placeholder="Canvas page"
        className="min-h-full"
      />
    )

    const surface = document.querySelector('[data-editor-surface="true"]')
    expect(surface).toHaveAttribute('data-editor-surface-mode', 'canvas-inline')
    expect(surface).toHaveAttribute('data-canvas-editing-surface', 'true')
    await waitFor(() => {
      expect(document.querySelector('[data-placeholder]')).toHaveAttribute(
        'data-placeholder',
        'Canvas page'
      )
    })
  })

  it('forces read surfaces to hide source mode editor chrome', async () => {
    render(
      <EditorSurface
        ydoc={createDoc()}
        surfaceMode="read"
        contentMode="source"
        placeholder="Read-only"
      />
    )

    expect(document.querySelector('[data-editor-surface="true"]')).toHaveAttribute(
      'data-editor-surface-mode',
      'read'
    )
    await waitFor(() => {
      expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
      expect(document.querySelector('[data-testid="editor-source-mode"]')).not.toBeInTheDocument()
    })
  })
})
