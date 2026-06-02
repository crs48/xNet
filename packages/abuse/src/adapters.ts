/**
 * Adapter helpers for wiring local package events into abuse decisions.
 */

import type { AbuseDecision, AbuseFacts } from './types'
import { decideAbuse, decideRemoteMutation, isRejected, shouldThrottle } from './decision'

// ─── Generic Adapters ───────────────────────────────────────────────────────

export type AbuseFactAdapter<TInput> = (input: TInput) => AbuseFacts
export type AbuseDecisionFunction = (facts: AbuseFacts) => AbuseDecision

export type AbuseAdapterResult = {
  facts: AbuseFacts
  decision: AbuseDecision
}

export function createAbuseFactAdapter<TInput>(
  adapter: AbuseFactAdapter<TInput>
): AbuseFactAdapter<TInput> {
  return adapter
}

export function decideWithAdapter<TInput>(
  input: TInput,
  adapter: AbuseFactAdapter<TInput>,
  decide: AbuseDecisionFunction = decideAbuse
): AbuseAdapterResult {
  const facts = adapter(input)
  return {
    facts,
    decision: decide(facts)
  }
}

export function createAbuseDecisionAdapter<TInput>(
  adapter: AbuseFactAdapter<TInput>,
  decide: AbuseDecisionFunction = decideAbuse
): (input: TInput) => AbuseAdapterResult {
  return (input) => decideWithAdapter(input, adapter, decide)
}

// ─── Remote Admission Pipeline ──────────────────────────────────────────────

export type RemoteAdmissionResult = AbuseAdapterResult & {
  accepted: boolean
  shouldMutate: boolean
  shouldRelay: boolean
  shouldThrottle: boolean
}

export type RemoteAdmissionPipeline<TInput> = {
  evaluate(input: TInput): RemoteAdmissionResult
}

export type RemoteAdmissionPipelineOptions<TInput> = {
  adapt: AbuseFactAdapter<TInput>
  decide?: AbuseDecisionFunction
}

export function createRemoteAdmissionPipeline<TInput>(
  options: RemoteAdmissionPipelineOptions<TInput>
): RemoteAdmissionPipeline<TInput> {
  const decide = options.decide ?? decideRemoteMutation

  return {
    evaluate(input) {
      const result = decideWithAdapter(input, options.adapt, decide)
      const accepted = result.decision.admission === 'accept'
      const shouldMutate = !isRejected(result.decision)

      return {
        ...result,
        accepted,
        shouldMutate,
        shouldRelay: accepted && result.decision.reach !== 'exclude',
        shouldThrottle: shouldThrottle(result.decision)
      }
    }
  }
}
