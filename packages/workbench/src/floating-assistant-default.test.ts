/**
 * The Floating Assistant island starts minimized on desktop (its full island is
 * one click away via the reopener pill, but it doesn't claim editor space at
 * rest). `floatAi` is desktop-only (MobileShell ignores it) and non-persisted
 * (excluded from `partialize`), so the store default is authoritative every
 * load — this guards that default. See FloatingDock.tsx: `floatAi === false`
 * renders the "Open assistant" reopener pill instead of <Assistant />.
 */
import { describe, expect, it } from 'vitest'
import { useWorkbench } from './state'

describe('floating assistant default', () => {
  it('starts minimized (floatAi false) so the Assistant does not claim space at rest', () => {
    // Pristine store default — this file runs in its own isolated module
    // registry, so no other suite's setState has mutated it.
    expect(useWorkbench.getState().floatAi).toBe(false)
  })
})
