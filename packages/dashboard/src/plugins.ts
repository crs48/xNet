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

/**
 * Summarize a plugin's PluginPermissions into the human-readable lines the
 * widget picker shows at add time.
 */
export function summarizePluginPermissions(permissions: {
  schemas?: { read?: string[] | '*'; write?: string[] | '*'; create?: string[] }
  capabilities?: {
    network?: boolean | string[]
    storage?: 'local' | 'shared'
    clipboard?: boolean
    notifications?: boolean
    processes?: boolean
  }
}): string[] {
  const lines: string[] = []
  const schemaName = (iri: string) => iri.split('/').pop()?.split('@')[0] ?? iri

  if (permissions.schemas?.read) {
    lines.push(
      permissions.schemas.read === '*'
        ? 'Read all your data'
        : `Read: ${permissions.schemas.read.map(schemaName).join(', ')}`
    )
  }
  if (permissions.schemas?.write) {
    lines.push(
      permissions.schemas.write === '*'
        ? 'Modify all your data'
        : `Modify: ${permissions.schemas.write.map(schemaName).join(', ')}`
    )
  }
  if (permissions.schemas?.create?.length) {
    lines.push(`Create: ${permissions.schemas.create.map(schemaName).join(', ')}`)
  }
  if (permissions.capabilities?.network) {
    lines.push(
      permissions.capabilities.network === true
        ? 'Access the network'
        : `Access the network: ${permissions.capabilities.network.join(', ')}`
    )
  }
  if (permissions.capabilities?.clipboard) lines.push('Read and write the clipboard')
  if (permissions.capabilities?.notifications) lines.push('Show notifications')
  if (permissions.capabilities?.processes) lines.push('Run system processes')

  return lines
}

export function widgetDefinitionFromContribution(
  contribution: WidgetContribution,
  trustTier: WidgetTrustTier,
  permissions?: string[]
): AnyWidgetDefinition {
  return {
    type: contribution.type,
    name: contribution.name,
    icon: contribution.icon ?? 'blocks',
    description: contribution.description,
    trustTier,
    ...(permissions && permissions.length > 0 ? { permissions } : {}),
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
    /** Permission summary lines surfaced at widget-add time */
    permissions?: string[]
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
        registry.register(
          widgetDefinitionFromContribution(contribution, trustTier, options.permissions)
        )
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
