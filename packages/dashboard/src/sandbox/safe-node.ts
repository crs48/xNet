/**
 * SafeNode - The serializable render tree user-authored widgets return.
 *
 * User widget code never produces React elements or touches the DOM: its
 * render(props) returns this restricted JSON tree, which crosses the
 * Worker/iframe postMessage boundary and is materialized by the host with a
 * tag allowlist and sanitized props. This is what keeps the renderer
 * capability-safe even before considering realm isolation.
 */

import { createElement, type ReactNode } from 'react'

export const SAFE_NODE_TAGS = new Set([
  'div',
  'span',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'progress'
])

const SAFE_STYLE_KEYS = new Set([
  'color',
  'background',
  'fontSize',
  'fontWeight',
  'textAlign',
  'padding',
  'margin',
  'display',
  'flexDirection',
  'gap',
  'alignItems',
  'justifyContent',
  'overflow',
  'borderRadius',
  'width',
  'height',
  'maxHeight',
  'opacity'
])

export type SafeNode =
  | string
  | number
  | {
      tag: string
      style?: Record<string, string | number>
      children?: SafeNode[]
    }

const MAX_NODES = 2000
const MAX_DEPTH = 32

/** Render a SafeNode tree to React elements, enforcing the allowlists. */
export function renderSafeNode(node: SafeNode): ReactNode {
  const budget = { nodes: 0 }
  return renderInner(node, 0, budget)
}

function renderInner(node: SafeNode, depth: number, budget: { nodes: number }): ReactNode {
  if (depth > MAX_DEPTH || budget.nodes >= MAX_NODES) return null
  budget.nodes += 1

  if (typeof node === 'string' || typeof node === 'number') return node
  if (!node || typeof node !== 'object') return null

  const tag = SAFE_NODE_TAGS.has(node.tag) ? node.tag : 'div'
  const style: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(node.style ?? {})) {
    if (SAFE_STYLE_KEYS.has(key) && (typeof value === 'string' || typeof value === 'number')) {
      // Block url(...) and CSS escapes that could exfiltrate via styles.
      if (typeof value === 'string' && /url\s*\(|expression\s*\(|\\/i.test(value)) continue
      style[key] = value
    }
  }

  const children = Array.isArray(node.children)
    ? node.children.map((child, index) =>
        createElement(
          'span',
          { key: index, style: { display: 'contents' } },
          renderInner(child, depth + 1, budget)
        )
      )
    : undefined

  return createElement(tag, { style }, children)
}
