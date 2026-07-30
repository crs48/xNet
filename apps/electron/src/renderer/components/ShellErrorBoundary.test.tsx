/**
 * @vitest-environment jsdom
 */

/**
 * A shell render failure must degrade to a recoverable panel (exploration 0406).
 *
 * A browser tab that white-screens still has a reload button; a packaged
 * desktop window has none, so an unmounted tree is a dead app. This is the
 * guard for the failure the `MenuLabel` crash actually produced.
 */

import { render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShellErrorBoundary } from './ShellErrorBoundary'

function Boom(): React.ReactElement {
  throw new Error('MenuGroupRootContext is missing')
}

describe('ShellErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error; silence it so the run stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when nothing throws', () => {
    render(
      <ShellErrorBoundary>
        <p>shell</p>
      </ShellErrorBoundary>
    )
    expect(screen.getByText('shell')).toBeTruthy()
  })

  it('shows the crash panel instead of a blank window', () => {
    render(
      <ShellErrorBoundary>
        <Boom />
      </ShellErrorBoundary>
    )

    expect(screen.getByText('Something broke in the shell')).toBeTruthy()
    // The message is surfaced, not swallowed — a silent shell crash reads as
    // "the app is fine".
    expect(screen.getByText(/MenuGroupRootContext is missing/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  })

  it('reports the failure rather than swallowing it', () => {
    render(
      <ShellErrorBoundary>
        <Boom />
      </ShellErrorBoundary>
    )

    const logged = vi.mocked(console.error).mock.calls.flat()
    expect(logged.some((arg) => String(arg).includes('[shell] render failure'))).toBe(true)
  })
})
