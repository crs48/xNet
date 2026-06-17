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
  SchemaContribution,
  CanvasCardContribution,
  CanvasIngestorContribution,
  CanvasToolContribution,
  CanvasLayoutContribution,
  CanvasEdgeContribution,
  CanvasInspectorContribution,
  CanvasTemplateContribution,
  WidgetContribution,
  ImporterContribution
} from './contributions'
import type { MentionProviderContribution } from './mention-providers'
import type { Platform, PluginPermissions } from './types'

// ─── Manifest Types ────────────────────────────────────────────────────────

/**
 * How a plugin is monetized (exploration 0196). `free` is the default when
 * `pricing` is absent. Paid plugins (`one-time`/`subscription`) are gated at
 * install by a license check (see `PluginRegistry.install`'s `checkLicense`).
 */
export interface PluginPricing {
  /** `free` — no license required. `one-time`/`subscription` — license-gated. */
  mode: 'free' | 'one-time' | 'subscription'
  /** Price in integer minor units (e.g. cents). Omitted/0 for free. */
  amountMinor?: number
  /** ISO-4217 currency code (e.g. `USD`). Required when `amountMinor` > 0. */
  currency?: string
  /**
   * Who runs checkout: `managed` = the xNet marketplace via Stripe Connect (the
   * platform takes its fee); `byo` = the author hosts their own checkout and
   * mints their own license (xNet takes 0%). Default `managed`.
   */
  billing?: 'managed' | 'byo'
  /** Free-trial length in days (subscriptions). */
  trialDays?: number
}

/** True when a pricing descriptor denotes a paid plugin that needs a license. */
export function isPaidPricing(pricing: PluginPricing | undefined): boolean {
  return !!pricing && pricing.mode !== 'free'
}

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
  /** Minimum compatible xNet version (semver range, e.g. ">=0.6.0") */
  xnetVersion?: string
  /** Platforms this plugin supports (default: all) */
  platforms?: Platform[]
  /** Permission declarations */
  permissions?: PluginPermissions
  /**
   * Other plugins this one requires, as `{ '<pluginId>': '<versionRange>' }`
   * (exploration 0192). Resolved at install time — see `ecosystem/dependencies`.
   */
  dependencies?: Record<string, string>

  /**
   * SPDX license id (exploration 0196). Paid plugins must declare a license the
   * marketplace pre-approves — `FSL-1.1-MIT` / `FSL-1.1-Apache-2.0` (source-
   * available, auto-opens after 2 years) or an OSI id (`MIT`, `Apache-2.0`, …).
   * Defaults to `MIT` when absent.
   */
  license?: string
  /** How this plugin is monetized (exploration 0196). Absent = free. */
  pricing?: PluginPricing
  /**
   * The publisher's DID. Supersedes the bare `author` string for paid plugins —
   * licenses, payouts, and provenance attach to this identity (exploration 0196).
   */
  publisherDid?: string

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
  /** Dashboard widgets (0162); trust tier is host-assigned at registration */
  widgets?: WidgetContribution[]
  editorExtensions?: EditorContribution[]
  propertyHandlers?: PropertyHandlerContribution[]
  blocks?: BlockContribution[]
  commands?: CommandContribution[]
  settings?: SettingContribution[]
  sidebarItems?: SidebarContribution[]
  slashCommands?: SlashCommandContribution[]
  canvasCards?: CanvasCardContribution[]
  canvasIngestors?: CanvasIngestorContribution[]
  canvasTools?: CanvasToolContribution[]
  canvasLayouts?: CanvasLayoutContribution[]
  canvasEdges?: CanvasEdgeContribution[]
  canvasInspectors?: CanvasInspectorContribution[]
  canvasTemplates?: CanvasTemplateContribution[]
  /** Data-export / source importers (exploration 0189). */
  importers?: ImporterContribution[]
  /** Mention/typeahead providers — extend `[[`/`#`/`@` (exploration 0194). */
  mentionProviders?: MentionProviderContribution[]
}

type CanvasContributionArrayKey =
  | 'canvasCards'
  | 'canvasIngestors'
  | 'canvasTools'
  | 'canvasLayouts'
  | 'canvasEdges'
  | 'canvasInspectors'
  | 'canvasTemplates'

