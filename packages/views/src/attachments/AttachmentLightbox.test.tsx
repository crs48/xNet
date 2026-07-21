/**
 * AttachmentLightbox — slide kinds, paging, keyboard, and the provider that
 * lets any file chip open it (exploration 0385 W1).
 */

import type { FileRef } from '@xnetjs/data'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fileHandler } from '../properties/file'
import { AttachmentLightbox } from './AttachmentLightbox'
import { AttachmentLightboxProvider } from './AttachmentLightboxProvider'

const imageRef: FileRef = {
  cid: 'cid:blake3:img1',
  name: 'photo.png',
  mimeType: 'image/png',
  size: 2048
}

const secondImage: FileRef = {
  cid: 'cid:blake3:img2',
  name: 'second.jpg',
  mimeType: 'image/jpeg',
  size: 4096
}

const zipRef: FileRef = {
  cid: 'cid:blake3:zip1',
  name: 'archive.zip',
  mimeType: 'application/zip',
  size: 10240
}

const videoRef: FileRef = {
  cid: 'cid:blake3:vid1',
  name: 'clip.mp4',
  mimeType: 'video/mp4',
  size: 50000
}

const config = { onResolveFileUrl: vi.fn(async (ref: FileRef) => `blob:fake/${ref.cid}`) }

describe('AttachmentLightbox', () => {
  it('renders an image slide', async () => {
    render(<AttachmentLightbox refs={[imageRef]} config={config} onClose={vi.fn()} />)
    const img = await screen.findByTestId('lightbox-image')
    expect(img.getAttribute('alt')).toBe('photo.png')
  })

  it('renders a file card with a download link for non-previewable types', async () => {
    render(<AttachmentLightbox refs={[zipRef]} config={config} onClose={vi.fn()} />)
    const card = await screen.findByTestId('lightbox-file-card')
    // The card carries its own download action (the toolbar has another).
    const link = within(card).getByRole('link')
    expect(link.getAttribute('download')).toBe('archive.zip')
  })

  it('renders a video slide with native controls', async () => {
    render(<AttachmentLightbox refs={[videoRef]} config={config} onClose={vi.fn()} />)
    const video = await screen.findByTestId('lightbox-video')
    expect(video.hasAttribute('controls')).toBe(true)
  })

  it('pages between attachments with the next button and arrow keys', async () => {
    render(<AttachmentLightbox refs={[imageRef, secondImage]} config={config} onClose={vi.fn()} />)
    expect((await screen.findByTestId('lightbox-counter')).textContent).toContain('1 / 2')

    fireEvent.click(screen.getByLabelText('Next attachment'))
    await waitFor(() =>
      expect(screen.getByTestId('lightbox-counter').textContent).toContain('2 / 2')
    )

    // Wraps around, and ArrowLeft goes back.
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    await waitFor(() =>
      expect(screen.getByTestId('lightbox-counter').textContent).toContain('1 / 2')
    )
  })

  it('hides paging affordances for a single attachment', async () => {
    render(<AttachmentLightbox refs={[imageRef]} config={config} onClose={vi.fn()} />)
    await screen.findByTestId('lightbox-image')
    expect(screen.queryByTestId('lightbox-counter')).toBeNull()
    expect(screen.queryByLabelText('Next attachment')).toBeNull()
  })

  it('closes on Escape and on backdrop click', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <AttachmentLightbox refs={[imageRef]} config={config} onClose={onClose} />
    )
    await screen.findByTestId('lightbox-image')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(<AttachmentLightbox refs={[imageRef]} config={config} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('lightbox'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('opens at the clicked attachment, not the first', async () => {
    render(
      <AttachmentLightbox
        refs={[imageRef, secondImage]}
        initialIndex={1}
        config={config}
        onClose={vi.fn()}
      />
    )
    expect((await screen.findByTestId('lightbox-counter')).textContent).toContain('2 / 2')
  })
})

describe('AttachmentLightboxProvider', () => {
  it('opens the lightbox when a file chip is clicked', async () => {
    render(
      <AttachmentLightboxProvider config={config}>
        <div>{fileHandler.render(imageRef, config)}</div>
      </AttachmentLightboxProvider>
    )

    expect(screen.queryByTestId('lightbox')).toBeNull()
    fireEvent.click(await screen.findByTestId('file-chip'))
    expect(await screen.findByTestId('lightbox-image')).toBeTruthy()
  })

  it('leaves chips inert when no provider is mounted', async () => {
    render(<div>{fileHandler.render(imageRef, config)}</div>)
    const chip = await screen.findByTestId('file-chip')
    expect(chip.getAttribute('role')).toBeNull()
    fireEvent.click(chip)
    expect(screen.queryByTestId('lightbox')).toBeNull()
  })
})
