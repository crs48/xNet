/**
 * Regression tests for the text property handler receiving non-string values.
 *
 * The text handler is `getPropertyHandler`'s fallback for unknown property
 * types — notably `formula` and `rollup`, whose computed cell values are
 * numbers. Rendering the seeded "Tasks Tracker" database (formula column
 * "Effort ×2") used to crash the editor with `str.replace is not a function`
 * inside linkify-it.
 */
import { render } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { getPropertyHandler, textHandler } from './index.js'

describe('textHandler with non-string values', () => {
  it('is the fallback handler for formula and rollup columns', () => {
    expect(getPropertyHandler('formula')).toBe(textHandler)
    expect(getPropertyHandler('rollup')).toBe(textHandler)
  })

  it('renders numeric values (formula results) without crashing', () => {
    const { container } = render(<>{textHandler.render(12 as unknown as string)}</>)
    expect(container.textContent).toBe('12')
  })

  it('renders zero as text, not as Empty', () => {
    const { container } = render(<>{textHandler.render(0 as unknown as string)}</>)
    expect(container.textContent).toBe('0')
  })

  it('renders null/undefined/empty as the Empty placeholder', () => {
    for (const value of [null, undefined, '']) {
      const { container } = render(<>{textHandler.render(value as unknown as string)}</>)
      expect(container.textContent).toBe('Empty')
    }
  })

  it('compares non-string values without crashing', () => {
    expect(textHandler.compare(2 as unknown as string, 10 as unknown as string)).not.toBeNaN()
    expect(textHandler.compare(null, 5 as unknown as string)).toBeLessThan(0)
  })

  it('filters non-string values without crashing', () => {
    expect(textHandler.applyFilter(12 as unknown as string, 'contains', '1')).toBe(true)
    expect(textHandler.applyFilter(12 as unknown as string, 'isEmpty', undefined)).toBe(false)
    expect(textHandler.applyFilter(null, 'isEmpty', undefined)).toBe(true)
  })
})
