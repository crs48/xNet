/**
 * Regression: `MenuLabel` must not require a `<Menu.Group>` ancestor.
 *
 * It used to render Base UI's `Menu.GroupLabel`, which throws
 * "MenuGroupRootContext is missing" unless a `Menu.Group` is above it. The
 * simple `Menu` has no groups, so every consumer crashed the instant the menu
 * opened — and with no error boundary above it in the desktop shell, the whole
 * React tree unmounted to a blank window (exploration 0406).
 *
 * The desktop system menu is the app's only navigation affordance, so this is
 * asserted at the primitive: any simple `Menu` containing a `MenuLabel` must
 * open without throwing.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from './Menu'

function SystemMenuShape() {
  return (
    <Menu trigger={<button type="button">Open</button>}>
      <MenuLabel>Workspace</MenuLabel>
      <MenuItem onSelect={() => {}}>Settings</MenuItem>
      <MenuSeparator />
      <MenuLabel>Theme</MenuLabel>
      <MenuItem onSelect={() => {}}>Dark</MenuItem>
    </Menu>
  )
}

describe('MenuLabel inside the simple Menu', () => {
  it('opens without throwing', async () => {
    render(<SystemMenuShape />)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    // Reaching an item at all means the popup mounted rather than throwing
    // during render.
    expect(await screen.findByText('Settings')).toBeTruthy()
    expect(screen.getByText('Workspace')).toBeTruthy()
    expect(screen.getByText('Theme')).toBeTruthy()
  })

  it('renders labels outside the menu item roles', async () => {
    render(<SystemMenuShape />)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByText('Settings')

    // A label is decoration, not a target: it must not be announced or
    // arrow-key reachable as a menu item.
    const itemNames = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(itemNames).not.toContain('Workspace')
    expect(itemNames).not.toContain('Theme')
  })
})
