/**
 * Swappable-engine selection (exploration 0279).
 *
 * The user picks a preferred engine in Settings; this resolves that preference
 * against the session's language so a non-matching engine (e.g. Parakeet v2 is
 * English-only) falls back **visibly** instead of silently producing garbage.
 * Pure function over `EngineRegistry` — the registry itself stays the single
 * source of what's installed on this platform.
 */

import type { DictationEngine, EngineDescriptor, EngineRegistry } from '@xnetjs/dictation'

export interface EngineSelection {
  engine: DictationEngine
  /**
   * Why this engine was chosen. `language-fallback` means the preferred engine
   * exists but can't handle the session language — surface a notice in the UI.
   */
  reason: 'preferred' | 'language-fallback' | 'default'
  /** Set when reason is `language-fallback`: the engine that was passed over. */
  fallbackFrom?: EngineDescriptor
}

const speaks = (descriptor: EngineDescriptor, language: string | undefined): boolean => {
  if (!language) return true
  if (descriptor.languages.includes('*')) return true
  const base = language.toLowerCase().split('-')[0]
  return descriptor.languages.some((l) => l.toLowerCase().split('-')[0] === base)
}

/**
 * Resolve the engine for a capture session.
 *
 * Order: the preferred engine when it speaks the language → any engine that
 * does (on-device first — local-first default) → the registry default.
 * Returns undefined only when the registry is empty.
 */
export function selectEngine(
  registry: EngineRegistry,
  options: { language?: string; preferredEngineId?: string } = {}
): EngineSelection | undefined {
  const { language, preferredEngineId } = options

  const preferred = preferredEngineId ? registry.get(preferredEngineId) : undefined
  if (preferred && speaks(preferred.descriptor, language)) {
    return { engine: preferred, reason: 'preferred' }
  }

  if (preferred) {
    // Preference exists but can't handle this language — find one that can,
    // preferring on-device engines (the local-first default).
    const candidates = registry
      .list()
      .filter((d) => speaks(d, language))
      .sort((a, b) => Number(b.onDevice) - Number(a.onDevice))
    const fallback = candidates[0] && registry.get(candidates[0].id)
    if (fallback) {
      return { engine: fallback, reason: 'language-fallback', fallbackFrom: preferred.descriptor }
    }
    // Nothing speaks the language; better an engine that might partially work
    // than none — keep the preference and let the notice explain.
    return { engine: preferred, reason: 'language-fallback', fallbackFrom: preferred.descriptor }
  }

  const fallback = registry.getDefault() ?? registry.resolve()
  return fallback ? { engine: fallback, reason: 'default' } : undefined
}
