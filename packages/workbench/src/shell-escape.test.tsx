/**
 * 0280 validation: the pinned Esc ladder walks down one dock per press
 * (bottom → right → left → bare surface), and a slot move re-renders only
 * tree subscribers — never the whole frame (profiler bound).
 */
import { render } from '@testing-library/react'
import React, { useRef } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useShellEscape } from './commands'
import { useWorkbench } from './state'

function EscapeProbe() {
  useShellEscape()
  return null
}

function pressEscape() {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  )
}

beforeEach(() => {
  useWorkbench.getState().applyPreset('bench')
  useWorkbench.setState({
    left: { open: true, activeViewId: 'explorer' },
    right: { open: true, activeViewId: 'context' },
    bottom: { open: true, activeViewId: 'shelf' },
    chrome: 'pinned',
    mode: 'default'
  })
})

describe('Esc ladder (pinned frame)', () => {
  it('closes one dock per press: bottom, right, left, then rests', () => {
    render(<EscapeProbe />)
    pressEscape()
    expect(useWorkbench.getState().bottom.open).toBe(false)
    expect(useWorkbench.getState().right.open).toBe(true)
    pressEscape()
    expect(useWorkbench.getState().right.open).toBe(false)
    expect(useWorkbench.getState().left.open).toBe(true)
    pressEscape()
    expect(useWorkbench.getState().left.open).toBe(false)
    // Bare surface: a further Esc is a no-op, not an error.
    pressEscape()
    expect(useWorkbench.getState().left.open).toBe(false)
  })

  it('never steals Esc from text inputs', () => {
    render(
      <>
        <EscapeProbe />
        <input data-testid="field" />
      </>
    )
    const field = document.querySelector('input') as HTMLInputElement
    field.focus()
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(useWorkbench.getState().bottom.open).toBe(true)
  })
})

/** Renders on every commit; subscribed to an UNRELATED store slice. */
function RenderCounter({ counter }: { counter: { count: number } }) {
  const recents = useWorkbench((state) => state.recents)
  const renders = useRef(0)
  renders.current += 1
  counter.count = renders.current
  return <span data-recents={recents.length} />
}

describe('slot move re-render bound (0280 validation)', () => {
  it('does not re-render components subscribed to unrelated slices', () => {
    const counter = { count: 0 }
    render(<RenderCounter counter={counter} />)
    const before = counter.count
    useWorkbench.getState().moveSlot('console', 'dock.corner')
    useWorkbench.getState().moveSlot('shelf', 'dock.right')
    useWorkbench.getState().setSlotTier('capture', 'hidden')
    expect(counter.count).toBe(before)
  })
})
