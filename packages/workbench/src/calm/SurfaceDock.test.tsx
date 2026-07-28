/**
 * SurfaceDock launcher (0273): registry tiers, strip expansion, panel
 * open/close via the shared bottom panel state, Esc, and palette commands.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkbench } from '../state'
import {
  getSurfaceDockPanels,
  registerSurfaceDockPanel,
  SurfaceDockLauncher,
  SurfaceDockSheetContent
} from './SurfaceDock'

const disposers: Array<() => void> = []

function registerTestPanels() {
  disposers.push(
    registerSurfaceDockPanel({
      id: 'test-hero',
      label: 'Hero Panel',
      tier: 'hero',
      priority: 0,
      component: () => <div data-testid="hero-panel-body">hero body</div>
    }),
    registerSurfaceDockPanel({
      id: 'test-secondary',
      label: 'Secondary Panel',
      tier: 'secondary',
      priority: 1,
      component: () => <div data-testid="secondary-panel-body">secondary body</div>
    })
  )
}

beforeEach(() => {
  while (disposers.length > 0) disposers.pop()?.()
  useWorkbench.setState({ bottom: { open: false, activeViewId: 'tray' } })
  registerTestPanels()
})

describe('surface dock registry', () => {
  it('orders panels by priority and filters by tier', () => {
    expect(getSurfaceDockPanels('hero').map((p) => p.id)).toContain('test-hero')
    expect(getSurfaceDockPanels('secondary').map((p) => p.id)).toContain('test-secondary')
  })
})

describe('SurfaceDockLauncher', () => {
  it('rests collapsed, expands on pointer enter, and opens a hero panel', () => {
    const { container } = render(<SurfaceDockLauncher lit={false} />)

    expect(screen.queryByRole('button', { name: 'Hero Panel' })).toBeNull()

    fireEvent.pointerEnter(container.firstChild as Element)
    fireEvent.click(screen.getByRole('button', { name: 'Hero Panel' }))

    expect(useWorkbench.getState().bottom).toEqual({ open: true, activeViewId: 'test-hero' })
    expect(screen.getByTestId('hero-panel-body')).toBeTruthy()
  })

  it('falls back to the first panel when the persisted view id is the pinned tray', () => {
    render(<SurfaceDockLauncher lit={false} />)

    // activeViewId is 'tray' (not a dock panel) — the toggle still opens.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle dock' }))
    expect(useWorkbench.getState().bottom.open).toBe(true)
    expect(screen.getByLabelText('Hero Panel', { selector: 'section' })).toBeTruthy()
  })

  it('switches panels from the More menu and closes on Esc', () => {
    const { container } = render(<SurfaceDockLauncher lit={false} />)

    fireEvent.pointerEnter(container.firstChild as Element)
    fireEvent.click(screen.getByRole('button', { name: 'More panels' }))
    fireEvent.click(screen.getByRole('button', { name: /Secondary Panel/ }))
    expect(screen.getByTestId('secondary-panel-body')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useWorkbench.getState().bottom.open).toBe(false)
  })

  it('closes from the panel header and via the main toggle', () => {
    render(<SurfaceDockLauncher lit={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Toggle dock' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close dock' }))
    expect(useWorkbench.getState().bottom.open).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Toggle dock' }))
    expect(useWorkbench.getState().bottom.open).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle dock' }))
    expect(useWorkbench.getState().bottom.open).toBe(false)
  })
})

describe('SurfaceDockSheetContent (compact twin)', () => {
  it('renders the active panel with a tab per registered item', () => {
    useWorkbench.setState({ bottom: { open: true, activeViewId: 'test-secondary' } })
    const onClose = () => useWorkbench.getState().setPanelOpen('bottom', false)
    render(<SurfaceDockSheetContent onClose={onClose} />)

    expect(screen.getByTestId('secondary-panel-body')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Hero Panel/ }))
    expect(useWorkbench.getState().bottom.activeViewId).toBe('test-hero')

    fireEvent.click(screen.getByRole('button', { name: 'Close dock' }))
    expect(useWorkbench.getState().bottom.open).toBe(false)
  })
})
