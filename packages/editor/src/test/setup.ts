/**
 * Test setup for @xnetjs/editor
 */
import * as matchers from '@testing-library/jest-dom/matchers'
import { expect } from 'vitest'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Mock window.matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })
})

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock

// Mock getComputedStyle for ProseMirror
const originalGetComputedStyle = window.getComputedStyle
window.getComputedStyle = (element: Element, pseudoElt?: string | null) => {
  const style = originalGetComputedStyle(element, pseudoElt)
  return {
    ...style,
    getPropertyValue: (prop: string) => {
      if (prop === 'white-space') return 'normal'
      return style.getPropertyValue(prop)
    }
  } as CSSStyleDeclaration
}

// Suppress console errors from ProseMirror in tests
const originalError = console.error
console.error = (...args: unknown[]) => {
  // Filter out known ProseMirror warnings in test environment
  const message = args[0]
  if (typeof message === 'string' && message.includes('contenteditable')) {
    return
  }
  originalError.apply(console, args)
}
