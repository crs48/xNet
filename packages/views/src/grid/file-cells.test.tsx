/**
 * File attachment cells — upload through config.onUploadFile, inline image
 * thumbnails via onResolveFileUrl, drag-drop onto cells, peek lightbox.
 */

import type { FileRef } from '@xnetjs/data'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fileHandler } from '../properties/file'
import { GridPeek } from './GridPeek'
import { GridSurface } from './GridSurface'

const imageRef: FileRef = {
  cid: 'cid:blake3:img123',
  name: 'photo.png',
  mimeType: 'image/png',
  size: 2048
}

const pdfRef: FileRef = {
  cid: 'cid:blake3:doc456',
  name: 'report.pdf',
  mimeType: 'application/pdf',
  size: 4096
}

const resolveUrl = vi.fn(async (ref: FileRef) => `blob:fake/${ref.cid}`)

// ─── jsdom sizing for TanStack Virtual ───────────────────────────────────────

class ResizeObserverStub {
  callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe(target: Element): void {
    this.callback(
      [{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    )
  }
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 800
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 1200
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Handler ─────────────────────────────────────────────────────────────────

describe('file handler', () => {
  it('renders an image thumbnail when the URL resolves', async () => {
    render(<>{fileHandler.render(imageRef, { onResolveFileUrl: resolveUrl })}</>)
    await waitFor(() => {
      const img = screen.getByTestId('file-thumb') as HTMLImageElement
      expect(img.src).toContain('blob:fake/cid:blake3:img123')
    })
    expect(screen.getByText('photo.png')).toBeTruthy()
  })

  it('renders non-images as a paperclip chip with size', () => {
    render(<>{fileHandler.render(pdfRef, {})}</>)
    expect(screen.getByText('report.pdf')).toBeTruthy()
    expect(screen.getByText('(4 KB)')).toBeTruthy()
    expect(screen.queryByTestId('file-thumb')).toBeNull()
  })

  it('uploads through the hidden input and commits the FileRef', async () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    const onUploadFile = vi.fn(async () => pdfRef)
    render(
      <fileHandler.Editor
        value={null}
        config={{ onUploadFile }}
        onChange={onChange}
        onCommit={onCommit}
        autoFocus
      />
    )
    const input = screen.getByTestId('file-input') as HTMLInputElement
    const file = new File(['data'], 'report.pdf', { type: 'application/pdf' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })

    await waitFor(() => expect(onUploadFile).toHaveBeenCalledWith(file))
    expect(onChange).toHaveBeenCalledWith(pdfRef)
    expect(onCommit).toHaveBeenCalledWith(pdfRef, 'picker-select')
  })

  it('removes the file and commits null', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(
      <fileHandler.Editor
        value={pdfRef}
        config={{ onUploadFile: vi.fn() }}
        onChange={onChange}
        onCommit={onCommit}
      />
    )
    fireEvent.click(screen.getByLabelText('Remove report.pdf'))
    expect(onChange).toHaveBeenCalledWith(null)
    expect(onCommit).toHaveBeenCalledWith(null, 'picker-select')
  })

  it('uploads a dropped file in the editor', async () => {
    const onCommit = vi.fn()
    const onUploadFile = vi.fn(async () => imageRef)
    render(
      <fileHandler.Editor
        value={null}
        config={{ onUploadFile }}
        onChange={vi.fn()}
        onCommit={onCommit}
      />
    )
    const editor = screen.getByTestId('file-editor')
    const file = new File(['img'], 'photo.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.drop(editor, { dataTransfer: { files: [file], types: ['Files'] } })
    })
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(imageRef, 'picker-select'))
  })
})

// ─── Grid drop target ────────────────────────────────────────────────────────

describe('GridSurface file drop', () => {
  it('dropping a file on a file cell uploads and writes the FileRef', async () => {
    const onUpdateCell = vi.fn()
    const onUploadFile = vi.fn(async () => imageRef)
    render(
      <GridSurface
        fields={[{ id: 'attach', name: 'Attachment', type: 'file', config: {}, width: 200 }]}
        rows={[{ id: 'r1', cells: {} }]}
        onUpdateCell={onUpdateCell}
        onUploadFile={onUploadFile}
      />
    )
    const cell = document.querySelector('[data-row-index="0"][data-col-index="0"]') as HTMLElement
    const file = new File(['img'], 'photo.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.drop(cell, { dataTransfer: { files: [file], types: ['Files'] } })
    })
    await waitFor(() => expect(onUploadFile).toHaveBeenCalledWith(file))
    await waitFor(() => expect(onUpdateCell).toHaveBeenCalledWith('r1', 'attach', imageRef))
  })

  it('non-file cells ignore file drops', async () => {
    const onUpdateCell = vi.fn()
    const onUploadFile = vi.fn(async () => imageRef)
    render(
      <GridSurface
        fields={[{ id: 'name', name: 'Name', type: 'text', config: {}, width: 200 }]}
        rows={[{ id: 'r1', cells: {} }]}
        onUpdateCell={onUpdateCell}
        onUploadFile={onUploadFile}
      />
    )
    const cell = document.querySelector('[data-row-index="0"][data-col-index="0"]') as HTMLElement
    await act(async () => {
      fireEvent.drop(cell, {
        dataTransfer: { files: [new File(['x'], 'x.png', { type: 'image/png' })], types: ['Files'] }
      })
    })
    expect(onUploadFile).not.toHaveBeenCalled()
    expect(onUpdateCell).not.toHaveBeenCalled()
  })
})

// ─── Peek lightbox ───────────────────────────────────────────────────────────

describe('GridPeek image lightbox', () => {
  it('shows an inline preview and opens/closes the lightbox', async () => {
    render(
      <GridPeek
        row={{ id: 'r1', cells: { attach: imageRef } }}
        fields={[
          { id: 'title', name: 'Title', type: 'text', config: {}, width: 200, isTitle: true },
          { id: 'attach', name: 'Attachment', type: 'file', config: {}, width: 200 }
        ]}
        onClose={vi.fn()}
        onResolveFileUrl={resolveUrl}
      />
    )
    const preview = await screen.findByTestId('peek-image-preview')
    expect((preview as HTMLImageElement).src).toContain('blob:fake')

    fireEvent.click(screen.getByLabelText('Open photo.png'))
    expect(await screen.findByTestId('lightbox')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Close image'))
    expect(screen.queryByTestId('lightbox')).toBeNull()
  })
})
