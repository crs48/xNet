import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { SensitiveContent, labelText } from './SensitiveContent'

describe('SensitiveContent', () => {
  it('shows content unchanged when visibility is show', () => {
    render(
      <SensitiveContent visibility="show">
        <p>hello</p>
      </SensitiveContent>
    )
    expect(screen.getByText('hello')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders nothing (or a placeholder) when hidden', () => {
    const { container, rerender } = render(
      <SensitiveContent visibility="hide">
        <p>secret</p>
      </SensitiveContent>
    )
    expect(screen.queryByText('secret')).toBeNull()
    expect(container.textContent).toBe('')
    rerender(
      <SensitiveContent visibility="hide" hiddenPlaceholder={<span>removed</span>}>
        <p>secret</p>
      </SensitiveContent>
    )
    expect(screen.getByText('removed')).toBeTruthy()
  })

  it('shows a warning banner but keeps content visible for warn', () => {
    render(
      <SensitiveContent visibility="warn" labels={['sexual']}>
        <p>warned</p>
      </SensitiveContent>
    )
    expect(screen.getByRole('note').textContent).toContain('Sexually suggestive')
    expect(screen.getByText('warned')).toBeTruthy()
  })

  it('blurs and reveals on click', () => {
    render(
      <SensitiveContent visibility="blur" labels={['porn']}>
        <p>nsfw</p>
      </SensitiveContent>
    )
    const button = screen.getByRole('button', { name: /Reveal hidden content/ })
    expect(button.textContent).toContain('Explicit content')
    fireEvent.click(button)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('nsfw')).toBeTruthy()
  })

  it('shows source attribution on the warn banner', () => {
    render(
      <SensitiveContent visibility="warn" labels={['sexual']} attribution="via did:key:zAB…">
        <p>warned</p>
      </SensitiveContent>
    )
    expect(screen.getByRole('note').textContent).toContain('via did:key:zAB…')
  })

  it('shows source attribution on the blur veil', () => {
    render(
      <SensitiveContent visibility="blur" labels={['porn']} attribution="via did:key:zAB…">
        <p>nsfw</p>
      </SensitiveContent>
    )
    expect(screen.getByRole('button').textContent).toContain('via did:key:zAB…')
  })

  it('labelText maps known labels and falls back gracefully', () => {
    expect(labelText(['porn', 'graphic-media'])).toBe('Explicit content, Graphic media')
    expect(labelText([])).toBe('Sensitive content')
    expect(labelText(['unknown'])).toBe('unknown')
  })
})
