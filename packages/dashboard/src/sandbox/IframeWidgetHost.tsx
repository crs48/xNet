/**
 * IframeWidgetHost - The 'marketplace' trust-tier execution host (web).
 *
 * Marketplace widget code runs in a sandboxed iframe (allow-scripts only:
 * no same-origin, no top navigation, no forms/popups), giving process-level
 * isolation with its own heap. Props go in and SafeNode trees come back
 * over postMessage; the parent renders the tree through the same allowlist
 * renderer as the user tier, so the iframe never paints host-controlled
 * surfaces directly.
 *
 * Electron hosts swap the <iframe> for a <webview> with contextIsolation
 * and nodeIntegration: false; the message protocol is identical.
 */

import type { WidgetProps } from '../types'
import type { SafeNode } from './safe-node'
import { useEffect, useMemo, useRef, useState } from 'react'
import { renderSafeNode } from './safe-node'

const RENDER_TIMEOUT_MS = 3000

function iframeSrcDoc(code: string): string {
  // The runtime evaluates the marketplace module once, then serves render
  // requests. It runs inside the sandboxed origin; even a full escape of
  // this script is contained by the iframe sandbox flags.
  const runtime = `
    'use strict'
    let render = null
    try {
      const module = { exports: {} }
      const factory = new Function('module', 'exports', ${JSON.stringify(code)})
      factory(module, module.exports)
      render = typeof module.exports === 'function' ? module.exports : module.exports.render
    } catch (error) {
      parent.postMessage({ kind: 'widget-error', error: String(error && error.message || error) }, '*')
    }
    window.addEventListener('message', (event) => {
      const data = event.data
      if (!data || data.kind !== 'widget-render') return
      try {
        if (typeof render !== 'function') throw new Error('widget must export render(props)')
        const tree = JSON.parse(JSON.stringify(render(data.props)))
        parent.postMessage({ kind: 'widget-tree', id: data.id, tree }, '*')
      } catch (error) {
        parent.postMessage({ kind: 'widget-error', id: data.id, error: String(error && error.message || error) }, '*')
      }
    })
    parent.postMessage({ kind: 'widget-ready' }, '*')
  `
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><script>${runtime}</script></body></html>`
}

export interface IframeWidgetHostProps extends WidgetProps {
  /** The marketplace widget module source (CommonJS body exporting render) */
  code: string
}

export function IframeWidgetHost({ code, ...props }: IframeWidgetHostProps): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [tree, setTree] = useState<SafeNode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const lastResponseIdRef = useRef(0)
  const srcDoc = useMemo(() => iframeSrcDoc(code), [code])
  const input = useMemo(
    () => ({
      config: props.config,
      rows: props.data.rows.map((row) => ({ ...row })),
      variables: { ...props.variables },
      width: props.width,
      height: props.height
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.data.rows, props.config, props.variables, props.width, props.height]
  )

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data as
        | { kind: 'widget-ready' }
        | { kind: 'widget-tree'; id: number; tree: SafeNode }
        | { kind: 'widget-error'; id?: number; error: string }

      if (data.kind === 'widget-ready') setReady(true)
      if (data.kind === 'widget-tree' && data.id === requestIdRef.current) {
        lastResponseIdRef.current = data.id
        setTree(data.tree)
        setError(null)
      }
      if (data.kind === 'widget-error') {
        if (data.id) lastResponseIdRef.current = data.id
        setError(data.error)
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!ready) return
    const id = ++requestIdRef.current
    const timeout = setTimeout(() => {
      if (lastResponseIdRef.current < id) setError('Widget render timed out')
    }, RENDER_TIMEOUT_MS)
    iframeRef.current?.contentWindow?.postMessage({ kind: 'widget-render', id, props: input }, '*')
    return () => clearTimeout(timeout)
  }, [ready, input])

  return (
    <div className="relative h-full w-full overflow-auto p-2 text-sm text-foreground">
      <iframe
        ref={iframeRef}
        title="Marketplace widget sandbox"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        style={{ display: 'none' }}
      />
      {error ? (
        <div className="flex h-full items-center justify-center text-xs text-destructive">
          Widget error: {error}
        </div>
      ) : tree !== null ? (
        renderSafeNode(tree)
      ) : null}
    </div>
  )
}
