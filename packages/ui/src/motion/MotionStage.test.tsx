import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { MotionStage } from './MotionStage'

/**
 * The contract worth testing here is the degraded path, not the animation:
 * children must be visible BEFORE the lazy feature chunk resolves, because the
 * alternative is a blank tab bar on first drag. See the comment on MotionStage.
 */
describe('MotionStage', () => {
  it('renders children synchronously, before the feature chunk resolves', () => {
    // No await: this asserts the Suspense fallback, which is the children
    // themselves. If the fallback were a spinner this would fail.
    render(
      <MotionStage>
        <span>tab</span>
      </MotionStage>
    )
    expect(screen.getByText('tab')).toBeTruthy()
  })

  it('still renders children once the feature chunk has loaded', async () => {
    render(
      <MotionStage>
        <span>settled</span>
      </MotionStage>
    )
    // After the dynamic import resolves, LazyMotion takes over and the same
    // children must survive the swap — exactly one copy, not two.
    await waitFor(() => {
      expect(screen.getAllByText('settled')).toHaveLength(1)
    })
  })

  it('defaults to honouring prefers-reduced-motion', async () => {
    // `reducedMotion="user"` is the accessible default: motion.css's global
    // collapse cannot reach Motion's inline transforms, so the prop is the
    // only thing enforcing it for this subtree.
    const { container } = render(
      <MotionStage>
        <span>a11y</span>
      </MotionStage>
    )
    await waitFor(() => expect(screen.getByText('a11y')).toBeTruthy())
    expect(container.textContent).toBe('a11y')
  })

  it('accepts an explicit reducedMotion override without dropping children', async () => {
    render(
      <MotionStage reducedMotion="never">
        <span>override</span>
      </MotionStage>
    )
    await waitFor(() => expect(screen.getByText('override')).toBeTruthy())
  })
})
