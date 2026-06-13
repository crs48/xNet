/**
 * Human-readable "why was this filtered?" reasons (exploration 0177, W9).
 *
 * Turns the structured `SensitivityExplanation` from `@xnetjs/abuse` into the
 * plain-language lines the render gate shows under a "Why?" disclosure, so a
 * filtered post is transparent about *which* label and *whose* choice (your dial,
 * the adult-content switch, the unsolicited-media rule) drove the decision.
 */
import {
  sensitivityLabels,
  type AbuseVisibility,
  type SensitivityExplanation,
  type SensitivityReason
} from '@xnetjs/abuse'

const LABEL_NAME = new Map(sensitivityLabels.map((label) => [label.id, label.name]))

function verbFor(effect: AbuseVisibility): string {
  switch (effect) {
    case 'hide':
      return 'hidden'
    case 'blur':
      return 'blurred'
    case 'warn':
      return 'flagged'
    default:
      return 'shown'
  }
}

/** One reason → a sentence, or null for a present-but-shown label (not a filter). */
export function describeSensitivityReason(reason: SensitivityReason): string | null {
  if (reason.effect === 'show') return null
  const verb = verbFor(reason.effect)
  const name = reason.label ? (LABEL_NAME.get(reason.label) ?? reason.label) : 'Unsolicited media'
  switch (reason.cause) {
    case 'adult-disabled':
      return `${name}: ${verb} because adult content is turned off`
    case 'unsolicited-media':
      return `Media from someone you haven't connected with: ${verb} until you accept`
    case 'dial':
      return `${name}: ${verb} by your content & safety dial`
  }
}

/**
 * All display reasons for a filtered piece of content. `platformFiltered` adds a
 * platform/safety-decision line first (e.g. a blocked author or a spam verdict).
 */
export function filterReasons(
  explanation: SensitivityExplanation,
  platformFiltered = false
): string[] {
  const lines = explanation.reasons
    .map(describeSensitivityReason)
    .filter((line): line is string => line !== null)
  return platformFiltered ? ['Flagged by a platform safety decision', ...lines] : lines
}
