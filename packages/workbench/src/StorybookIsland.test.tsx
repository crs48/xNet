/**
 * The Storybook island is dev-only chrome and must stay network-silent.
 *
 * The silence is the point, not an incidental property. An earlier version
 * probed `:6006/index.json` to hide the button when Storybook was not running;
 * that logs `ERR_CONNECTION_REFUSED` every time it is not, which is noise in any
 * open devtools console and failed the zero-console-error assertion in
 * `tests/e2e/src/editor-ux.spec.ts`. This pins that no request is made at all.
 */
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StorybookIsland } from './StorybookIsland'

afterEach(() => vi.restoreAllMocks())

describe('StorybookIsland', () => {
  it('links to Storybook in a new tab', () => {
    render(<StorybookIsland />)

    const link = screen.getByRole('link', { name: 'Open Storybook' })
    expect(link.getAttribute('href')).toBe('http://127.0.0.1:6006')
    // New tab: the app's frame-src excludes localhost, and Storybook wants the
    // whole viewport.
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('tells the reader how to start Storybook, rather than probing for it', () => {
    render(<StorybookIsland />)

    const title = screen.getByRole('link', { name: 'Open Storybook' }).getAttribute('title') ?? ''
    expect(title).toContain('pnpm dev:stories')
  })

  it('makes no network request — a failed probe would pollute the console', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<StorybookIsland />)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
