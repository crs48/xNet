/**
 * On-device NSFW image classifier adapter (exploration 0175, phase 1).
 *
 * The heavy model (NSFWJS / a Transformers.js ONNX classifier) is INJECTED as a
 * `detect` function so this package carries no model binary and stays testable.
 * The adapter's job is to map a detector's category scores onto the xNet
 * sensitivity vocabulary as `AbuseLabel`s, conforming to `LocalClassifierAdapter`.
 *
 * Privacy (0175): this runs on the author's device (pre-screen + self-label
 * suggestion) and on the viewer's device (private filter). It never reports the
 * author — its output drives labels and the viewer's own dial only.
 */

import type { LocalClassifierAdapter, LocalClassifierProvenance } from './local-classifier'
import { createLocalClassificationResult } from './local-classifier'
import { buildSensitivityLabel, isSensitivityLabelValue } from './sensitivity'
import type { SensitivityLabelValue } from './sensitivity'
import type { AbuseLabel } from './types'

/** A single category score from an NSFW image model (e.g. NSFWJS / Falconsai). */
export type NsfwImageDetection = { label: string; score: number }

export type NsfwImageDetector = (
  input: { metadata?: Record<string, unknown> }
) => Promise<readonly NsfwImageDetection[]> | readonly NsfwImageDetection[]

export type NsfwImageClassifierOptions = {
  /** The injected model. */
  detect: NsfwImageDetector
  id?: string
  version?: string
  model?: string
  sourceDid?: string
  /** Minimum category score to emit a label. */
  threshold?: number
}

/**
 * Map an NSFW model category to the xNet sensitivity vocabulary. Covers the
 * common NSFWJS (`drawing/hentai/neutral/porn/sexy`) and Falconsai
 * (`normal/sexy/porn/hentai`) label sets plus a few generic synonyms.
 */
export function mapNsfwLabelToSensitivity(label: string): SensitivityLabelValue | null {
  const normalized = label.trim().toLowerCase()
  switch (normalized) {
    case 'porn':
    case 'explicit':
    case 'hentai': // animated explicit → treat as explicit
      return 'porn'
    case 'sexy':
    case 'suggestive':
    case 'sexual':
      return 'sexual'
    case 'nudity':
    case 'nude':
      return 'nudity'
    case 'gore':
    case 'graphic':
    case 'graphic-media':
    case 'violence':
      return 'graphic-media'
    case 'neutral':
    case 'normal':
    case 'drawing':
    case 'safe':
      return null
    default:
      return isSensitivityLabelValue(normalized) ? normalized : null
  }
}

const DEFAULT_THRESHOLD = 0.5

export function createNsfwImageClassifier(
  options: NsfwImageClassifierOptions
): LocalClassifierAdapter {
  const id = options.id ?? 'local.image.nsfw'
  const version = options.version ?? '1'
  const threshold = options.threshold ?? DEFAULT_THRESHOLD
  const provenance: LocalClassifierProvenance = {
    provider: 'local',
    adapterId: id,
    adapterVersion: version,
    model: options.model
  }

  return {
    id,
    version,
    model: options.model,
    supports(input) {
      const mediaKind = input.metadata?.mediaKind
      return (
        (typeof mediaKind === 'string' && mediaKind.startsWith('image')) ||
        input.metadata?.image !== undefined
      )
    },
    async classify(input) {
      const detections = await options.detect({ metadata: input.metadata })

      // Collapse to the strongest score per mapped sensitivity value.
      const byValue = new Map<SensitivityLabelValue, NsfwImageDetection>()
      for (const detection of detections) {
        const value = mapNsfwLabelToSensitivity(detection.label)
        if (value === null || detection.score < threshold) continue
        const existing = byValue.get(value)
        if (!existing || detection.score > existing.score) {
          byValue.set(value, detection)
        }
      }

      const labels: AbuseLabel[] = [...byValue.entries()].map(([value, detection]) =>
        buildSensitivityLabel({
          value,
          source: 'ml',
          confidence: detection.score,
          sourceDID: options.sourceDid,
          evidenceRefs: [`nsfw-model:${detection.label}:${detection.score.toFixed(2)}`]
        })
      )

      const signals = labels.map((label) => ({
        kind: 'label' as const,
        value: label.value,
        confidence: label.confidence,
        evidenceRefs: [...(label.evidenceRefs ?? [])],
        provenance
      }))

      return createLocalClassificationResult({ labels, signals, provenance })
    }
  }
}
