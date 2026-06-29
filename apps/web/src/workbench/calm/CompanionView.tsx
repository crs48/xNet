/**
 * CompanionView — the calm shell's agent surface (exploration 0250, Phase 1).
 *
 * Promotes the formerly-buried 12px AiChatPanel into a first-class, centred
 * conversation surface: a warm greeting (display serif under the cozy variant)
 * over the existing Bring-Your-Own-Model chat runtime. The chat keeps all of
 * its grounding, streaming and connector logic — this is composition, not a
 * rewrite. Rendered by the `/companion` route so it stays router-addressable.
 */
import { useIdentity } from '@xnetjs/react'
import { AiChatPanel } from '../views/AiChatPanel'

function greeting(): string {
  // Deterministic, time-of-day agnostic copy (no Date in render churn concerns
  // here, but keep it simple + calm). A single welcoming line.
  return 'What are we working on?'
}

export function CompanionView() {
  const { identity } = useIdentity()
  void identity

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col">
      <header className="shrink-0 px-4 pb-2 pt-6">
        <h1 className="cozy-heading text-2xl font-semibold text-ink-1">{greeting()}</h1>
        <p className="mt-1 text-sm text-ink-3">
          Your agent reads your workspace for context and runs on your own model or key — never on
          our servers.
        </p>
      </header>
      {/* The existing chat panel fills the rest; it owns the connector picker,
          streaming body and composer. */}
      <div className="min-h-0 flex-1">
        <AiChatPanel />
      </div>
    </div>
  )
}
