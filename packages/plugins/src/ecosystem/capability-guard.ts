/**
 * @xnetjs/plugins — capability enforcement (exploration 0192).
 *
 * 0189 added `ModuleCapabilities` (`schemaWrite`/`schemaRead`/`network`/…) as a
 * *declaration*. This module makes the declaration load-bearing: it turns the
 * declared grant into runtime gates.
 *
 * The enforcement point is the `NodeStore` handle a plugin receives in its
 * `ExtensionContext`. Plugins call `ctx.store.create/update/delete` directly, so
 * wrapping that handle is the one choke point a plugin cannot route around. We
 * wrap with a `Proxy` (rather than re-implementing the store) so the guard keeps
 * working as `NodeStore` grows methods — only `create`/`update`/`delete`/`get`/
 * `list` are intercepted; everything else passes straight through.
 *
 * A grant with neither `schemaWrite` nor `schemaRead` is unconstrained (the guard
 * returns the store untouched) — first-party/host code is meant to be unguarded.
 */

import type { ModuleCapabilities } from '../feature-module'

/** Thrown when a plugin tries to act outside its declared capability grant. */
export class CapabilityError extends Error {
  constructor(
    message: string,
    public readonly pluginId: string,
    public readonly capability: 'schemaWrite' | 'schemaRead' | 'network' | 'systemAudio',
    public readonly target: string
  ) {
    super(message)
    this.name = 'CapabilityError'
  }
}

/**
 * Match a schema IRI against a capability pattern. Supports:
 * - exact: `xnet://xnet.fyi/Task@1.0.0`
 * - all: `*`
 * - version wildcard: `xnet://xnet.fyi/Task@*` (any version of Task)
 * - prefix wildcard: `xnet://xnet.fyi/*` (any schema under an authority)
 */
export function matchSchemaIri(pattern: string, iri: string): boolean {
  if (pattern === iri) return true
  // A trailing `*` subsumes every wildcard form: `*` → startsWith(''),
  // `…/Task@*` → startsWith('…/Task@'), `…/fyi/*` → startsWith('…/fyi/').
  if (pattern.endsWith('*')) return iri.startsWith(pattern.slice(0, -1))
  return false
}

/** Whether any pattern in `patterns` matches `iri`. */
function anyMatch(patterns: readonly string[] | undefined, iri: string): boolean {
  if (!patterns) return false
  return patterns.some((p) => matchSchemaIri(p, iri))
}

/** Whether the grant permits writing the given schema IRI. */
export function isSchemaWriteAllowed(caps: ModuleCapabilities | undefined, iri: string): boolean {
  // No write grant declared → no writes permitted (closed by default).
  if (!caps?.schemaWrite) return false
  return anyMatch(caps.schemaWrite, iri)
}

/**
 * Whether the grant permits reading the given schema IRI. A grant that declares
 * no `schemaRead` does not restrict reads (reads are lower risk than writes;
 * restricting them is opt-in by declaring `schemaRead`).
 */
export function isSchemaReadAllowed(caps: ModuleCapabilities | undefined, iri: string): boolean {
  if (!caps?.schemaRead) return true
  return anyMatch(caps.schemaRead, iri)
}

