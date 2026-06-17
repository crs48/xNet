/**
 * @xnetjs/plugins — capability consent (exploration 0192).
 *
 * Turns a `ModuleCapabilities` declaration into human-readable consent lines for
 * the install dialog, and decides whether a given install even needs a consent
 * prompt (wiring `requiresCapabilityReprompt` into the install flow). The React
 * dialog is app-side; this is the headless logic it renders and obeys.
 *
 * Design note: a `*` (all-schemas) or raw-secret grant is rendered as `danger`
 * so the UI can shout — the npm-permissions failure mode is consent fatigue, so
 * broad grants must look different from narrow ones.
 */

import type { ModuleCapabilities } from '../feature-module'
import {
  requiresCapabilityReprompt,
  type InstallProvenance,
  type PluginTrustTier,
  deriveTrustTier
} from './provenance-trust'

/** A single human-readable line in the consent dialog. */
export interface ConsentLine {
  /** Coarse icon hint for the UI (`edit`, `eye`, `globe`, `key`, `plug`). */
  icon: 'edit' | 'eye' | 'globe' | 'key' | 'plug'
  /** Human sentence, e.g. "Modify your Task data". */
  text: string
  /** Whether this grant is broad/sensitive enough to warrant a warning. */
  danger: boolean
}

/** Short, human label for a schema IRI: `xnet://xnet.fyi/Task@1.0.0` → `Task`. */
export function shortSchemaName(iri: string): string {
  if (iri === '*') return 'all data'
  const afterAuthority = iri.split('/').pop() ?? iri
  return afterAuthority.split('@')[0] || iri
}

function isBroad(pattern: string): boolean {
  return pattern === '*' || pattern.endsWith('/*')
}

/** Describe a capability grant as consent lines (one per declared capability). */
export function describeCapabilities(caps: ModuleCapabilities | undefined): ConsentLine[] {
  if (!caps) return []
  const lines: ConsentLine[] = []

  for (const iri of caps.schemaWrite ?? []) {
    lines.push({
      icon: 'edit',
      text: `Modify your ${shortSchemaName(iri)}`,
      danger: isBroad(iri)
    })
  }
  for (const iri of caps.schemaRead ?? []) {
    lines.push({
      icon: 'eye',
      text: `Read your ${shortSchemaName(iri)}`,
      danger: isBroad(iri)
    })
  }
  for (const host of caps.network ?? []) {
    lines.push({ icon: 'globe', text: `Connect to ${host}`, danger: false })
  }
  for (const key of caps.secrets ?? []) {
    // Secrets are first-party only; surfacing one in a consent dialog is a flag.
    lines.push({ icon: 'key', text: `Use server secret ${key}`, danger: true })
  }
  for (const endowment of caps.endowments ?? []) {
    lines.push({ icon: 'plug', text: `Use host API: ${endowment}`, danger: false })
  }
  return lines
}

/** The decision the install path makes about consent for a given install. */
export interface ConsentDecision {
  /** Provenance-derived trust tier this plugin will run at. */
  tier: PluginTrustTier
  /** Whether the user must be prompted before activation. */
  needsPrompt: boolean
  /** The lines to show, if prompted. */
  lines: ConsentLine[]
  /** True if any requested grant is broad/sensitive. */
  hasDanger: boolean
}

/**
 * Decide whether an install needs consent and what to show. `needsPrompt` is
 * true only when provenance requires a re-prompt AND the plugin actually
 * requests capabilities — a capability-free marketplace plugin still installs
 * into the marketplace sandbox tier but has nothing to consent to.
 */
export function evaluateInstallConsent(
  provenance: InstallProvenance,
  caps: ModuleCapabilities | undefined
): ConsentDecision {
  const lines = describeCapabilities(caps)
  const needsPrompt = requiresCapabilityReprompt(provenance) && lines.length > 0
  return {
    tier: deriveTrustTier(provenance),
    needsPrompt,
    lines,
    hasDanger: lines.some((l) => l.danger)
  }
}
