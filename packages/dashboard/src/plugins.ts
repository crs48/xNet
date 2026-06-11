/**
 * Plugin widget bridge: sync WidgetContribution entries from the plugin
 * ContributionRegistry into the dashboard WidgetRegistry, with the trust
 * tier assigned by the HOST from the plugin's install source — never
 * self-declared by the contribution.
 *
 * v1 plugin widgets run in the host realm like every other plugin
 * contribution (developer-mode installs only). The SES-in-Worker and iframe
 * execution tiers (phase 4) slot in here by swapping the component for the
 * tier-appropriate sandbox host before registration.
 */

import type { Disposable, WidgetRegistry } from './registry'
import type { AnyWidgetDefinition, WidgetDataRequest, WidgetProps, WidgetTrustTier } from './types'
import type { WidgetContribution } from '@xnetjs/plugins'
import type { ComponentType } from 'react'
import { widgetRegistry } from './registry'

/** Minimal surface of TypedRegistry<WidgetContribution> we depend on. */
export interface WidgetContributionSource {
  getAll(): WidgetContribution[]
  onChange(listener: () => void): () => void
}

export function widgetDefinitionFromContribution(
  contribution: WidgetContribution,
  trustTier: WidgetTrustTier
): AnyWidgetDefinition {
  return {
    type: contribution.type,
    name: contribution.name,
    icon: contribution.icon ?? 'blocks',
    description: contribution.description,
    trustTier,
    configFields: contribution.configFields ?? [],
    defaultSize: contribution.defaultSize,
    getStubConfig: (ctx) => {
      const stub = contribution.getStubConfig(ctx)
      return {
        config: stub.config,
        ...(stub.query ? { query: stub.query as WidgetDataRequest } : {})
      }
    },
    component: contribution.component as unknown as ComponentType<
      WidgetProps<Record<string, unknown>>
    >
  }
}

/**
 * Mirror plugin widget contributions into the widget registry. Returns a
 * disposer that unregisters everything and stops watching.
 */
export function connectWidgetContributions(
  source: WidgetContributionSource,
  options: {
    registry?: WidgetRegistry
    /** Host-assigned tier for these contributions (default 'marketplace') */
    trustTier?: WidgetTrustTier
  } = {}
): () => void {
  const registry = options.registry ?? widgetRegistry
  const trustTier = options.trustTier ?? 'marketplace'
  const registered = new Map<string, Disposable>()

  const sync = () => {
    const current = new Map(source.getAll().map((entry) => [entry.type, entry]))

    for (const [type, disposable] of registered) {
      if (!current.has(type)) {
        disposable.dispose()
        registered.delete(type)
      }
    }

    for (const [type, contribution] of current) {
      if (registered.has(type)) continue
      registered.set(
        type,
        registry.register(widgetDefinitionFromContribution(contribution, trustTier))
      )
    }
  }

  sync()
  const unsubscribe = source.onChange(sync)

  return () => {
    unsubscribe()
    for (const disposable of registered.values()) {
      disposable.dispose()
    }
    registered.clear()
  }
}
