/**
 * The runtime ladder (exploration 0180).
 *
 * Holds the available {@link LabRuntime} rungs and picks one by (language,
 * tier), enforcing the load-bearing constraint: computed-column / `onView`
 * Labs may only run on a DETERMINISTIC rung. TypeScript is transpiled to JS
 * before a JS rung sees it.
 */

import type { Transpiler } from './transpile'
import type { LabLanguage, LabRunInput, LabRunResult, LabRuntime, LabRuntimeTier } from './types'
import { identityTranspiler, isJsTranspilable } from './transpile'

export class LabRuntimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LabRuntimeError'
  }
}

export interface LadderPick {
  language: LabLanguage
  tier: LabRuntimeTier
  /** True for computed columns / `onView` — restricts to deterministic rungs. */
  requireDeterministic?: boolean
}

export interface LadderRunInput extends LadderPick {
  code: string
  host?: LabRunInput['host']
  timeoutMs?: number
  memoryBytes?: number
  signal?: AbortSignal
}

export class RuntimeLadder {
  private runtimes: LabRuntime[]
  private transpiler: Transpiler

  constructor(runtimes: LabRuntime[] = [], transpiler: Transpiler = identityTranspiler) {
    this.runtimes = [...runtimes]
    this.transpiler = transpiler
  }

  list(): LabRuntime[] {
    return [...this.runtimes]
  }

  add(runtime: LabRuntime): void {
    this.runtimes.push(runtime)
  }

  setTranspiler(transpiler: Transpiler): void {
    this.transpiler = transpiler
  }

  /** Which tiers can run `language` (accounting for TS→JS transpilation). */
  tiersForLanguage(language: LabLanguage): LabRuntimeTier[] {
    const runLanguage = isJsTranspilable(language) ? 'javascript' : language
    const tiers = new Set<LabRuntimeTier>()
    for (const runtime of this.runtimes) {
      if (runtime.languages.includes(runLanguage)) tiers.add(runtime.tier)
    }
    return [...tiers]
  }

  /**
   * Choose the runtime for a (language, tier). TypeScript matches JS rungs.
   * Prefers a deterministic rung; requires one when `requireDeterministic`.
   */
  pick(input: LadderPick): LabRuntime {
    const runLanguage: LabLanguage = isJsTranspilable(input.language)
      ? 'javascript'
      : input.language

    const candidates = this.runtimes.filter(
      (runtime) => runtime.tier === input.tier && runtime.languages.includes(runLanguage)
    )
    if (candidates.length === 0) {
      throw new LabRuntimeError(`No "${input.tier}" runtime supports ${input.language}`)
    }

    if (input.requireDeterministic) {
      const deterministic = candidates.find((runtime) => runtime.deterministic)
      if (!deterministic) {
        throw new LabRuntimeError(
          `${input.language} on the "${input.tier}" tier is not deterministic; ` +
            `computed/onView Labs require a deterministic runtime`
        )
      }
      return deterministic
    }

    // Prefer a deterministic candidate when one exists (e.g. QuickJS over app).
    return candidates.find((runtime) => runtime.deterministic) ?? candidates[0]
  }

  async run(input: LadderRunInput): Promise<LabRunResult> {
    let code = input.code
    let language = input.language

    if (language === 'typescript') {
      code = await this.transpiler.transpile(code, 'typescript')
      language = 'javascript'
    }

    const runtime = this.pick({
      language,
      tier: input.tier,
      requireDeterministic: input.requireDeterministic
    })

    return runtime.run({
      code,
      language,
      host: input.host,
      timeoutMs: input.timeoutMs,
      memoryBytes: input.memoryBytes,
      signal: input.signal
    })
  }
}
