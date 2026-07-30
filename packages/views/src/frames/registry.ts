/**
 * Frame source-renderer registry (0346).
 *
 * Node-source frames dispatch on the target node's schema: the app (or
 * a plugin) registers "how a Database renders as a frame", "how a Page
 * renders as a frame", and every container — document embeds, dashboard
 * frame widgets, frame tabs — resolves through this one lookup. Same
 * idiom as the ViewRegistry (0339): registration returns a Disposable,
 * `onChange` lets pickers re-enumerate.
 */

import type { SchemaIRI } from '@xnetjs/data'
import type { ComponentType } from 'react'
import type { Disposable } from '../types.js'
import type { FrameDef } from './types.js'

export interface NodeFrameProps {
  frame: FrameDef
  nodeId: string
  onNavigate?: (href: string) => void
  readOnly?: boolean
}

export interface FrameSourceRenderer {
  /** Unique renderer id (e.g. 'database', 'page'). */
  id: string
  /** Base-IRI match list ('*' matches any schema). */
  supportedSchemas: SchemaIRI[] | '*'
  component: ComponentType<NodeFrameProps>
}

/** Version-agnostic base of a schema IRI (`xnet://…/Name` sans `@ver`). */
function baseIri(iri: string): string {
  const at = iri.lastIndexOf('@')
  return at > 0 ? iri.slice(0, at) : iri
}

export class FrameSourceRegistry {
  private renderers = new Map<string, FrameSourceRenderer>()
  private listeners = new Set<() => void>()

  register(renderer: FrameSourceRenderer): Disposable {
    this.renderers.set(renderer.id, renderer)
    this.notify()
    return {
      dispose: () => {
        if (this.renderers.get(renderer.id) === renderer) {
          this.renderers.delete(renderer.id)
          this.notify()
        }
      }
    }
  }

  has(id: string): boolean {
    return this.renderers.has(id)
  }

  getAll(): FrameSourceRenderer[] {
    return [...this.renderers.values()]
  }

  /** First renderer whose schema list matches; wildcard renderers last. */
  getForSchema(schemaId: SchemaIRI): FrameSourceRenderer | undefined {
    const base = baseIri(schemaId)
    for (const renderer of this.renderers.values()) {
      if (renderer.supportedSchemas === '*') continue
      if (renderer.supportedSchemas.some((iri) => baseIri(iri) === base)) return renderer
    }
    for (const renderer of this.renderers.values()) {
      if (renderer.supportedSchemas === '*') return renderer
    }
    return undefined
  }

  onChange(listener: () => void): Disposable {
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

/** Module-global registry (one per runtime, like `viewRegistry`). */
export const frameSourceRegistry = new FrameSourceRegistry()
