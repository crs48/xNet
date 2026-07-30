/**
 * Arrange mode (0282 phase 3): the schematic edits the tree through the
 * same store actions as every other road, Esc exits before the shell
 * ladder, and a changed tree earns the save nudge on exit.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ArrangeOverlay } from './ArrangeOverlay'
import { registerBuiltinSlotViews } from './builtin-slot-views'
import { regionOf } from './layout-tree'
import { useWorkbench } from './state'

registerBuiltinSlotViews()

beforeEach(() => {
  useWorkbench.getState().applyPreset('bench')
  useWorkbench.getState().setArranging(true)
})

describe('ArrangeOverlay', () => {
  it('renders every dock as a labeled slot with its chips', () => {
    render(<ArrangeOverlay />)
    expect(screen.getByRole('region', { name: 'left dock' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'corner dock' })).toBeTruthy()
    // Explorer chip sits in the left dock slot.
    const left = screen.getByRole('region', { name: 'left dock' })
    expect(left.querySelector('[data-arrange-chip="explorer"]')).toBeTruthy()
  })

  it('tier toggle and hide go through setSlotTier', () => {
    render(<ArrangeOverlay />)
    fireEvent.click(screen.getByRole('button', { name: 'Hide Explorer' }))
    const tree = useWorkbench.getState().tree
    const placement = tree.regions['dock.left'].find((p) => p.viewId === 'explorer')
    expect(placement?.tier).toBe('hidden')
    // The hidden tray now offers it back.
    expect(screen.getByRole('region', { name: 'Hidden views' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show Explorer' }))
    expect(
      useWorkbench.getState().tree.regions['dock.left'].find((p) => p.viewId === 'explorer')?.tier
    ).toBe('summoned')
  })

  it('Esc with an unchanged tree exits arrange mode directly', () => {
    render(<ArrangeOverlay />)
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    })
    expect(useWorkbench.getState().arranging).toBe(false)
  })

  it('exiting with a changed tree surfaces the save nudge first', () => {
    render(<ArrangeOverlay />)
    act(() => {
      useWorkbench.getState().moveSlot('console', 'dock.corner')
    })
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))
    // Still arranging — the nudge is up.
    expect(useWorkbench.getState().arranging).toBe(true)
    expect(screen.getByText('Keep this arrangement?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(useWorkbench.getState().arranging).toBe(false)
    expect(regionOf(useWorkbench.getState().tree, 'console')).toBe('dock.corner')
  })
})
