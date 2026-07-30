import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { InspectOverlay } from './InspectOverlay'
import { SOURCE_ATTR } from './resolve-pointed'

/** A stamped element in the document, which the pointer can be over. */
function stamped(ref: string): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute(SOURCE_ATTR, ref)
  document.body.append(el)
  return el
}

/** Move the pointer over `target`. Dispatched ON the element so it bubbles with
 *  the right `event.target`, exactly as a real move does. */
function moveOver(target: Element, altKey: boolean) {
  act(() => {
    target.dispatchEvent(new MouseEvent('mousemove', { altKey, bubbles: true }))
  })
}

function key(type: 'keydown' | 'keyup', altKey: boolean) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { key: 'Alt', altKey }))
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('InspectOverlay', () => {
  it('renders nothing until the modifier is held', () => {
    const target = stamped('apps/web/src/A.tsx:1:1')
    render(<InspectOverlay />)
    moveOver(target, false)
    expect(screen.queryByTestId('inspect-overlay')).toBeNull()
  })

  it('names the lane and the blast radius for a stamped element', () => {
    const target = stamped('packages/views/src/Grid.tsx:20:4')
    render(<InspectOverlay />)
    moveOver(target, true)

    expect(screen.getByTestId('inspect-overlay')).toBeTruthy()
    expect(screen.getByText(/Lane 3 · xNet source/)).toBeTruthy()
    expect(screen.getByText(/draft pull request/)).toBeTruthy()
  })

  it('refuses a kernel package with an explanation rather than a lane badge', () => {
    const target = stamped('packages/sync/src/change.ts:1:1')
    render(<InspectOverlay />)
    moveOver(target, true)

    expect(screen.getByText('Not editable here')).toBeTruthy()
    expect(screen.getByText(/refuses it/)).toBeTruthy()
    expect(screen.queryByText(/Lane 3 · xNet source/)).toBeNull()
  })

  it('shows the element under the pointer when the key goes down without a move', () => {
    // Holding ⌥ and not moving the mouse is the natural gesture; the last known
    // pointer target is remembered so it still resolves.
    const target = stamped('apps/web/src/A.tsx:1:1')
    render(<InspectOverlay />)
    moveOver(target, false) // pointer arrives, no modifier yet
    expect(screen.queryByTestId('inspect-overlay')).toBeNull()
    key('keydown', true)
    expect(screen.getByTestId('inspect-overlay')).toBeTruthy()
  })

  it('disappears when the modifier is released', () => {
    const target = stamped('apps/web/src/A.tsx:1:1')
    render(<InspectOverlay />)
    moveOver(target, true)
    expect(screen.getByTestId('inspect-overlay')).toBeTruthy()
    key('keyup', false)
    expect(screen.queryByTestId('inspect-overlay')).toBeNull()
  })

  it('clears on window blur — a modifier held across an app switch never fires keyup', () => {
    const target = stamped('apps/web/src/A.tsx:1:1')
    render(<InspectOverlay />)
    moveOver(target, true)
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(screen.queryByTestId('inspect-overlay')).toBeNull()
  })

  it('trusts the mouse event over the cached modifier flag', () => {
    const target = stamped('apps/web/src/A.tsx:1:1')
    render(<InspectOverlay />)
    key('keydown', true)
    moveOver(target, false) // released outside the window; no keyup was delivered
    expect(screen.queryByTestId('inspect-overlay')).toBeNull()
  })

  it('follows the pointer from one element to another', () => {
    const grid = stamped('packages/views/src/Grid.tsx:1:1')
    const kernel = stamped('packages/crypto/src/keys.ts:1:1')
    render(<InspectOverlay />)
    moveOver(grid, true)
    expect(screen.getByText(/Lane 3 · xNet source/)).toBeTruthy()
    moveOver(kernel, true)
    expect(screen.getByText('Not editable here')).toBeTruthy()
  })

  it('never intercepts the pointer it is tracking', () => {
    const target = stamped('apps/web/src/A.tsx:1:1')
    render(<InspectOverlay />)
    moveOver(target, true)
    const overlay = screen.getByTestId('inspect-overlay')
    expect(overlay.className).toContain('pointer-events-none')
    expect(overlay.getAttribute('aria-hidden')).toBe('true')
  })

  it('offers no edit affordance — W1 ships the resolver, not the editor', () => {
    const target = stamped('apps/web/src/A.tsx:1:1')
    render(<InspectOverlay />)
    moveOver(target, true)
    const overlay = screen.getByTestId('inspect-overlay')
    expect(overlay.querySelectorAll('button, input, textarea, a')).toHaveLength(0)
  })
})
