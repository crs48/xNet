/**
 * EffectScope — nested, reverse-order, awaited disposal (exploration 0455).
 *
 * The plugin system's temporal half. `ExtensionContext.subscriptions` was a
 * flat `Disposable[]` walked in registration order without awaiting, so
 * teardown ordering was accidental and an async `deactivate` could race the
 * next mount. A scope collects effects, disposes them in REVERSE registration
 * order (later effects may depend on earlier ones), awaits async disposers,
 * and tears down child scopes as effects of the parent — so disposing a scope
 * tears down its whole subtree, children first.
 *
 * One failing disposer never strands the rest: failures are reported loudly
 * and disposal continues.
 */

import type { Disposable } from './types'
import { TaggedError } from '@xnetjs/core'

/** Anything a scope can revert: a Disposable or a bare (async) cleanup fn. */
export type Effect = Disposable | (() => void | Promise<void>)

export class ScopeDisposedError extends TaggedError<'ScopeDisposedError'> {
  readonly _tag = 'ScopeDisposedError'

  constructor() {
    super('EffectScope is disposed — no new effects can be registered')
  }
}

export class EffectScope {
  private effects: Effect[] = []
  private state: 'active' | 'disposing' | 'disposed' = 'active'

  get disposed(): boolean {
    return this.state !== 'active'
  }

  /** Register an effect to revert on dispose. Returns it for chaining. */
  use<T extends Effect>(effect: T): T {
    if (this.state !== 'active') throw new ScopeDisposedError()
    this.effects.push(effect)
    return effect
  }

  /**
   * Open a child scope. It is registered as an effect on this scope, so it is
   * disposed (before earlier registrations) when the parent goes — and it can
   * also be disposed early on its own, which is the point: a plugin can scope
   * a feature it turns on and off without touching its other registrations.
   */
  child(): EffectScope {
    const scope = new EffectScope()
    this.use(() => scope.dispose())
    return scope
  }

  /**
   * Dispose every effect in reverse registration order, awaiting each.
   * Idempotent and re-entrancy-safe: a second call (including one triggered
   * from inside a disposer) resolves without re-running anything.
   */
  async dispose(): Promise<void> {
    if (this.state !== 'active') return
    this.state = 'disposing'
    const effects = this.effects
    this.effects = []
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i]
      try {
        await (typeof effect === 'function' ? effect() : effect.dispose())
      } catch (error) {
        // Loud, but one failed disposer must not strand the rest.
        console.error('[plugins] effect dispose failed:', error)
      }
    }
    this.state = 'disposed'
  }
}
