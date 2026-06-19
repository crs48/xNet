import type { CoachTip } from './registry'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Coachmark } from './Coachmark'

const TIP: CoachTip = {
  id: 'crm:overview@1',
  view: 'crm',
  anchor: '[data-coach="rail.crm"]',
  title: 'Your CRM',
  body: 'Contacts, deals, and orgs live here.',
  side: 'right'
}

function renderCoachmark(onDismiss = vi.fn()) {
  const anchor = document.createElement('button')
  document.body.appendChild(anchor)
  render(<Coachmark tip={TIP} anchor={anchor} onDismiss={onDismiss} />)
  return { onDismiss, anchor }
}

describe('Coachmark', () => {
  it('renders the tip title and body as a dialog', () => {
    renderCoachmark()
    const dialog = screen.getByRole('dialog', { name: 'Your CRM' })
    expect(dialog.textContent).toContain('Your CRM')
    expect(dialog.textContent).toContain('Contacts, deals, and orgs live here.')
  })

  it('dismisses via the "Got it" button', () => {
    const { onDismiss } = renderCoachmark()
    fireEvent.click(screen.getByText('Got it'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses via the ✕ button', () => {
    const { onDismiss } = renderCoachmark()
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses on Escape', () => {
    const { onDismiss } = renderCoachmark()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
