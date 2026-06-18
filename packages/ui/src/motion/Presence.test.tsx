import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { Presence } from './Presence'

describe('Presence', () => {
  it('renders nothing when initially hidden', () => {
    const { container } = render(
      <Presence show={false}>
        <p>toast</p>
      </Presence>
    )
    expect(container.textContent).toBe('')
    expect(screen.queryByText('toast')).toBeNull()
  })

  it('renders the child with open state and the chosen motion when shown', () => {
    render(
      <Presence show motion="slide-up">
        <p>toast</p>
      </Presence>
    )
    const node = screen.getByText('toast').parentElement!
    expect(node.getAttribute('data-state')).toBe('open')
    expect(node.getAttribute('data-motion')).toBe('slide-up')
    expect(node.className).toContain('motion-presence')
  })

  it('keeps the child mounted during exit, then unmounts on animationend', () => {
    const { rerender, container } = render(
      <Presence show motion="fade">
        <p>toast</p>
      </Presence>
    )
    // Flip to hidden — the node must remain in the DOM to play its exit.
    rerender(
      <Presence show={false} motion="fade">
        <p>toast</p>
      </Presence>
    )
    const node = screen.getByText('toast').parentElement!
    expect(node.getAttribute('data-state')).toBe('closed')

    // Exit animation finishes → unmount.
    fireEvent.animationEnd(node)
    expect(container.textContent).toBe('')
  })

  it('cancels a pending unmount if shown again before the exit finishes', () => {
    const { rerender } = render(<Presence show>content</Presence>)
    rerender(<Presence show={false}>content</Presence>)
    rerender(<Presence show>content</Presence>)
    // Re-shown: state is open again and the child is still present.
    expect(screen.getByText('content').getAttribute('data-state')).toBe('open')
  })

  it('honors the `as` tag and forwards wrapperProps', () => {
    render(
      <Presence show as="section" wrapperProps={{ role: 'status', 'aria-live': 'polite' }}>
        banner
      </Presence>
    )
    const node = screen.getByRole('status')
    expect(node.tagName).toBe('SECTION')
    expect(node.getAttribute('aria-live')).toBe('polite')
  })
})
