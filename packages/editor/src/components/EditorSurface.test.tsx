import { act, render, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  EDITOR_ROLLOUT_MODE_STORAGE_KEY,
  EditorSurface,
  EditorSurfaceErrorBoundary,
  resolveEditorSurfaceContentMode
} from './EditorSurface'

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

  it('provides a page body label by default', async () => {
    render(<EditorSurface ydoc={createDoc()} surfaceMode="page" />)

    await waitFor(() => {
      expect(document.querySelector('[aria-label="Page body"]')).toBeInTheDocument()
    })
  })

  it('enables live editing for page surfaces by default', async () => {
    render(<EditorSurface ydoc={createDoc()} surfaceMode="page" />)

    expect(document.querySelector('[data-editor-surface="true"]')).toHaveAttribute(
      'data-editor-rollout-content-mode',
      'live'
    )
    await waitFor(() => {
      expect(document.querySelector('[role="textbox"]')).toHaveAttribute(
        'data-content-mode',
        'live'
      )
      expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
      expect(document.querySelector('[data-testid="editor-source-mode"]')).not.toBeInTheDocument()
    })
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

  it('resolves rollout fallback modes only for editable surfaces', () => {
    expect(
      resolveEditorSurfaceContentMode({
        surfaceMode: 'page',
        rolloutMode: 'source'
      })
    ).toBe('source')

    expect(
      resolveEditorSurfaceContentMode({
        surfaceMode: 'canvas-inline',
        rolloutMode: 'read'
      })
    ).toBe('read')

    expect(
      resolveEditorSurfaceContentMode({
        surfaceMode: 'canvas-preview',
        rolloutMode: 'source'
      })
    ).toBe('read')
  })

  it('uses the rollout storage kill switch for page source fallback', async () => {
    window.localStorage.setItem(EDITOR_ROLLOUT_MODE_STORAGE_KEY, 'source')

    try {
      render(<EditorSurface ydoc={createDoc()} surfaceMode="page" />)

      expect(document.querySelector('[data-editor-surface="true"]')).toHaveAttribute(
        'data-editor-rollout-content-mode',
        'source'
      )
      await waitFor(() => {
        expect(document.querySelector('[data-testid="editor-source-mode"]')).toBeInTheDocument()
        expect(document.querySelector('.ProseMirror')).not.toBeInTheDocument()
      })
    } finally {
      window.localStorage.removeItem(EDITOR_ROLLOUT_MODE_STORAGE_KEY)
    }
  })

  it('renders a crash-safe fallback when editor content rendering fails', () => {
    const boundaryRef = createRef<EditorSurfaceErrorBoundary>()

    render(
      <EditorSurfaceErrorBoundary ref={boundaryRef} surfaceMode="page">
        <div>Editor content</div>
      </EditorSurfaceErrorBoundary>
    )

    act(() => {
      boundaryRef.current?.setState({ error: new Error('Missing extension') })
    })

    expect(document.querySelector('[data-editor-surface-fallback="true"]')).toHaveAttribute(
      'data-editor-surface-fallback-mode',
      'page'
    )
    expect(document.querySelector('[role="alert"]')).toHaveTextContent(
      'This content cannot be displayed'
    )
  })
})
