/**
 * @xnetjs/plugins — outbound action runner (exploration 0213).
 *
 * Runs an action's `dispatch` with the guards composed, so the *author* writes a
 * plain `fetch(...)` and the *framework* guarantees:
 *
 *   - **egress containment** — `fetch` is `guardedFetch`, limited to the declared
 *     `capabilities.network`;
 *   - **SSRF protection** — every request URL is `assertPublicUrl`-checked, so a
 *     user-configured target cannot reach localhost, RFC-1918, or cloud metadata
 *     even if the host was allowlisted via the configured URL.
 *
 * Secret scoping is the hub's job (a `scopedEnv` is passed in), keeping the
 * dependency direction clean (no `@xnetjs/plugins` → `@xnetjs/hub` edge).
 */

import type { ActionDefinition, ActionEvent, DefinedAction } from './define-action'
import type { FetchLike } from '../ecosystem/network-endowment'
import { assertNetwork } from '../ecosystem/capability-guard'
import { assertPublicUrl } from './ssrf'

export class ActionDispatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionDispatchError'
  }
}

export interface RunActionPorts {
  /** Broker-scoped env (the hub scopes it; tests pass a minimal object). */
  env: Record<string, string | undefined>
  /** Underlying fetch — wrapped (network allowlist + SSRF) before `dispatch`. */
  fetch: FetchLike
}

function urlOf(input: string | { url: string }): string {
  return typeof input === 'string' ? input : input.url
}

/**
 * Wrap a fetch so every outbound action request is (1) within the declared
 * `network` allowlist and (2) not pointed at a non-public host (SSRF).
 */
export function guardedActionFetch(
  def: Pick<ActionDefinition, 'id' | 'capabilities'>,
  fetchImpl: FetchLike
): FetchLike {
  return async (input, init) => {
    const url = urlOf(input)
    assertPublicUrl(url) // SSRF: always, even for allowlisted hosts
    assertNetwork(def.capabilities, url, def.id) // closed-by-default egress
    return fetchImpl(input, init)
  }
}

/**
 * Run one action's `dispatch` with the guards composed. The author never sees
 * the raw fetch or the full env.
 */
export async function runAction(
  action: DefinedAction,
  event: ActionEvent,
  ports: RunActionPorts
): Promise<void> {
  const fetch = guardedActionFetch(action.definition, ports.fetch)
  await action.dispatch(event, { env: ports.env, fetch })
}
