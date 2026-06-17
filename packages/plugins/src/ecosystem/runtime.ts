/**
 * @xnetjs/plugins — run plugin code on the labs runtime ladder (0194 Phase 1).
 *
 * The unification the exploration calls for: instead of plugins maintaining their
 * own sandbox, user/marketplace-tier plugin code runs on the *same* runtime
 * ladder `@xnetjs/labs` uses (SES/QuickJS for `sandbox`, an iframe for `app`).
 * One sandbox, one security audit — and plugins gain the ladder's Python/server
 * tiers for free.
 *
 * The ladder is taken as a **structural port** (`PluginRuntimeLadder`), not an
 * `@xnetjs/labs` import: labs already depends on `@xnetjs/plugins`, so a direct
 * edge here would cycle. The host (web/electron) passes its concrete labs ladder.
 *
 * First-party code is trusted and runs in the host realm, NOT through the ladder
 * — `runPluginCode` rejects a first-party tier so a caller can't accidentally
 * sandbox (and slow) trusted code.
 */

import type { TrustTier } from '@xnetjs/trust'

/** The labs runtime tiers a plugin can target. */
export type LadderRuntimeTier = 'sandbox' | 'app' | 'server'

/** A single run on the ladder. */
export interface PluginRunInput {
  language: 'javascript' | 'typescript'
  tier: LadderRuntimeTier
  code: string
  /** Host bridge the sandbox may call (capability-gated by the host). */
  host?: unknown
}

export interface PluginRunResult {
  ok: boolean
  value?: unknown
  logs?: string[]
  error?: string
}

/** The minimal slice of the labs `RuntimeLadder` this adapter needs. */
export interface PluginRuntimeLadder {
  run(input: PluginRunInput): Promise<PluginRunResult>
}

export class PluginRuntimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PluginRuntimeError'
  }
}

/**
 * Map a plugin's trust tier to the ladder rung its code should run on. `user`
 * code runs in the deterministic `sandbox` (SES/QuickJS); `marketplace` code in
 * the `app` (iframe) rung. `first-party` has no ladder rung — it runs in the
 * host realm — so this throws for it.
 */
export function ladderTierForTrust(tier: TrustTier): LadderRuntimeTier {
  if (tier === 'first-party') {
    throw new PluginRuntimeError('first-party plugin code runs in the host realm, not the ladder')
  }
  return tier === 'marketplace' ? 'app' : 'sandbox'
}

export interface RunPluginCodeInput {
  code: string
  trustTier: TrustTier
  language?: 'javascript' | 'typescript'
  host?: unknown
}

/**
 * Run user/marketplace-tier plugin code on the labs ladder, choosing the rung by
 * trust tier. Throws `PluginRuntimeError` for first-party (which belongs in the
 * host realm). Returns the ladder's result unchanged.
 */
export async function runPluginCode(
  ladder: PluginRuntimeLadder,
  input: RunPluginCodeInput
): Promise<PluginRunResult> {
  // `async` so a first-party rejection surfaces as a rejected promise rather than
  // a synchronous throw (callers `await` this).
  const tier = ladderTierForTrust(input.trustTier)
  return ladder.run({
    language: input.language ?? 'javascript',
    tier,
    code: input.code,
    host: input.host
  })
}
