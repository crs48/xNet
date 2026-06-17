/**
 * Engine registry.
 *
 * The app registers whatever engines are available on the current platform
 * (whisper.cpp on Electron, Apple Speech on iOS, a BYO endpoint anywhere) and
 * picks a default. Settings drives `resolve(id)`; callers never hard-code an
 * engine.
 */

import type { DictationEngine, EngineDescriptor } from './types'

export class EngineRegistry {
  private readonly engines = new Map<string, DictationEngine>()
  private defaultId: string | null = null

  register(engine: DictationEngine, options?: { makeDefault?: boolean }): void {
    const { id } = engine.descriptor
    this.engines.set(id, engine)
    if (options?.makeDefault || this.defaultId === null) {
      this.defaultId = id
    }
  }

  unregister(id: string): void {
    this.engines.delete(id)
    if (this.defaultId === id) {
      // Fall back to the first remaining engine, if any.
      const next = this.engines.keys().next()
      this.defaultId = next.done ? null : next.value
    }
  }

  has(id: string): boolean {
    return this.engines.has(id)
  }

  get(id: string): DictationEngine | undefined {
    return this.engines.get(id)
  }

  list(): EngineDescriptor[] {
    return [...this.engines.values()].map((engine) => engine.descriptor)
  }

  setDefault(id: string): void {
    if (!this.engines.has(id)) {
      throw new Error(`Cannot set default to unregistered engine "${id}"`)
    }
    this.defaultId = id
  }

  getDefaultId(): string | null {
    return this.defaultId
  }

  getDefault(): DictationEngine | undefined {
    return this.defaultId ? this.engines.get(this.defaultId) : undefined
  }

  /** Prefer an explicit id, else the default, else the first registered. */
  resolve(id?: string): DictationEngine | undefined {
    if (id && this.engines.has(id)) {
      return this.engines.get(id)
    }
    return this.getDefault()
  }
}
