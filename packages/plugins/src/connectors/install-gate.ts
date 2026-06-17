/**
 * @xnetjs/plugins — connector install gate (exploration 0196).
 *
 * Connectors flow through the same provenance→trust + consent machinery as any
 * plugin, with one extra rule: **a connector that requests secrets can never be
 * auto-trusted on `ai-generated` provenance.** "The model authored it" must not
 * be sufficient to hand it a credential — a human promotes it (re-authoring or
 * publishing it, which changes the provenance) before it can hold a token.
 */

import type { ConsentDecision } from '../ecosystem/consent'
import type { InstallProvenance } from '../ecosystem/provenance-trust'
import type { ModuleCapabilities } from '../feature-module'
import { evaluateInstallConsent } from '../ecosystem/consent'

export interface ConnectorInstallGate {
  /** The normal capability-consent decision (lines, danger, reprompt). */
  consent: ConsentDecision
  /** Whether the connector may install after the normal consent flow. */
  installable: boolean
  /** Why it is not installable (requires manual promotion), when blocked. */
  blockedReason?: string
}

/**
 * Evaluate whether a connector may install given its provenance + capabilities.
 * Returns the consent decision plus a hard gate that blocks secret-holding
 * AI-generated connectors from auto-install.
 */
export function evaluateConnectorInstall(
  provenance: InstallProvenance,
  capabilities: ModuleCapabilities | undefined
): ConnectorInstallGate {
  const consent = evaluateInstallConsent(provenance, capabilities)
  const wantsSecrets = !!capabilities?.secrets && capabilities.secrets.length > 0
  if (provenance === 'ai-generated' && wantsSecrets) {
    return {
      consent,
      installable: false,
      blockedReason:
        'An AI-generated connector cannot be granted secrets automatically — promote it ' +
        'manually (re-author or publish it) before it can hold credentials.'
    }
  }
  return { consent, installable: true }
}
