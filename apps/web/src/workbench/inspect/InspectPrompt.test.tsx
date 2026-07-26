import { fireEvent, render, screen } from '@testing-library/react'
import { resolveLane } from '@xnetjs/devkit/blast-radius'
import { getCommandRegistry } from '@xnetjs/plugins'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InspectPrompt } from './InspectPrompt'

const disposers: Array<() => void> = []

/**
 * Rendered with NO ThemeProvider on purpose.
 *
 * The overlay is mounted at the application root so it also covers onboarding
 * and loading screens — outside the provider `App` sets up. An earlier version
 * called `useTheme()` here, threw, and took the whole app down. This harness
 * locks in that the panel works without the context.
 */
function mount(resolution: ReturnType<typeof resolveLane>, onClose = () => {}) {
  return render(
    <InspectPrompt resolution={resolution} anchor={{ left: 10, top: 20 }} onClose={onClose} />
  )
}

beforeEach(() => {
  disposers.length = 0
  localStorage.clear()
  document.documentElement.style.removeProperty('--accent')
})

afterEach(() => {
  for (const dispose of disposers) dispose()
  vi.restoreAllMocks()
})

describe('InspectPrompt', () => {
  it('leads with the blast-radius sentence for every lane', () => {
    const cases = [
      resolveLane({ tokenRef: '--accent' }),
      resolveLane({ slotId: 'tasks', slotLabel: 'Tasks' }),
      resolveLane({ pluginId: 'p', pluginName: 'P' }),
      resolveLane({ source: 'packages/ui/src/A.tsx:1:1' }),
      resolveLane({ source: 'packages/sync/src/change.ts:1:1' })
    ]
    for (const resolution of cases) {
      const view = mount(resolution)
      expect(screen.getByTestId('blast-radius').textContent).toBe(resolution.explain)
      view.unmount()
    }
  })

  it('offers a token value control for a Lane 1 token resolution', () => {
    mount(resolveLane({ tokenRef: '--accent' }))
    expect(screen.getByLabelText('--accent value')).toBeTruthy()
    expect(screen.getByText('Apply')).toBeTruthy()
  })

  it('applying a token writes an override and offers Undo', async () => {
    mount(resolveLane({ tokenRef: '--accent' }))
    const input = screen.getByLabelText('--accent value') as HTMLInputElement
    // fireEvent.change, not a raw `input` event: React tracks a controlled
    // input's value and ignores a direct assignment.
    fireEvent.change(input, { target: { value: '210 90% 60%' } })
    act(() => {
      screen.getByText('Apply').click()
    })
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('210 90% 60%')

    // Undo is async (it reports whether the reversal ran), so its state update
    // lands in a later tick.
    await act(async () => {
      screen.getByTestId('inspect-undo').click()
    })
    // Undo removes the override entirely rather than pinning a copy of the
    // stylesheet's value.
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('')
  })

  it('offers the slot’s own registered commands for a Lane 1 layout resolution', async () => {
    const run = vi.fn()
    disposers.push(
      getCommandRegistry().register({
        id: 'slot.move:tasks:dock.right',
        title: 'View: Move Tasks to right dock',
        run
      }).dispose
    )
    mount(resolveLane({ slotId: 'tasks', slotLabel: 'Tasks' }))
    const button = screen.getByText('View: Move Tasks to right dock')
    // The handler awaits the applier, so the state update lands in a later tick.
    await act(async () => {
      button.click()
    })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('offers no control at all for Lane 2 and Lane 3', () => {
    for (const resolution of [
      resolveLane({ pluginId: 'p', pluginName: 'P' }),
      resolveLane({ source: 'packages/ui/src/A.tsx:1:1' })
    ]) {
      const view = mount(resolution)
      // A button that silently does nothing is the exact failure this
      // exploration argues against; say so instead.
      expect(screen.getByTestId('no-control')).toBeTruthy()
      expect(screen.queryByText('Apply')).toBeNull()
      view.unmount()
    }
  })

  it('offers no control for a refused kernel resolution', () => {
    mount(resolveLane({ source: 'packages/crypto/src/keys.ts:1:1' }))
    expect(screen.getByTestId('no-control')).toBeTruthy()
    expect(screen.queryByText('Apply')).toBeNull()
  })

  it('stores the reversal without running it', () => {
    // React calls a bare function passed to a state setter as an updater. If the
    // reversal is not wrapped, applying a token instantly un-applies it.
    mount(resolveLane({ tokenRef: '--accent' }))
    fireEvent.change(screen.getByLabelText('--accent value'), {
      target: { value: '210 90% 60%' }
    })
    act(() => {
      screen.getByText('Apply').click()
    })
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('210 90% 60%')
    expect(screen.getByTestId('inspect-undo')).toBeTruthy()
  })

  it('closes on the close button', () => {
    const onClose = vi.fn()
    mount(resolveLane({ tokenRef: '--accent' }), onClose)
    act(() => {
      screen.getByLabelText('Close').click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('is a labelled dialog', () => {
    mount(resolveLane({ tokenRef: '--accent' }))
    const dialog = screen.getByTestId('inspect-prompt')
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-label')).toBeTruthy()
  })
})
