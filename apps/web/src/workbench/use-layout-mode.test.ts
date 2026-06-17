import { describe, expect, it } from 'vitest'
import { LAYOUT_BREAKPOINTS, resolveLayoutMode } from './use-layout-mode'

describe('resolveLayoutMode', () => {
  it('is compact when neither breakpoint matches (phone)', () => {
    expect(resolveLayoutMode(false, false)).toBe('compact')
  })

  it('is medium at tablet widths (≥768, <1024)', () => {
    expect(resolveLayoutMode(true, false)).toBe('medium')
  })

  it('is expanded at desktop widths (≥1024)', () => {
    expect(resolveLayoutMode(true, true)).toBe('expanded')
  })

  it('treats expanded as authoritative even if the medium query is stale', () => {
    // matchMedia results should never disagree this way, but the resolver
    // must not fall through to compact when expanded matches.
    expect(resolveLayoutMode(false, true)).toBe('expanded')
  })

  it('keeps the documented breakpoint boundaries', () => {
    expect(LAYOUT_BREAKPOINTS.medium).toBe(768)
    expect(LAYOUT_BREAKPOINTS.expanded).toBe(1024)
  })
})
