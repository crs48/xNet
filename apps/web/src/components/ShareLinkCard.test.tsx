/**
 * ShareLinkCard (exploration 0295): titled card when the hub serves a
 * preview, plain-anchor fallback when it doesn't.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSharePreviewCache, ShareLinkCard } from './ShareLinkCard'

const HREF = 'https://hub.xnet.fyi/s/xv17-H8BwWy9#s=sekret'

describe('ShareLinkCard', () => {
  beforeEach(() => {
    clearSharePreviewCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a titled card from the hub preview and never sends the secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ title: 'Q3 Launch Plan', docType: 'page', icon: null }), {
        status: 200
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <ShareLinkCard
        href={HREF}
        text={HREF}
        linkId="xv17-H8BwWy9"
        hubHttpUrl="https://hub.xnet.fyi"
      />
    )

    await waitFor(() => expect(screen.getByText('Q3 Launch Plan')).toBeTruthy())
    const card = screen.getByRole('link')
    // The claim CTA is the original URL (fragment intact, for the claim flow)…
    expect(card.getAttribute('href')).toBe(HREF)
    // …but the preview request itself must not carry the secret.
    const requested = fetchMock.mock.calls[0][0] as string
    expect(requested).toBe('https://hub.xnet.fyi/shares/links/xv17-H8BwWy9/preview')
    expect(requested).not.toContain('sekret')
  })

  it('falls back to a plain anchor when the preview 404s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"code":"PREVIEW_NOT_FOUND"}', { status: 404 }))
    )

    render(
      <ShareLinkCard
        href={HREF}
        text={HREF}
        linkId="xv17-H8BwWy9"
        hubHttpUrl="https://hub.xnet.fyi"
      />
    )

    await waitFor(() => {
      const anchor = screen.getByRole('link')
      expect(anchor.textContent).toBe(HREF)
    })
  })
})
