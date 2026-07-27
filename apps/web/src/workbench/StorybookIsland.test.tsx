/**
 * The Storybook island only appears when Storybook is actually reachable.
 *
 * The probe is the whole component, so it is the whole test surface. Two things
 * are pinned here because both were wrong in the first implementation:
 *
 *  - a *plain* CORS fetch is used, not `mode: 'no-cors'`. no-cors reads as the
 *    more permissive option and is the opposite: it fails outright from the
 *    app's dev origin, so the button never rendered.
 *  - a non-ok response means absent. Something answering on :6006 that is not
 *    Storybook should not produce a dead button.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StorybookIsland } from './StorybookIsland'

afterEach(() => vi.restoreAllMocks())

describe('StorybookIsland', () => {
  it('renders a link to Storybook when the probe succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response)
    vi.stubGlobal('fetch', fetchMock)

    render(<StorybookIsland />)

    const link = await screen.findByRole('link', { name: 'Open Storybook' })
    expect(link.getAttribute('href')).toBe('http://127.0.0.1:6006')
    // New tab: the app's frame-src excludes localhost, and Storybook wants the
    // whole viewport.
    expect(link.getAttribute('target')).toBe('_blank')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:6006/index.json')
    expect(init?.mode).toBeUndefined()
  })

  it('renders nothing when Storybook is not running', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const { container } = render(<StorybookIsland />)

    await waitFor(() => expect(container.innerHTML).toBe(''))
    expect(screen.queryByRole('link', { name: 'Open Storybook' })).toBeNull()
  })

  it('renders nothing when something other than Storybook answers on the port', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response))

    const { container } = render(<StorybookIsland />)

    await waitFor(() => expect(container.innerHTML).toBe(''))
  })
})
