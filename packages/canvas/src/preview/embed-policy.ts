/**
 * Canvas compatibility facade over the shared data-layer embed registry.
 */

import {
  evaluateEmbedRegistryPolicy,
  getEmbedRegistryProviderPolicies,
  getEmbedRegistryProviderPolicy,
  type EmbedRegistryIframeSecurityAttributes,
  type EmbedRegistryPolicyDecision,
  type EmbedRegistryProvider,
  type EmbedRegistryProviderPolicy,
  type EvaluateEmbedRegistryPolicyInput
} from '@xnetjs/data'

export type CanvasEmbedProvider = EmbedRegistryProvider
export type CanvasIframeSecurityAttributes = EmbedRegistryIframeSecurityAttributes
export type CanvasEmbedProviderPolicy = EmbedRegistryProviderPolicy
export type CanvasEmbedPolicyDecision = EmbedRegistryPolicyDecision
export type EvaluateCanvasEmbedPolicyInput = EvaluateEmbedRegistryPolicyInput

export function getCanvasEmbedProviderPolicies(): CanvasEmbedProviderPolicy[] {
  return getEmbedRegistryProviderPolicies()
}

export function getCanvasEmbedProviderPolicy(
  provider: string | null | undefined
): CanvasEmbedProviderPolicy {
  return getEmbedRegistryProviderPolicy(provider)
}

export function evaluateCanvasEmbedPolicy(
  input: EvaluateCanvasEmbedPolicyInput
): CanvasEmbedPolicyDecision {
  return evaluateEmbedRegistryPolicy(input)
}
