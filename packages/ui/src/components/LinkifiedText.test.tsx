import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LinkifiedText } from './LinkifiedText'

describe('LinkifiedText', () => {
  it('renders plain text without links unchanged', () => {
    render(<LinkifiedText value="just words here" />)
    expect(screen.getByText('just words here')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders detected URLs as safe external links', () => {
    render(<LinkifiedText value="see https://example.com/docs now" />)
    const link = screen.getByRole('link', { name: 'https://example.com/docs' })
    expect(link.getAttribute('href')).toBe('https://example.com/docs')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('renders fuzzy domains with an https href', () => {
    render(<LinkifiedText value="see example.com now" />)
    expect(screen.getByRole('link', { name: 'example.com' }).getAttribute('href')).toBe(
      'https://example.com'
    )
  })

  it('renders emails as mailto links without target=_blank', () => {
    render(<LinkifiedText value="ping alice@acme.io" />)
    const link = screen.getByRole('link', { name: 'alice@acme.io' })
    expect(link.getAttribute('href')).toBe('mailto:alice@acme.io')
    expect(link.getAttribute('target')).toBeNull()
  })

  it('keeps surrounding text intact around links', () => {
    const { container } = render(<LinkifiedText value="a example.com b" />)
    expect(container.textContent).toBe('a example.com b')
  })

  it('stops click propagation so parent interactions do not fire', () => {
    const onParentClick = vi.fn()
    render(
      <div onClick={onParentClick}>
        <LinkifiedText value="see https://example.com" />
      </div>
    )
    const link = screen.getByRole('link')
    // prevent jsdom from attempting navigation
    link.addEventListener('click', (e) => e.preventDefault())
    fireEvent.click(link)
    expect(onParentClick).not.toHaveBeenCalled()
  })

  it('does not detect phones unless opted in', () => {
    render(<LinkifiedText value="call +1 415 555 2671 today" />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('detects phone numbers as tel links when detectPhones is set', async () => {
    render(<LinkifiedText value="call +1 415 555 2671 today" detectPhones />)
    const link = await screen.findByRole('link', { name: '+1 415 555 2671' })
    expect(link.getAttribute('href')).toBe('tel:+14155552671')
    expect(link.getAttribute('target')).toBeNull()
  })

  it('renders non-string values as text instead of crashing', () => {
    // Database cell renderers pass raw property values (formula/rollup
    // results are numbers) — regression test for the Tasks Tracker crash.
    render(<LinkifiedText value={42 as unknown as string} />)
    expect(screen.getByText('42')).toBeTruthy()

    const { container } = render(<LinkifiedText value={null as unknown as string} />)
    expect(container.textContent).toBe('')
  })

  it('applies the wrapper and link classes', () => {
    render(
      <LinkifiedText value="see example.com" className="wrapper-class" linkClassName="link-class" />
    )
    expect(screen.getByRole('link').className).toBe('link-class')
    expect(screen.getByText(/see/).className).toBe('wrapper-class')
  })
})
