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
    expect(screen.getByText('X')).toBeInTheDocument()
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
