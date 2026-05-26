/**
 * CanvasExternalReferenceCard tests.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasExternalReferenceCard } from './CanvasExternalReferenceCard'

describe('CanvasExternalReferenceCard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('replaces generated YouTube fallback titles with resolved oEmbed titles', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
        author_name: 'Rick Astley'
      })
    } as Response)

    render(
      <CanvasExternalReferenceCard
        title="YouTube video"
        url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        provider="youtube"
        embedUrl="https://www.youtube.com/embed/dQw4w9WgXcQ"
        subtitle="YouTube"
        themeMode="light"
      />
    )

    await waitFor(() => {
      expect(
        screen.getByText('Rick Astley - Never Gonna Give You Up (Official Music Video)')
      ).toBeInTheDocument()
    })

    expect(screen.getByText('Rick Astley')).toBeInTheDocument()
  })

  it('keeps clean fallback titles when metadata lookup is unavailable', () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network unavailable'))

    render(
      <CanvasExternalReferenceCard
        title="Post from @storybookjs"
        url="https://x.com/storybookjs/status/1606321052308658177"
        provider="twitter"
        embedUrl="https://platform.twitter.com/embed/Tweet.html?id=1606321052308658177"
        subtitle="X"
        themeMode="dark"
      />
    )

    expect(screen.getByText('Post from @storybookjs')).toBeInTheDocument()
    expect(document.querySelector('[data-canvas-embed-subtitle="true"]')).toHaveTextContent('X')
  })

  it('renders lifecycle status badges with semantic state attributes', () => {
    render(
      <CanvasExternalReferenceCard
        title="Design brief"
        url="https://example.com/brief"
        provider="generic"
        subtitle="Example"
        status="resolving"
        themeMode="light"
      />
    )

    const badge = screen
      .getByText('Resolving')
      .closest('[data-canvas-lifecycle-status="resolving"]')

    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute('data-canvas-lifecycle-tone', 'progress')
  })

  it('renders provider-specific card metadata for GitHub references', () => {
    render(
      <CanvasExternalReferenceCard
        title="openai PR #456"
        url="https://github.com/openai/openai/pull/456"
        provider="github"
        subtitle="openai"
        themeMode="light"
      />
    )

    const card = document.querySelector('[data-canvas-node-card="true"]')

    expect(card).toHaveAttribute('data-canvas-provider-renderer', 'github-record')
    expect(card).toHaveAttribute('data-canvas-provider-accent', 'slate')
    expect(screen.getByText('GH')).toBeInTheDocument()
    expect(screen.getByText('GitHub pull request')).toBeInTheDocument()
    expect(screen.getByText('Repo')).toBeInTheDocument()
    expect(screen.getByText('openai/openai')).toBeInTheDocument()
    expect(screen.getByText('Number')).toBeInTheDocument()
    expect(screen.getByText('456')).toBeInTheDocument()
  })

  it('renders provider-specific live embed labels for video cards', () => {
    vi.mocked(fetch).mockRejectedValue(new Error('metadata unavailable'))

    render(
      <CanvasExternalReferenceCard
        title="YouTube video"
        url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        provider="youtube"
        embedUrl="https://www.youtube.com/embed/dQw4w9WgXcQ"
        subtitle="YouTube"
        themeMode="dark"
      />
    )

    const card = document.querySelector('[data-canvas-node-card="true"]')

    expect(card).toHaveAttribute('data-canvas-provider-renderer', 'video')
    expect(card).toHaveAttribute('data-canvas-provider-accent', 'red')
    expect(screen.getByText('YouTube video embed')).toBeInTheDocument()
    expect(screen.getByText('Video player')).toBeInTheDocument()
  })

  it('activates and deactivates iframe pointer events explicitly', () => {
    const onEmbedActivationChange = vi.fn()

    render(
      <CanvasExternalReferenceCard
        title="YouTube video"
        url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        provider="youtube"
        embedUrl="https://www.youtube.com/embed/dQw4w9WgXcQ"
        subtitle="YouTube"
        themeMode="dark"
        onEmbedActivationChange={onEmbedActivationChange}
      />
    )

    const embedShell = document.querySelector('[data-canvas-embed-node="true"]')
    const iframe = document.querySelector('[data-canvas-embed-iframe="true"]')

    expect(embedShell).toHaveAttribute('data-canvas-embed-activation', 'shell')
    expect(iframe).toHaveClass('pointer-events-none')

    fireEvent.click(screen.getByRole('button', { name: 'Activate YouTube embed' }))

    expect(embedShell).toHaveAttribute('data-canvas-embed-activation', 'interactive')
    expect(iframe).toHaveClass('pointer-events-auto')
    expect(onEmbedActivationChange).toHaveBeenCalledWith(true)

    fireEvent.keyDown(embedShell as Element, { key: 'Escape' })

    expect(embedShell).toHaveAttribute('data-canvas-embed-activation', 'shell')
    expect(iframe).toHaveClass('pointer-events-none')
    expect(onEmbedActivationChange).toHaveBeenCalledWith(false)
  })

  it('applies workspace embed policy before rendering live iframes', () => {
    const { rerender } = render(
      <CanvasExternalReferenceCard
        title="YouTube video"
        url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        provider="youtube"
        embedUrl="https://www.youtube.com/embed/dQw4w9WgXcQ"
        subtitle="YouTube"
        themeMode="dark"
      />
    )

    const allowedCard = document.querySelector('[data-canvas-node-card="true"]')
    const iframe = document.querySelector('[data-canvas-embed-iframe="true"]')

    expect(allowedCard).toHaveAttribute('data-canvas-embed-policy', 'allowed')
    expect(iframe).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation'
    )

    rerender(
      <CanvasExternalReferenceCard
        title="YouTube video"
        url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        provider="youtube"
        embedUrl="https://www.youtube.com/embed/dQw4w9WgXcQ"
        subtitle="YouTube"
        themeMode="dark"
        embedPolicy={{ allowedProviders: ['spotify'] }}
      />
    )

    const blockedCard = document.querySelector('[data-canvas-node-card="true"]')

    expect(blockedCard).toHaveAttribute('data-canvas-embed-policy', 'blocked')
    expect(blockedCard).toHaveAttribute('data-canvas-embed-policy-reason', 'provider-blocked')
    expect(blockedCard).toHaveAttribute('data-canvas-embed-fallback-reason', 'provider-blocked')
    expect(document.querySelector('[data-canvas-embed-iframe="true"]')).not.toBeInTheDocument()
    expect(document.querySelector('[data-canvas-embed-fallback="true"]')).toHaveAttribute(
      'data-canvas-embed-fallback-tone',
      'danger'
    )
    expect(screen.getByText('Embed blocked')).toBeInTheDocument()
    expect(
      screen.getByText('Workspace policy does not allow live embeds from YouTube.')
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open source' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    )
  })

  it('renders an offline fallback instead of a live iframe when embed status is offline', () => {
    render(
      <CanvasExternalReferenceCard
        title="Planning playlist"
        url="https://open.spotify.com/playlist/abc123"
        provider="spotify"
        embedUrl="https://open.spotify.com/embed/playlist/abc123"
        subtitle="Spotify"
        status="offline"
        themeMode="light"
      />
    )

    const card = document.querySelector('[data-canvas-node-card="true"]')

    expect(card).toHaveAttribute('data-canvas-embed-active', 'false')
    expect(card).toHaveAttribute('data-canvas-embed-fallback-reason', 'offline')
    expect(document.querySelector('[data-canvas-embed-iframe="true"]')).not.toBeInTheDocument()
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByText('Embed offline')).toBeInTheDocument()
    expect(
      screen.getByText('Showing a safe Spotify link card until the provider reconnects.')
    ).toBeInTheDocument()
  })

  it('renders provider-denied embed fallbacks with recoverable source links', () => {
    render(
      <CanvasExternalReferenceCard
        title="Private video"
        url="https://vimeo.com/12345"
        provider="vimeo"
        embedUrl="https://player.vimeo.com/video/12345"
        subtitle="Vimeo"
        status="provider-denied"
        themeMode="dark"
      />
    )

    const fallback = document.querySelector('[data-canvas-embed-fallback="true"]')

    expect(document.querySelector('[data-canvas-embed-iframe="true"]')).not.toBeInTheDocument()
    expect(fallback).toHaveAttribute('data-canvas-embed-fallback-reason', 'provider-denied')
    expect(fallback).toHaveAttribute('data-canvas-embed-fallback-tone', 'danger')
    expect(fallback).toHaveTextContent('Provider denied')
    expect(
      screen.getByText(
        'Vimeo denied the live embed. The source link is preserved so the object remains recoverable.'
      )
    ).toBeInTheDocument()
  })

  it('renders failed-card recovery actions and routes action callbacks', () => {
    const onFailedAction = vi.fn()

    render(
      <CanvasExternalReferenceCard
        title="Broken brief"
        url="https://example.com/brief"
        provider="generic"
        subtitle="Example"
        status="error"
        themeMode="light"
        onFailedAction={onFailedAction}
      />
    )

    const actions = document.querySelector('[data-canvas-failed-card-actions="true"]')

    expect(actions).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry failed card' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Replace source failed card' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open source failed card' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy link failed card' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry failed card' }))

    expect(onFailedAction).toHaveBeenCalledWith('retry')
  })
})
