/**
 * Slot-drag lifecycle + announcer diff (0282 phase 2): the drag store
 * broadcasts begin/end (with the window safety net), the landing flash
 * expires, and the announcer diff catches moves from ANY road.
 */
import { act, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerBuiltinSlotViews } from './builtin-slot-views'
import { createPresetTree, moveSlot } from './layout-tree'
import {
  activeSlotDrag,
  beginSlotDrag,
  endSlotDrag,
  markSlotLanding,
  useSlotDragActive,
  useSlotLanding
} from './slot-drag'
import { diffPlacements, SlotAnnouncer } from './SlotAnnouncer'
import { useWorkbench } from './state'

registerBuiltinSlotViews()

function DragProbe() {
  const active = useSlotDragActive()
  const landed = useSlotLanding('dock.right')
  return <span data-testid="probe" data-drag={active?.viewId ?? 'none'} data-landed={landed} />
}

beforeEach(() => {
  endSlotDrag()
  useWorkbench.getState().applyPreset('calm')
})

describe('slot drag lifecycle', () => {
  it('broadcasts begin/end to subscribers', () => {
    render(<DragProbe />)
    expect(screen.getByTestId('probe').dataset.drag).toBe('none')
    act(() => beginSlotDrag('tasks'))
    expect(screen.getByTestId('probe').dataset.drag).toBe('tasks')
    act(() => endSlotDrag())
    expect(screen.getByTestId('probe').dataset.drag).toBe('none')
  })

  it('window dragend is the safety net for unmounted sources', () => {
    render(<DragProbe />)
    act(() => beginSlotDrag('tasks'))
    act(() => {
      window.dispatchEvent(new Event('dragend'))
    })
    expect(activeSlotDrag()).toBeNull()
    expect(screen.getByTestId('probe').dataset.drag).toBe('none')
  })

  it('the landing flash turns itself off after 700ms', () => {
    vi.useFakeTimers()
    render(<DragProbe />)
    act(() => markSlotLanding('dock.right'))
    expect(screen.getByTestId('probe').dataset.landed).toBe('true')
    act(() => {
      vi.advanceTimersByTime(750)
    })
    expect(screen.getByTestId('probe').dataset.landed).toBe('false')
    vi.useRealTimers()
  })
})

describe('announcer', () => {
  it('diffPlacements reports exactly the moved views', () => {
    const before = createPresetTree('calm')
    const after = moveSlot(before, 'context', 'dock.left')
    expect(diffPlacements(before, after)).toEqual([{ viewId: 'context', region: 'dock.left' }])
    expect(diffPlacements(before, before)).toEqual([])
  })

  it('announces store moves from any road with the view label', () => {
    render(<SlotAnnouncer />)
    act(() => {
      useWorkbench.getState().moveSlot('context', 'dock.left')
    })
    expect(screen.getByRole('status').textContent).toBe('Context moved to left dock')
  })
})
