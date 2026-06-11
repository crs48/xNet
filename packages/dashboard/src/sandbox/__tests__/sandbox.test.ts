/**
 * Sandbox isolation tests (0162 phase 4 validation): user-authored widget
 * code cannot read window, document, or unendowed store APIs from its
 * compartment; the SafeNode renderer enforces its allowlists.
 */

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { evaluateUserWidget, renderUserWidget } from '../compartment'

const PROPS = { config: {}, rows: [], variables: {}, width: 100, height: 100 }

describe('user widget compartment', () => {
  it('evaluates render(props) over endowed globals only', () => {
    const render = evaluateUserWidget(`
      function render(props) {
        return { tag: 'div', children: ['rows:' + props.rows.length, ' max:' + Math.max(1, 2)] }
      }
    `)

    expect(render({ ...PROPS, rows: [{ id: 'a' }] })).toEqual({
      tag: 'div',
      children: ['rows:1', ' max:2']
    })
  })

  it('cannot read window or document', () => {
    // jsdom HAS window/document in the host realm; the compartment must not.
    expect(typeof window).toBe('object')
    expect(typeof document).toBe('object')

    const probe = evaluateUserWidget(`
      function render() {
        return {
          tag: 'div',
          children: [typeof window, ' ', typeof document, ' ', typeof globalThis.window]
        }
      }
    `)

    expect(probe(PROPS)).toEqual({
      tag: 'div',
      children: ['undefined', ' ', 'undefined', ' ', 'undefined']
    })
  })

  it('cannot reach fetch, XMLHttpRequest, Worker, or store APIs', () => {
    const probe = evaluateUserWidget(`
      function render() {
        return {
          tag: 'div',
          children: [
            typeof fetch, ' ', typeof XMLHttpRequest, ' ', typeof Worker, ' ',
            typeof indexedDB, ' ', typeof localStorage
          ]
        }
      }
    `)

    expect(probe(PROPS)).toEqual({
      tag: 'div',
      children: [
        'undefined',
        ' ',
        'undefined',
        ' ',
        'undefined',
        ' ',
        'undefined',
        ' ',
        'undefined'
      ]
    })
  })

  it('rejects code that does not define render', () => {
    expect(() => evaluateUserWidget('const x = 1')).toThrow(/must define render/)
  })

  it('surfaces user-code errors instead of crashing the host', () => {
    expect(() => renderUserWidget('function render() { throw new Error("boom") }', PROPS)).toThrow(
      'boom'
    )
  })
})