const CANVAS_CONTRIBUTION_TYPES: Record<CanvasContributionArrayKey, string> = {
  canvasCards: 'canvas.card',
  canvasIngestors: 'canvas.ingestor',
  canvasTools: 'canvas.tool',
  canvasLayouts: 'canvas.layout',
  canvasEdges: 'canvas.edge',
  canvasInspectors: 'canvas.inspector',
  canvasTemplates: 'canvas.template'
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

  if (m.license !== undefined && (typeof m.license !== 'string' || !m.license)) {
    issues.push('license must be a non-empty SPDX id string')
  }

  if (m.publisherDid !== undefined && typeof m.publisherDid !== 'string') {
    issues.push('publisherDid must be a string')
  }

  validatePricing(m.pricing, issues)

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

  validateDependencies(m.dependencies, issues)
  validateContributions(m.contributes, issues)

  if (issues.length > 0) {
    throw new PluginValidationError(
      `Plugin manifest validation failed: ${issues.join('; ')}`,
      issues
    )
  }

  return manifest as XNetExtension
}

const PRICING_MODES = ['free', 'one-time', 'subscription']
const BILLING_KINDS = ['managed', 'byo']

/** Validate the optional `pricing` descriptor (exploration 0196). */
function validatePricing(pricing: unknown, issues: string[]): void {
  if (pricing === undefined) return
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) {
    issues.push('pricing must be an object')
    return
  }
  const p = pricing as Record<string, unknown>
  if (typeof p.mode !== 'string' || !PRICING_MODES.includes(p.mode)) {
    issues.push(`pricing.mode must be one of: ${PRICING_MODES.join(', ')}`)
  }
  if (p.amountMinor !== undefined) {
    if (
      typeof p.amountMinor !== 'number' ||
      !Number.isInteger(p.amountMinor) ||
      p.amountMinor < 0
    ) {
      issues.push('pricing.amountMinor must be a non-negative integer (minor units)')
    } else if (p.amountMinor > 0 && typeof p.currency !== 'string') {
      issues.push('pricing.currency is required when amountMinor > 0')
    }
  }
  if (
    p.currency !== undefined &&
    (typeof p.currency !== 'string' || !/^[A-Za-z]{3}$/.test(p.currency))
  ) {
    issues.push('pricing.currency must be a 3-letter ISO-4217 code')
  }
  if (
    p.billing !== undefined &&
    (typeof p.billing !== 'string' || !BILLING_KINDS.includes(p.billing))
  ) {
    issues.push(`pricing.billing must be one of: ${BILLING_KINDS.join(', ')}`)
  }
  if (p.trialDays !== undefined && (typeof p.trialDays !== 'number' || p.trialDays < 0)) {
    issues.push('pricing.trialDays must be a non-negative number')
  }
}

/** Validate the optional `dependencies` map (exploration 0192). */
function validateDependencies(dependencies: unknown, issues: string[]): void {
  if (dependencies === undefined) return
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
    issues.push('dependencies must be an object of pluginId → versionRange')
    return
  }
  if (Object.values(dependencies).some((v) => typeof v !== 'string')) {
    issues.push('dependencies values must be version-range strings')
  }
}

function validateContributions(contributes: unknown, issues: string[]): void {
  if (contributes === undefined) return

  if (!contributes || typeof contributes !== 'object' || Array.isArray(contributes)) {
    issues.push('contributes must be an object')
    return
  }

  const c = contributes as Record<string, unknown>

  for (const [field, contributionType] of Object.entries(CANVAS_CONTRIBUTION_TYPES) as Array<
    [CanvasContributionArrayKey, string]
  >) {
    const value = c[field]
    if (value === undefined) continue

    if (!Array.isArray(value)) {
      issues.push(`contributes.${field} must be an array`)
      continue
    }

    value.forEach((contribution, index) => {
      validateCanvasContributionDescriptor({
        contribution,
        contributionType,
        field,
        index,
        issues
      })
    })
  }
}

