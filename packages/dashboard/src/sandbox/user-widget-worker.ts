/**
 * User widget Web Worker (0162 phase 4, 'user' trust tier).
 *
 * The worker locks down its realm (SES frozen intrinsics) before evaluating
 * any user code, then serves render requests over postMessage. Running in a
 * Worker adds what SES alone lacks: CPU isolation — a hostile `while(true)`
 * stalls this thread, not the app, and the host can terminate() it.
 *
 * Protocol:
 *   in:  { id, code, props: UserWidgetRenderProps }
 *   out: { id, ok: true, tree: SafeNode } | { id, ok: false, error: string }
 */

import type { UserWidgetRenderProps } from './compartment'
import { lockdownRealm, renderUserWidget } from './compartment'

export interface UserWidgetWorkerRequest {
  id: number
  code: string
  props: UserWidgetRenderProps
}

export type UserWidgetWorkerResponse =
  | { id: number; ok: true; tree: unknown }
  | { id: number; ok: false; error: string }

lockdownRealm()

self.addEventListener('message', (event: MessageEvent<UserWidgetWorkerRequest>) => {
  const { id, code, props } = event.data

  try {
    const tree = renderUserWidget(code, props)
    // Force JSON-pure output: anything non-serializable throws here instead
    // of leaking live references back to the host realm.
    const serialized = JSON.parse(JSON.stringify(tree ?? null)) as unknown
    self.postMessage({ id, ok: true, tree: serialized } satisfies UserWidgetWorkerResponse)
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    } satisfies UserWidgetWorkerResponse)
  }
})
