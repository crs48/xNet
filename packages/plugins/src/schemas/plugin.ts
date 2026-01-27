/**
 * Plugin schema - stores plugin metadata as Nodes for P2P sync
 */

import { defineSchema, text, checkbox, date } from '@xnet/data'

export const PluginSchema = defineSchema({
  name: 'Plugin',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Unique plugin identifier (reverse-domain format) */
    pluginId: text({ required: true }),
    /** Human-readable name */
    name: text({ required: true }),
    /** Semantic version */
    version: text({ required: true }),
    /** Plugin description */
    description: text({}),
    /** Author name or organization */
    author: text({}),
    /** Whether plugin is enabled */
    enabled: checkbox({ default: true }),
    /** JSON-serialized manifest */
    manifest: text({ required: true }),
    /** Plugin source (URL or inline bundle) */
    source: text({}),
    /** JSON-serialized permissions */
    permissions: text({}),
    /** Installation timestamp */
    installedAt: date({})
  }
})

export type PluginNode = {
  id: string
  schemaId: string
  pluginId: string
  name: string
  version: string
  description?: string
  author?: string
  enabled: boolean
  manifest: string
  source?: string
  permissions?: string
  installedAt?: number
}
