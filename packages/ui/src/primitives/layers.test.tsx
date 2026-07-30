/**
 * Regression: portalled popups must carry a z-index on the POSITIONER.
 *
 * The table view's field menu is a `z-40` scrim with the popover inside it;
 * the Select's dropdown portals to <body>, so with a bare (z-index: auto)
 * positioner the scrim painted over the open dropdown and swallowed its
 * clicks — the field type could not be changed at all.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { POPUP_LAYER } from './layers'
import { Select } from './Select'

describe('portalled popup layering', () => {
  it('puts POPUP_LAYER on the select positioner, above app overlay z-indexes', async () => {
    render(
      <Select
        options={[
          { value: 'text', label: 'Text' },
          { value: 'number', label: 'Number' }
        ]}
        value="text"
      />
    )

    screen.getByRole('combobox').click()

    const option = await screen.findByRole('option', { name: 'Text' })
    let positioner: HTMLElement | null = option.parentElement
    while (positioner && !positioner.classList.contains(POPUP_LAYER)) {
      positioner = positioner.parentElement
    }
    expect(positioner).not.toBeNull()
  })

  it('sits above every overlay layer the shell uses', () => {
    const z = Number(POPUP_LAYER.match(/z-\[(\d+)\]/)?.[1])
    // App overlays top out at z-[200]; devtools at z-[10000].
    expect(z).toBeGreaterThan(10000)
  })
})
