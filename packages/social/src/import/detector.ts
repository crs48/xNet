/**
 * Adapter detection helpers.
 */

import type { ArchiveManifest, ImportProbe, SocialImportAdapter } from './types'

export type SocialArchiveDetection = {
  adapter: SocialImportAdapter
  confidence: number
}

export function detectSocialArchive(
  adapters: readonly SocialImportAdapter[],
  manifest: ArchiveManifest
): SocialArchiveDetection | null {
  const detections = adapters
    .map((adapter) => ({ adapter, confidence: adapter.detect(manifest) }))
    .filter((detection) => detection.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)

  return detections[0] ?? null
}

export async function probeSocialArchive(
  adapters: readonly SocialImportAdapter[],
  manifest: ArchiveManifest
): Promise<ImportProbe | null> {
  const detection = detectSocialArchive(adapters, manifest)
  return detection ? detection.adapter.probe({ manifest }) : null
}
