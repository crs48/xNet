/**
 * ShapeRegistry - Runtime registry of canvas shape kinds (exploration 0205).
 *
 * Turns the hardcoded `ShapeType` union + `createShapePath` switch into an
 * extension seam matching the charts/maps/widget registries: a plugin can
 * contribute a new shape (pentagon, cross, callout…) by registering an
 * `id → buildPath` definition with no change to core canvas code. Built-in
 * shapes register lazily and import-order-safe.
 */

import { BUILTIN_SHAPES, createShapePath, type ShapeType } from './shape-paths'

export interface Disposable {
  dispose(): void
}

export interface ShapePathOptions {
  cornerRadius?: number
}

export interface ShapeDefinition {
  /** Stable identifier persisted as the node's `shapeType`. */
  type: string
  /** Human-readable label for the picker. */
  label: string
  /** Build the SVG path string for the given size. */
  buildPath(width: number, height: number, opts?: ShapePathOptions): string
}

export class ShapeRegistry {
  private shapes = new Map<string, ShapeDefinition>()
  private listeners = new Set<() => void>()

  register(def: ShapeDefinition): Disposable {
    if (this.shapes.has(def.type)) {
      console.warn(`[ShapeRegistry] Overriding existing shape '${def.type}'`)
    }
    this.shapes.set(def.type, def)
    this.notify()
    return {
      dispose: () => {
        this.shapes.delete(def.type)
        this.notify()
      }
    }
  }

  get(type: string): ShapeDefinition | undefined {
    return this.shapes.get(type)
  }

  getAll(): ShapeDefinition[] {
    return [...this.shapes.values()]
  }

  has(type: string): boolean {
    return this.shapes.has(type)
  }

  get size(): number {
    return this.shapes.size
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  clear(): void {
    this.shapes.clear()
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (err) {
        console.error('[ShapeRegistry] Listener error:', err)
      }
    }
  }
}

/** Global shape registry instance. */
export const shapeRegistry = new ShapeRegistry()

let builtinsRegistered = false

/**
 * Register the built-in shapes (idempotent, import-order-safe). Re-populates if
 * the registry was cleared so built-ins can never be permanently lost.
 */
export function ensureBuiltinShapes(): void {
  if (builtinsRegistered && shapeRegistry.has('rectangle')) return
  builtinsRegistered = true
  for (const { type, label } of BUILTIN_SHAPES) {
    if (shapeRegistry.has(type)) continue
    shapeRegistry.register({
      type,
      label,
      buildPath: (width, height, opts) => createShapePath(type, width, height, opts?.cornerRadius)
    })
  }
}

/** All shapes for the picker (built-ins + plugin-contributed). */
export function shapeTypes(): Array<{ type: string; label: string }> {
  ensureBuiltinShapes()
  return shapeRegistry.getAll().map((s) => ({ type: s.type, label: s.label }))
}

/** True if a shape kind (built-in or plugin-contributed) is renderable. */
export function hasShape(type: string): boolean {
  ensureBuiltinShapes()
  return shapeRegistry.has(type)
}

/**
 * Registry-aware path builder. Dispatches through the registry (so plugin
 * shapes work) and falls back to the built-in rectangle for unknown kinds.
 */
export function resolveShapePath(
  type: ShapeType,
  width: number,
  height: number,
  cornerRadius?: number
): string {
  ensureBuiltinShapes()
  const def = shapeRegistry.get(type)
  return def
    ? def.buildPath(width, height, { cornerRadius })
    : createShapePath('rectangle', width, height)
}