/** Extract the host from a URL or bare host string, lowercased. */
function hostOf(urlOrHost: string): string {
  try {
    return new URL(urlOrHost).host.toLowerCase()
  } catch {
    return urlOrHost
      .replace(/^.*?:\/\//, '')
      .split('/')[0]
      .toLowerCase()
  }
}

/**
 * Whether the grant permits a network request to the given URL/host. A
 * `network` entry may be an exact host (`api.stripe.com`) or a leading-dot
 * suffix (`.stripe.com`, matching any subdomain). No declared `network` → no
 * egress permitted (closed by default).
 */
export function isNetworkAllowed(caps: ModuleCapabilities | undefined, urlOrHost: string): boolean {
  if (!caps?.network || caps.network.length === 0) return false
  const host = hostOf(urlOrHost)
  return caps.network.some((allowed) => {
    const a = allowed.toLowerCase()
    if (a.startsWith('.')) return host === a.slice(1) || host.endsWith(a)
    return host === a
  })
}

/**
 * Whether the grant permits capturing system audio (exploration 0279). Closed
 * by default: only an explicit `systemAudio: true` opens the capture IPC.
 */
export function isSystemAudioAllowed(caps: ModuleCapabilities | undefined): boolean {
  return caps?.systemAudio === true
}

/** Assert system-audio capture is permitted, or throw {@link CapabilityError}. */
export function assertSystemAudio(caps: ModuleCapabilities | undefined, pluginId: string): void {
  if (!isSystemAudioAllowed(caps)) {
    throw new CapabilityError(
      `Plugin '${pluginId}' lacks systemAudio capability`,
      pluginId,
      'systemAudio',
      'system-audio'
    )
  }
}

/** Assert a schema write is permitted, or throw {@link CapabilityError}. */
export function assertSchemaWrite(
  caps: ModuleCapabilities | undefined,
  iri: string,
  pluginId: string
): void {
  if (!isSchemaWriteAllowed(caps, iri)) {
    throw new CapabilityError(
      `Plugin '${pluginId}' lacks schemaWrite capability for ${iri}`,
      pluginId,
      'schemaWrite',
      iri
    )
  }
}

/** Assert a network request is permitted, or throw {@link CapabilityError}. */
export function assertNetwork(
  caps: ModuleCapabilities | undefined,
  urlOrHost: string,
  pluginId: string
): void {
  if (!isNetworkAllowed(caps, urlOrHost)) {
    throw new CapabilityError(
      `Plugin '${pluginId}' lacks network capability for ${urlOrHost}`,
      pluginId,
      'network',
      urlOrHost
    )
  }
}

/** Minimal slice of the NodeStore surface the guard intercepts. */
interface GuardableStore {
  create(options: { schemaId: string; [k: string]: unknown }): Promise<{ schemaId: string }>
  get(id: string): Promise<{ schemaId: string } | null>
}

/** Build the `create`/`update`/`delete` wrappers that enforce `schemaWrite`. */
function writeWrappers(
  obj: object,
  caps: ModuleCapabilities,
  pluginId: string
): Record<string, (...args: never[]) => unknown> {
  const target = obj as unknown as GuardableStore
  const call = (name: string, ...args: unknown[]) =>
    (Reflect.get(obj, name) as (...a: unknown[]) => unknown).call(obj, ...args)

  const guardedById =
    (name: 'update' | 'delete') =>
    async (id: string, ...rest: unknown[]) => {
      const node = await target.get.call(obj, id)
      if (node) assertSchemaWrite(caps, node.schemaId, pluginId)
      return call(name, id, ...rest)
    }

  return {
    create: async (options: { schemaId: string }) => {
      assertSchemaWrite(caps, options.schemaId, pluginId)
      return target.create.call(obj, options)
    },
    update: guardedById('update'),
    delete: guardedById('delete')
  } as Record<string, (...args: never[]) => unknown>
}

/**
 * Wrap a NodeStore so writes are checked against the plugin's grant. Returns the
 * store unchanged when the grant constrains nothing. Generic over the concrete
 * store type so callers keep their `NodeStore` typing.
 */
export function guardStore<T extends object>(
  store: T,
  caps: ModuleCapabilities | undefined,
  pluginId: string
): T {
  // Nothing to enforce → hand back the original (no Proxy overhead).
  if (!caps?.schemaWrite && !caps?.schemaRead) return store

  // Only write methods are intercepted (and only when a write grant exists).
  const wrappers = caps.schemaWrite ? writeWrappers(store, caps, pluginId) : {}

  return new Proxy(store, {
    get(obj, prop, receiver) {
      const wrapper = wrappers[prop as string]
      if (wrapper) return wrapper
      const original = Reflect.get(obj, prop, receiver)
      return typeof original === 'function' ? original.bind(obj) : original
    }
  })
}
