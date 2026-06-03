/**
 * Abuse instrumentation helpers
 *
 * Converts abuse decision, label, queue, and peer score snapshots into typed
 * DevTools events without taking a hard dependency on @xnetjs/abuse.
 */

import type { DevToolsEventBus } from '../core/event-bus'
import type {
  AbuseLabelEvent,
  AbusePeerScoresEvent,
  AbusePolicyDecisionEvent,
  AbuseQueueStateEvent
} from '../core/types'

export type AbusePolicyDecisionInput = Omit<
  AbusePolicyDecisionEvent,
  'id' | 'timestamp' | 'wallTime' | 'type' | 'evidenceRefs' | 'labelsToEmit'
> &
  Partial<Pick<AbusePolicyDecisionEvent, 'evidenceRefs' | 'labelsToEmit'>>

export type AbuseLabelInput = Omit<
  AbuseLabelEvent,
  'id' | 'timestamp' | 'wallTime' | 'type' | 'evidenceRefs'
> &
  Partial<Pick<AbuseLabelEvent, 'evidenceRefs'>>

export type AbuseQueueStateInput = Omit<
  AbuseQueueStateEvent,
  'id' | 'timestamp' | 'wallTime' | 'type'
>

export type AbusePeerScoresInput = Omit<
  AbusePeerScoresEvent,
  'id' | 'timestamp' | 'wallTime' | 'type'
>

export function emitAbusePolicyDecision(
  bus: DevToolsEventBus,
  decision: AbusePolicyDecisionInput
): void {
  bus.emit({
    type: 'abuse:policy-decision',
    ...decision,
    reasons: [...decision.reasons],
    evidenceRefs: decision.evidenceRefs ? [...decision.evidenceRefs] : [],
    labelsToEmit: decision.labelsToEmit
      ? decision.labelsToEmit.map((label) => ({
          ...label,
          evidenceRefs: [...label.evidenceRefs]
        }))
      : []
  })
}

export function emitAbuseLabel(bus: DevToolsEventBus, label: AbuseLabelInput): void {
  bus.emit({
    type: 'abuse:label',
    ...label,
    evidenceRefs: label.evidenceRefs ? [...label.evidenceRefs] : []
  })
}

export function emitAbuseQueueState(bus: DevToolsEventBus, state: AbuseQueueStateInput): void {
  bus.emit({
    type: 'abuse:queue-state',
    queues: state.queues.map((queue) => ({
      ...queue,
      sampleSubjectIds: queue.sampleSubjectIds ? [...queue.sampleSubjectIds] : undefined
    }))
  })
}

export function emitAbusePeerScores(bus: DevToolsEventBus, state: AbusePeerScoresInput): void {
  bus.emit({
    type: 'abuse:peer-scores',
    scores: state.scores.map((score) => ({ ...score }))
  })
}
