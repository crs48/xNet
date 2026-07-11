/**
 * Link up-res context integration (exploration 0295): LinkifiedText and
 * MarkdownContent substitute provider-rendered content for URLs and fall
 * back to plain anchors otherwise.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LinkifiedText } from './LinkifiedText'
import { LinkUpresProvider, type LinkUpresRenderer } from './LinkUpres'
import { MarkdownContent } from './MarkdownContent'

const upresXnet: LinkUpresRenderer = (link) =>
  link.href.includes('xnet.fyi') ? <button type="button">chip:{link.href}</button> : null

describe('LinkifiedText + LinkUpres', () => {
  it('renders provider content for matching URLs', () => {
    render(
      <LinkUpresProvider render={upresXnet}>
        <LinkifiedText value="see https://xnet.fyi/app/#/doc/abc ok" />
      </LinkUpresProvider>
    )
    expect(screen.getByRole('button').textContent).toBe('chip:https://xnet.fyi/app/#/doc/abc')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('falls back to the plain anchor when the renderer declines', () => {
    render(
      <LinkUpresProvider render={upresXnet}>
        <LinkifiedText value="see https://example.com/page" />
      </LinkUpresProvider>
    )
    const anchor = screen.getByRole('link')
    expect(anchor.getAttribute('href')).toBe('https://example.com/page')
  })

  it('renders plain anchors when no provider is mounted', () => {
    render(<LinkifiedText value="see https://xnet.fyi/app/#/doc/abc" />)
    expect(screen.getByRole('link')).toBeTruthy()
  })
})

describe('MarkdownContent + LinkUpres', () => {
  it('substitutes autolinked URLs in markdown', () => {
    render(
      <LinkUpresProvider render={upresXnet}>
        <MarkdownContent content="see https://xnet.fyi/app/#/doc/abc" />
      </LinkUpresProvider>
    )
    expect(screen.getByRole('button').textContent).toContain('chip:')
  })

  it('keeps styled anchors for declined links', () => {
    render(
      <LinkUpresProvider render={upresXnet}>
        <MarkdownContent content="[docs](https://example.com/docs)" />
      </LinkUpresProvider>
    )
    const anchor = screen.getByRole('link')
    expect(anchor.getAttribute('href')).toBe('https://example.com/docs')
    expect(anchor.getAttribute('target')).toBe('_blank')
  })
})
