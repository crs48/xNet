import { render } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  startViewTransition,
  supportsViewTransitions,
  useViewTransition
} from './useViewTransition'

type DocWithVT = { startViewTransition?: (cb: () => void) => unknown }
const vtDoc = document as unknown as DocWithVT

function setMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
}

afterEach(() => {
  delete vtDoc.startViewTransition
})

describe('supportsViewTransitions', () => {
  it('is false when the API is absent', () => {
    expect(supportsViewTransitions()).toBe(false)
  })
  it('is true when document.startViewTransition exists', () => {
    vtDoc.startViewTransition = (cb) => cb()
    expect(supportsViewTransitions()).toBe(true)
  })
})

describe('startViewTransition', () => {
  it('runs the mutation directly when unsupported', () => {
    const mutate = vi.fn()
    startViewTransition(mutate)
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('routes the mutation through the API when supported', () => {
    const api = vi.fn((cb: () => void) => cb())
    vtDoc.startViewTransition = api
    const mutate = vi.fn()
    startViewTransition(mutate)
    expect(api).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})

describe('useViewTransition', () => {
  function Harness({ onReady }: { onReady: (fn: (m: () => void) => void) => void }) {
    const withTransition = useViewTransition()
    onReady(withTransition)
    return null
  }

  it('applies the mutation instantly under reduced motion (skips the API)', () => {
    setMatchMedia(true)
    const api = vi.fn((cb: () => void) => cb())
    vtDoc.startViewTransition = api
    let withTransition!: (m: () => void) => void
    render(<Harness onReady={(fn) => (withTransition = fn)} />)
    const mutate = vi.fn()
    withTransition(mutate)
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(api).not.toHaveBeenCalled()
  })

  it('uses a view transition when motion is allowed and supported', () => {
    setMatchMedia(false)
    const api = vi.fn((cb: () => void) => cb())
    vtDoc.startViewTransition = api
    let withTransition!: (m: () => void) => void
    render(<Harness onReady={(fn) => (withTransition = fn)} />)
    const mutate = vi.fn()
    withTransition(mutate)
    expect(api).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})
