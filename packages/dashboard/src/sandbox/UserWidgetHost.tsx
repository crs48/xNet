/**
 * UserWidgetHost - The 'user' trust-tier execution host.
 *
 * Renders a user-authored widget by sending its code + serializable props to
 * the SES-locked Web Worker and materializing the returned SafeNode tree.
 * Falls back to an in-process SES Compartment when Workers are unavailable
 * (jsdom tests, SSR) — same capability scoping, without the CPU isolation.
 */

import type { WidgetProps } from '../types'
import type { UserWidgetRenderProps } from './compartment'
import type { SafeNode } from './safe-node'
import type { UserWidgetWorkerResponse } from './user-widget-worker'
import { useEffect, useMemo, useRef, useState } from 'react'
import { renderUserWidget } from './compartment'
import { renderSafeNode } from './safe-node'

const RENDER_TIMEOUT_MS = 2000

function renderProps(props: WidgetProps, config: Record<string, unknown>): UserWidgetRenderProps {
  return {
    config,
    rows: props.data.rows.map((row) => ({ ...row })),
    variables: { ...props.variables },
    width: props.width,
    height: props.height
  }
}

function createUserWidgetWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    return new Worker(new URL('./user-widget-worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
}

export interface UserWidgetHostProps extends WidgetProps {
  /** The user-authored widget source (defines render(props)) */
  code: string
}

export function UserWidgetHost({ code, ...props }: UserWidgetHostProps): JSX.Element {
  const [tree, setTree] = useState<SafeNode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const input = useMemo(
    () => renderProps(props, props.config),
    // Renders are driven by data/config/layout identity.
    [props.data.rows, props.config, props.variables, props.width, props.height] // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    workerRef.current = createUserWidgetWorker()
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    const worker = workerRef.current
    const id = ++requestIdRef.current

    if (!worker) {
      // In-process fallback: compartment scoping without thread isolation.
      try {
        setTree(JSON.parse(JSON.stringify(renderUserWidget(code, input))) as SafeNode)
        setError(null)
      } catch (evalError) {
        setError(evalError instanceof Error ? evalError.message : String(evalError))
      }
      return
    }

    const timeout = setTimeout(() => {
      // Runaway user code: kill the thread, report, respawn for next render.
      worker.terminate()
      workerRef.current = createUserWidgetWorker()
      setError('Widget render timed out')
    }, RENDER_TIMEOUT_MS)

    const onMessage = (event: MessageEvent<UserWidgetWorkerResponse>) => {
      if (event.data.id !== id) return
      clearTimeout(timeout)
      if (event.data.ok) {
        setTree(event.data.tree as SafeNode)
        setError(null)
      } else {
        setError(event.data.error)
      }
    }

    worker.addEventListener('message', onMessage)
    worker.postMessage({ id, code, props: input })

    return () => {
      clearTimeout(timeout)
      worker.removeEventListener('message', onMessage)
    }
  }, [code, input])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-xs text-destructive">
        Widget error: {error}
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-2 text-sm text-foreground">
      {tree !== null ? renderSafeNode(tree) : null}
    </div>
  )
}