function validateCanvasContributionDescriptor(input: {
  contribution: unknown
  contributionType: string
  field: CanvasContributionArrayKey
  index: number
  issues: string[]
}): void {
  const { contribution, contributionType, field, index, issues } = input
  const path = `contributes.${field}[${index}]`

  if (!contribution || typeof contribution !== 'object' || Array.isArray(contribution)) {
    issues.push(`${path} must be an object`)
    return
  }

  const descriptor = contribution as Record<string, unknown>

  if (typeof descriptor.id !== 'string' || !descriptor.id) {
    issues.push(`${path}.id is required and must be a non-empty string`)
  }

  if (descriptor.type !== contributionType) {
    issues.push(`${path}.type must be '${contributionType}'`)
  }

  validateOptionalString(descriptor.name, `${path}.name`, issues)
  validateOptionalString(descriptor.description, `${path}.description`, issues)
  validateOptionalString(descriptor.icon, `${path}.icon`, issues)
  validateOptionalNumber(descriptor.priority, `${path}.priority`, issues)
  validateOptionalStringArray(descriptor.permissions, `${path}.permissions`, issues)

  switch (field) {
    case 'canvasCards':
      validateRequiredString(descriptor.rendererEntrypoint, `${path}.rendererEntrypoint`, issues)
      validateOptionalString(descriptor.previewEntrypoint, `${path}.previewEntrypoint`, issues)
      validateOptionalStringArray(descriptor.previewTiers, `${path}.previewTiers`, issues)
      break
    case 'canvasIngestors':
      validateRequiredString(descriptor.input, `${path}.input`, issues)
      validateRequiredString(descriptor.matchEntrypoint, `${path}.matchEntrypoint`, issues)
      validateRequiredString(descriptor.ingestEntrypoint, `${path}.ingestEntrypoint`, issues)
      validateOptionalStringArray(descriptor.mimeTypes, `${path}.mimeTypes`, issues)
      validateOptionalStringArray(descriptor.fileExtensions, `${path}.fileExtensions`, issues)
      validateOptionalStringArray(descriptor.urlPatterns, `${path}.urlPatterns`, issues)
      break
    case 'canvasTools':
      validateRequiredString(
        descriptor.activationEntrypoint,
        `${path}.activationEntrypoint`,
        issues
      )
      validateOptionalString(descriptor.group, `${path}.group`, issues)
      validateOptionalString(descriptor.keybinding, `${path}.keybinding`, issues)
      validateOptionalString(descriptor.cursor, `${path}.cursor`, issues)
      break
    case 'canvasLayouts':
      validateRequiredString(descriptor.scope, `${path}.scope`, issues)
      validateRequiredString(descriptor.applyEntrypoint, `${path}.applyEntrypoint`, issues)
      validateOptionalStringArray(descriptor.supportedKinds, `${path}.supportedKinds`, issues)
      validateOptionalStringArray(descriptor.supportedSchemas, `${path}.supportedSchemas`, issues)
      break
    case 'canvasEdges':
      validateRequiredString(descriptor.label, `${path}.label`, issues)
      if (typeof descriptor.directed !== 'boolean') {
        issues.push(`${path}.directed is required and must be a boolean`)
      }
      validateOptionalStringArray(
        descriptor.allowedSourceSchemas,
        `${path}.allowedSourceSchemas`,
        issues
      )
      validateOptionalStringArray(
        descriptor.allowedTargetSchemas,
        `${path}.allowedTargetSchemas`,
        issues
      )
      validateOptionalString(descriptor.style, `${path}.style`, issues)
      break
    case 'canvasInspectors':
      validateRequiredString(descriptor.placement, `${path}.placement`, issues)
      validateRequiredString(descriptor.panelEntrypoint, `${path}.panelEntrypoint`, issues)
      validateOptionalStringArray(descriptor.supportedKinds, `${path}.supportedKinds`, issues)
      validateOptionalStringArray(descriptor.supportedSchemas, `${path}.supportedSchemas`, issues)
      validateOptionalStringArray(
        descriptor.supportedProviders,
        `${path}.supportedProviders`,
        issues
      )
      break
    case 'canvasTemplates':
      validateRequiredString(descriptor.category, `${path}.category`, issues)
      validateRequiredString(
        descriptor.instantiateEntrypoint,
        `${path}.instantiateEntrypoint`,
        issues
      )
      validateOptionalString(descriptor.previewEntrypoint, `${path}.previewEntrypoint`, issues)
      validateOptionalStringArray(descriptor.tags, `${path}.tags`, issues)
      break
  }
}

function validateRequiredString(value: unknown, path: string, issues: string[]): void {
  if (typeof value !== 'string' || !value) {
    issues.push(`${path} is required and must be a non-empty string`)
  }
}

function validateOptionalString(value: unknown, path: string, issues: string[]): void {
  if (value !== undefined && typeof value !== 'string') {
    issues.push(`${path} must be a string`)
  }
}

function validateOptionalNumber(value: unknown, path: string, issues: string[]): void {
  if (value !== undefined && typeof value !== 'number') {
    issues.push(`${path} must be a number`)
  }
}

function validateOptionalStringArray(value: unknown, path: string, issues: string[]): void {
  if (value === undefined) return

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    issues.push(`${path} must be an array of strings`)
  }
}

// ─── Helper ────────────────────────────────────────────────────────────────

/**
 * Define a plugin extension with type checking
 */
export function defineExtension(manifest: XNetExtension): XNetExtension {
  validateManifest(manifest)
  return manifest
}
