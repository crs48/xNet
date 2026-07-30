/**
 * Regression: the Select popup's height clamp must live on the LIST.
 *
 * Base UI computes scroll-arrow visibility from the `Select.List` element
 * (`store.state.listElement || popupRef`). With `max-h-96 overflow-hidden`
 * on the Popup and an unclamped List, the List reports itself unscrollable:
 * ScrollUp/DownArrow never render and wheel events do nothing, so any Select
 * with more options than fit the clamp (e.g. the database field-type picker's
 * 13th entry, "File") is unreachable by mouse.
 *
 * jsdom has no layout, so this asserts the class placement that the live fix
 * was verified with: the clamp + overflow-y-auto on the listbox, not on the
 * popup.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Select, SelectContent, SelectItem, SelectRoot, SelectTrigger, SelectValue } from './Select'

const MANY_OPTIONS = Array.from({ length: 18 }, (_, i) => ({
  value: `option-${i + 1}`,
  label: `Option ${i + 1}`
}))

/** Walk up from an option to the Base UI Popup (the element with popover chrome). */
function findPopup(option: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = option.parentElement
  while (el && !el.classList.contains('bg-popover')) {
    el = el.parentElement
  }
  return el
}

describe('Select popup scrolling', () => {
  it('clamps the simple Select on the list so Base UI sees it as scrollable', async () => {
    render(<Select options={MANY_OPTIONS} value="option-1" />)

    screen.getByRole('combobox').click()

    const lastOption = await screen.findByRole('option', { name: 'Option 18' })
    const listbox = lastOption.closest('[role="listbox"]')
    expect(listbox).not.toBeNull()
    expect(listbox!.classList.contains('max-h-96')).toBe(true)
    expect(listbox!.classList.contains('overflow-y-auto')).toBe(true)

    const popup = findPopup(lastOption)
    expect(popup).not.toBeNull()
    expect(popup!.classList.contains('max-h-96')).toBe(false)
  })

  it('clamps the compound SelectContent on the list, not the popup', async () => {
    render(
      <SelectRoot value="option-1">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MANY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
    )

    screen.getByRole('combobox').click()

    const lastOption = await screen.findByRole('option', { name: 'Option 18' })
    const listbox = lastOption.closest('[role="listbox"]')
    expect(listbox).not.toBeNull()
    expect(listbox!.classList.contains('max-h-96')).toBe(true)
    expect(listbox!.classList.contains('overflow-y-auto')).toBe(true)

    const popup = findPopup(lastOption)
    expect(popup).not.toBeNull()
    expect(popup!.classList.contains('max-h-96')).toBe(false)
  })
})
