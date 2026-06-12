import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { MarkdownContent } from './MarkdownContent'

/**
 * Regression guard for comment linkification (0170): comments rely on GFM
 * autolink literals in MarkdownContent, not on LinkifiedText. These must
 * keep working unchanged.
 */
describe('MarkdownContent autolink literals', () => {
  it('linkifies bare URLs with safe attributes', () => {
    render(<MarkdownContent content="see https://example.com/docs today" />)
    const link = screen.getByRole('link', { name: 'https://example.com/docs' })
    expect(link.getAttribute('href')).toBe('https://example.com/docs')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('linkifies www domains and emails', () => {
    render(<MarkdownContent content="visit www.example.com or mail alice@acme.io" />)
    expect(screen.getByRole('link', { name: 'www.example.com' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'alice@acme.io' }).getAttribute('href')).toBe(
      'mailto:alice@acme.io'
    )
  })

  it('renders explicit markdown links', () => {
    render(<MarkdownContent content="[docs](https://example.com/docs)" />)
    expect(screen.getByRole('link', { name: 'docs' }).getAttribute('href')).toBe(
      'https://example.com/docs'
    )
  })
})
