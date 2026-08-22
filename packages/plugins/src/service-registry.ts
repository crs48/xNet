/**
 * ServiceRegistry — provide/inject with availability semantics (exploration
 * 0455). The plugin system's spatial half.
 *
 * The motivating bug: `AiSurfaceService` had exactly one `extraTools` merge
 * point and three hosts constructed it without passing the argument, stranding
 * every plugin-, lab-, and connector-contributed agent tool. With hand
 * threading, every host must remember every provider. With a registry, a
 * consumer *resolves* providers and re-resolves when they change — all hosts
 * correct by construction, and a plugin activating mid-session shows up live.
 *
 * Deliberately boring, unlike its Cordis inspiration: explicit registration,
 * typed lookup, loud errors — no proxies, no prototype chains, no declaration
 * merging. Multiple providers per name are allowed (agent tools are a fan-in);
 * `get` returns the latest, `getAll` every one.
 */

import type { Disposable } from './types'
import { TaggedError } from '@xnetjs/core'
import { EffectScope } from './scope'

export class ServiceUnavailableError extends TaggedError<'ServiceUnavailableError'> {
  readonly _tag = 'ServiceUnavailableError'

  constructor(readonly serviceName: string) {
    super(`No provider registered for service "${serviceName}"`)
  }
}

type Provider = { value: unknown }

export type InjectBody = (scope: EffectScope) => void | Promise<void>

export class ServiceRegistry {
  private readonly providers = new Map<string, Provider[]>()
  private readonly listeners = new Map<string, Set<() => void>>()

  /**
   * Register a provider for `name`. Multiple providers may coexist; disposing
   * the returned handle deregisters exactly this one. Every registration and
   * deregistration re-notifies that name's watchers and inject bodies.
   */
  provide<T>(name: string, value: T): Disposable {
    const provider: Provider = { value }
    const list = this.providers.get(name) ?? []
    list.push(provider)
    this.providers.set(name, list)
    this.notify(name)
    return {
      dispose: () => {
        const current = this.providers.get(name)
        if (!current) return
        const index = current.indexOf(provider)
        if (index === -1) return
        current.splice(index, 1)
        if (current.length === 0) this.providers.delete(name)
        this.notify(name)
      }
    }
  }

  /** The latest provider's value. Throws — never `undefined` — when absent. */
  get<T>(name: string): T {
    const list = this.providers.get(name)
    if (!list || list.length === 0) throw new ServiceUnavailableError(name)
    return list[list.length - 1].value as T
  }

  has(name: string): boolean {
    return (this.providers.get(name)?.length ?? 0) > 0
  }

  /** Every provider's value for `name`, oldest first (empty when none). */
  getAll<T>(name: string): T[] {
    return (this.providers.get(name) ?? []).map((p) => p.value as T)
  }

  /**
   * Observe a fan-in service: `callback` fires immediately with the current
   * values and again on every provide/dispose for `name` — including down to
   * an empty array, so a consumer can clear state when the last provider goes.
   */
  watch<T>(name: string, callback: (values: T[]) => void): Disposable {
    const listener = () => callback(this.getAll<T>(name))
    const set = this.listeners.get(name) ?? new Set()
    set.add(listener)
    this.listeners.set(name, set)
    listener()
    return {
      dispose: () => {
        set.delete(listener)
        if (set.size === 0) this.listeners.delete(name)
      }
    }
  }

  /**
   * Availability-gated body (the Cordis `inject` contract, exploration 0455):
   * runs when every named service has a provider, its scope is disposed when
   * any of them loses its last provider, and it re-runs — fresh scope — when a
   * provider is swapped while available. Dispose the returned handle to stop
   * observing (disposing the current body scope too).
   */
  inject(names: string[], body: InjectBody): Disposable {
    let bodyScope: EffectScope | null = null
    let disposed = false

    const rerun = () => {
      const available = names.every((name) => this.has(name))
      const previous = bodyScope
      bodyScope = null
      const start = () => {
        if (disposed || !available) return
        const scope = new EffectScope()
        bodyScope = scope
        void Promise.resolve(body(scope)).catch((error) => {
          console.error('[plugins] inject body failed:', error)
        })
      }
      if (previous) void previous.dispose().then(start)
      else start()
    }

    const watchers = names.map((name) => {
      const listener = () => rerun()
      const set = this.listeners.get(name) ?? new Set()
      set.add(listener)
      this.listeners.set(name, set)
      return { name, listener }
    })

    rerun()

    return {
      dispose: () => {
        disposed = true
        for (const { name, listener } of watchers) {
          const set = this.listeners.get(name)
          set?.delete(listener)
          if (set && set.size === 0) this.listeners.delete(name)
        }
        const scope = bodyScope
        bodyScope = null
        if (scope) void scope.dispose()
      }
    }
  }

  private notify(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) listener()
  }
}

/** The well-known fan-in service name for model-facing tool providers. */
export const AGENT_TOOLS_SERVICE = 'agent-tools'
