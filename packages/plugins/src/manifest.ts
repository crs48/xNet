/**
 * Plugin manifest types and validation
 */

import type { ExtensionContext } from './context'
import type {
  ViewContribution,
  CommandContribution,
  SlashCommandContribution,
  EditorContribution,
  SidebarContribution,
  PropertyHandlerContribution,
  BlockContribution,
  SettingContribution,
  SchemaContribution
} from './contributions'
import type { Platform, PluginPermissions } from './types'

// ─── Manifest Types ────────────────────────────────────────────────────────

/**
 * Plugin manifest - defines what a plugin provides and how it integrates
 */
export interface XNetExtension {
  /** Unique plugin ID (reverse-domain format: 'com.example.my-plugin') */
  id: string
  /** Human-readable plugin name */
  name: string
  /** Semantic version */
  version: string
  /** Plugin description */
  description?: string
  /** Author name or organization */
  author?: string
  /** Minimum compatible xNet version */
  xnetVersion?: string
  /** Platforms this plugin supports (default: all) */
  platforms?: Platform[]
  /** Permission declarations */
  permissions?: PluginPermissions

  /** Static contributions declared in manifest */
  contributes?: PluginContributions

  /** Called when plugin is activated */
  activate?(ctx: ExtensionContext): void | Promise<void>
  /** Called when plugin is deactivated */
  deactivate?(): void | Promise<void>
}

/**
 * Contributions a plugin can declare
 */
export interface PluginContributions {
  schemas?: SchemaContribution[]
  views?: ViewContribution[]
  editorExtensions?: EditorContribution[]
  propertyHandlers?: PropertyHandlerContribution[]
  blocks?: BlockContribution[]
  commands?: CommandContribution[]
  settings?: SettingContribution[]
  sidebarItems?: SidebarContribution[]
  slashCommands?: SlashCommandContribution[]
}

// ─── Validation ────────────────────────────────────────────────────────────

export class PluginValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: string[]
  ) {
    super(message)
    this.name = 'PluginValidationError'
  }
}

/**
 * Validate a plugin manifest
 * @throws PluginValidationError if validation fails
 */
export function validateManifest(manifest: unknown): XNetExtension {
  const issues: string[] = []

  if (!manifest || typeof manifest !== 'object') {
    throw new PluginValidationError('Manifest must be an object', ['Invalid manifest type'])
  }

  const m = manifest as Record<string, unknown>

  // Required fields
  if (typeof m.id !== 'string' || !m.id) {
    issues.push('id is required and must be a non-empty string')
  } else if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/i.test(m.id)) {
    issues.push('id must be in reverse-domain format (e.g., com.example.my-plugin)')
  }

  if (typeof m.name !== 'string' || !m.name) {
    issues.push('name is required and must be a non-empty string')
  }

  if (typeof m.version !== 'string' || !m.version) {
    issues.push('version is required and must be a non-empty string')
  } else if (!/^\d+\.\d+\.\d+/.test(m.version)) {
    issues.push('version must be a valid semver (e.g., 1.0.0)')
  }

  // Optional fields type checking
  if (m.description !== undefined && typeof m.description !== 'string') {
    issues.push('description must be a string')
  }

  if (m.author !== undefined && typeof m.author !== 'string') {
    issues.push('author must be a string')
  }

  if (m.platforms !== undefined) {
    if (!Array.isArray(m.platforms)) {
      issues.push('platforms must be an array')
    } else {
      const validPlatforms = ['web', 'electron', 'mobile']
      for (const p of m.platforms) {
        if (!validPlatforms.includes(p)) {
          issues.push(`Invalid platform: ${p}. Must be one of: ${validPlatforms.join(', ')}`)
        }
      }
    }
  }

  if (m.activate !== undefined && typeof m.activate !== 'function') {
    issues.push('activate must be a function')
  }

  if (m.deactivate !== undefined && typeof m.deactivate !== 'function') {
    issues.push('deactivate must be a function')
  }

  if (issues.length > 0) {
    throw new PluginValidationError(
      `Plugin manifest validation failed: ${issues.join('; ')}`,
      issues
    )
  }

  return manifest as XNetExtension
}

// ─── Helper ────────────────────────────────────────────────────────────────

/**
 * Define a plugin extension with type checking
 */
export function defineExtension(manifest: XNetExtension): XNetExtension {
  validateManifest(manifest)
  return manifest
}
