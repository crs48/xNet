/**
 * Smart reference provider registry.
 *
 * Task chips intentionally reuse the shared external-reference parser, but
 * they still refuse generic links so task bodies stay compact.
 */

import type { ExternalReferenceDescriptor, ExternalReferenceKind } from '@xnetjs/data'
import { parseExternalReferenceUrl } from '@xnetjs/data'

export type SmartReferenceKind = ExternalReferenceKind

export interface SmartReference {
  provider: ExternalReferenceDescriptor['provider']
  kind: SmartReferenceKind
  url: string
  refId: string
  title: string
  subtitle?: string
  icon: string
  embedUrl?: string
  metadata: Record<string, string>
}

export function parseSmartReferenceUrl(url: string): SmartReference | null {
  const reference = parseExternalReferenceUrl(url)
  if (!reference || reference.provider === 'generic' || !reference.refId || !reference.icon) {
    return null
  }

  return {
    provider: reference.provider,
    kind: reference.kind,
    url: reference.normalizedUrl,
    refId: reference.refId,
    title: reference.title,
    ...(reference.subtitle ? { subtitle: reference.subtitle } : {}),
    icon: reference.icon,
    ...(reference.embedUrl ? { embedUrl: reference.embedUrl } : {}),
    metadata: reference.metadata
  }
}
