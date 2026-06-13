/**
 * Before-upload image pre-screen (exploration 0177, W4).
 *
 * Turns an on-device classifier's sensitivity labels into a single upload-time
 * recommendation: allow silently, suggest a self-label, or warn that the image
 * looks explicit. Pure and model-agnostic — the heavy NSFW model is injected via
 * the existing `createNsfwImageClassifier` adapter, so this runs on the author's
 * device and never leaves it (privacy invariant from 0175).
 */
import type { LocalClassifierAdapter, LocalClassifierInput } from './local-classifier'
import type { AbuseLabel } from './types'
import { isSensitivityLabelValue, type SensitivityLabelValue } from './sensitivity'

export type PrescreenRecommendation = 'allow' | 'suggest-label' | 'warn-explicit'

export interface ImagePrescreenResult {
  recommendation: PrescreenRecommendation
  /** The strongest sensitivity value to self-label with, or null when clean. */
  suggestedLabel: SensitivityLabelValue | null
  /** Confidence of the strongest sensitivity label (0 when none). */
  confidence: number
  /** The sensitivity labels that drove the decision. */
  labels: readonly AbuseLabel[]
}

export interface ImagePrescreenOptions {
  /** Score at/above which an explicit (`porn`) label triggers a hard warn. */
  explicitWarnThreshold?: number
  /** Minimum score to suggest a self-label at all. */
  suggestThreshold?: number
}

const DEFAULT_EXPLICIT_WARN_THRESHOLD = 0.7
const DEFAULT_SUGGEST_THRESHOLD = 0.4

const CLEAN_RESULT: ImagePrescreenResult = {
  recommendation: 'allow',
  suggestedLabel: null,
  confidence: 0,
  labels: []
}

/** Pick the highest-confidence label whose value is a sensitivity value. */
function strongestSensitivityLabel(labels: readonly AbuseLabel[]): AbuseLabel | null {
  let strongest: AbuseLabel | null = null
  for (const label of labels) {
    if (!isSensitivityLabelValue(label.value)) continue
    if (!strongest || label.confidence > strongest.confidence) strongest = label
  }
  return strongest
}

/**
 * Map classifier labels to an upload recommendation (pure). Explicit content
 * above the warn threshold returns `warn-explicit`; any other sensitivity above
 * the suggest threshold returns `suggest-label`; everything else is `allow`.
 */
export function prescreenImageLabels(
  labels: readonly AbuseLabel[],
  options: ImagePrescreenOptions = {}
): ImagePrescreenResult {
  const explicitWarn = options.explicitWarnThreshold ?? DEFAULT_EXPLICIT_WARN_THRESHOLD
  const suggest = options.suggestThreshold ?? DEFAULT_SUGGEST_THRESHOLD

  const strongest = strongestSensitivityLabel(labels)
  if (!strongest) return CLEAN_RESULT

  const value = strongest.value as SensitivityLabelValue
  const confidence = strongest.confidence

  if (value === 'porn' && confidence >= explicitWarn) {
    return { recommendation: 'warn-explicit', suggestedLabel: value, confidence, labels }
  }
  if (confidence >= suggest) {
    return { recommendation: 'suggest-label', suggestedLabel: value, confidence, labels }
  }
  return { recommendation: 'allow', suggestedLabel: null, confidence, labels }
}

/**
 * Run an injected on-device classifier over an image input and reduce its output
 * to a pre-screen recommendation. The classifier is the seam where a real ONNX
 * NSFW model (NSFWJS/Falconsai via Transformers.js) is plugged in.
 */
export async function prescreenImage(
  classifier: LocalClassifierAdapter,
  input: LocalClassifierInput,
  options: ImagePrescreenOptions = {}
): Promise<ImagePrescreenResult> {
  if (classifier.supports && !classifier.supports(input)) return CLEAN_RESULT
  const result = await classifier.classify(input)
  return prescreenImageLabels(result.labels, options)
}
