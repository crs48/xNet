/**
 * SafeNode renderer allowlist tests.
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderSafeNode, type SafeNode } from '../safe-node'

function html(node: SafeNode): string {
  return render(<>{renderSafeNode(node)}</>).container.innerHTML
}

describe('renderSafeNode', () => {
  it('renders allowlisted tags, text, and numbers', () => {
    const markup = html({
      tag: 'ul',
      children: [
        { tag: 'li', children: ['first'] },
        { tag: 'li', children: [2] }
      ]
    })

    expect(markup).toContain('<ul>')
    expect(markup).toContain('first')
    expect(markup).toContain('2')
  })

  it('coerces non-allowlisted tags to div', () => {
    const markup = html({ tag: 'script', children: ['alert(1)'] })
    expect(markup).not.toContain('<script')
    expect(markup).toContain('<div')
  })

  it('drops non-allowlisted and url-bearing styles', () => {
    const markup = html({
      tag: 'div',
      style: {
        color: 'red',
        position: 'fixed',
        background: 'url(https://evil.example/x)'
      } as Record<string, string>,
      children: ['x']
    })

    expect(markup).toContain('color: red')
    expect(markup).not.toContain('position')
    expect(markup).not.toContain('url(')
  })

  it('caps runaway trees instead of exhausting the renderer', () => {
    const wide: SafeNode = {
      tag: 'div',
      children: Array.from({ length: 5000 }, (_, index) => `${index}`)
    }

    const markup = html(wide)
    expect(markup).toContain('0')
    expect(markup).not.toContain('4999')
  })
})
