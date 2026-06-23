/**
 * @xnetjs/plugins — network endowment (exploration 0192).
 *
 * The capability guard ({@link ../ecosystem/capability-guard}) closes the
 * `schemaWrite` hole at the store boundary. This closes the `network` hole at
 * the fetch boundary: a plugin that wants to reach the network gets a
 * `guardedFetch` whose every request is checked against its declared `network`
 * allowlist (`isNetworkAllowed`), so a plugin can only talk to the hosts it
 * declared — and a plugin that declared none gets no egress at all.
 *
 * Like `guardStore`, this is the one handle a plugin should receive instead of
 * the ambient `fetch`; the host injects it as the `network` endowment.
 */

import type { ModuleCapabilities } from '../feature-module'
import { assertNetwork } from './capability-guard'

/** The subset of the `fetch` signature we wrap (kept structural, no DOM types). */
export type FetchLike = (input: string | { url: string }, init?: unknown) => Promise<unknown>

/** Resolve the request URL from the `fetch` first argument. */
function urlOf(input: string | { url: string }): string {
  return typeof input === 'string' ? input : input.url
}

/**
 * Wrap a `fetch` implementation so every request host is checked against the
 * plugin's declared `network` capability. Throws `CapabilityError` before the
 * request leaves if the host isn't allowed. A plugin with no `network` grant
 * can reach nothing (closed by default) — the wrapper still returns, but every
 * call throws until a host is declared.
 *
 * @param caps the plugin's declared capability grant
 * @param pluginId for error attribution
 * @param fetchImpl the underlying fetch (defaults to `globalThis.fetch`)
 */
export function guardedFetch(
  caps: ModuleCapabilities | undefined,
  pluginId: string,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike
): FetchLike {
  // `async` so a capability violation surfaces as a rejected promise (matching
  // real `fetch` semantics) rather than a synchronous throw. We forward the
  // *resolved URL string* (not the `{ url }` object form some callers pass) —
  // the real `fetch`/`Request` reject a bare `{ url }` object, so normalizing
  // here lets a connector author write `fetch({ url })` and still work in prod.
  return async (input, init) => {
    const url = urlOf(input)
    assertNetwork(caps, url, pluginId)
    return fetchImpl(url, init)
  }
}
