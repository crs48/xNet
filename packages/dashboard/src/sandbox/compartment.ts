/**
 * SES Compartment evaluation for user-authored widget code (0162 phase 4).
 *
 * User code is the body of a module that must define `render(props)` and
 * return a SafeNode tree. It evaluates inside a SES Compartment whose
 * global object exposes ONLY the endowed capabilities below — no window,
 * no document, no fetch, no store APIs. In the production path this runs
 * inside a Web Worker after lockdown() (frozen shared intrinsics +
 * terminatable OS thread); see user-widget-worker.ts.
 */

import 'ses'
import type { SafeNode } from './safe-node'

export interface UserWidgetRenderProps {
  config: Record<string, unknown>
  rows: Array<Record<string, unknown>>
  variables: Record<string, unknown>
  width: number
  height: number
}

export type UserWidgetRenderFn = (props: UserWidgetRenderProps) => SafeNode

let lockedDown = false

/**
 * Freeze shared intrinsics. Call once per realm before evaluating untrusted
 * code; safe to call repeatedly. In jsdom test realms lockdown can fail on
 * already-tampered intrinsics — evaluation still proceeds with compartment
 * scoping, which is what the isolation tests assert.
 */
export function lockdownRealm(): boolean {
  if (lockedDown) return true
  try {
    lockdown({ errorTaming: 'unsafe', overrideTaming: 'severe' })
    lockedDown = true
  } catch {
    // Realm intrinsics already modified (e.g. test polyfills); compartment
    // scoping still applies.
  }
  return lockedDown
}

/** The capabilities endowed to user widget compartments. Keep this small. */
function endowments(): Record<string, unknown> {
  return {
    console: {
      // eslint-disable-next-line no-console
      log: (...args: unknown[]) => console.log('[user-widget]', ...args)
    },
    JSON,
    Math
  }
}

/**
 * Evaluate user widget source and return its render function. Throws if the
 * code does not define `render`.
 */
export function evaluateUserWidget(code: string): UserWidgetRenderFn {
  const compartment = new Compartment({
    globals: endowments(),
    __options__: true
  })

  const result = compartment.evaluate(
    `(() => {\n${code}\n;if (typeof render !== 'function') { throw new TypeError('user widget must define render(props)') } return render })()`
  )

  if (typeof result !== 'function') {
    throw new TypeError('user widget must define render(props)')
  }

  return result as UserWidgetRenderFn
}

/** Evaluate and render in one step (the worker request path). */
export function renderUserWidget(code: string, props: UserWidgetRenderProps): SafeNode {
  return evaluateUserWidget(code)(props)
}
