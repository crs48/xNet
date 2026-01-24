import { describe, it, expect } from 'vitest'
import { XNetDevToolsProvider, useDevTools } from './index'

describe('Production exports (no-op)', () => {
  it('XNetDevToolsProvider passes through children', () => {
    const result = XNetDevToolsProvider({ children: 'hello' })
    expect(result).toBe('hello')
  })

  it('useDevTools returns no-op values', () => {
    const dt = useDevTools()
    expect(dt.isOpen).toBe(false)
    expect(dt.toggle).toBeInstanceOf(Function)
    expect(dt.eventBus).toBeNull()
    // toggle should not throw
    dt.toggle()
  })
})
