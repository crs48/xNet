/**
 * Lab → Extension publishing (exploration 0180).
 *
 * The headline of the metaprogramming layer: turn an authored Lab into a live
 * extension that hot-registers into the running workbench. We build a valid
 * {@link XNetExtension} whose command/slash-command contribution runs the Lab
 * code, validate it, gate it behind a capability prompt, then `install` +
 * `activate` it on the registry. The host (never the Lab) assigns the trust
 * tier from provenance.
 */

import type { LabNode } from './schema'
import type { LabInstallSource } from './trust'
import type { LabTrustTier } from './runtime/types'
import type {
  PluginPermissions,
  SlashCommandContext,
  XNetExtension
} from '@xnetjs/plugins'
import { validateManifest } from '@xnetjs/plugins'
import { deriveTrustTier } from './trust'

/** Turn arbitrary text into a reverse-domain-safe id segment. */
export function slugifyForId(input: string): string {
  let slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!slug) slug = 'untitled'
  // Each dotted segment after the first must start with a letter.
  if (!/^[a-z]/.test(slug)) slug = `lab-${slug}`
  return slug
}

export interface LabExtensionOptions {
  kind?: 'command' | 'slashCommand'
  author?: string
  description?: string
  version?: string
  permissions?: PluginPermissions
  /** Capabilities the contribution exposes; the handler the host wires up. */
  execute: () => void | Promise<void>
}

/**
 * Build (but do not install) the extension manifest for a Lab. The returned
 * manifest passes {@link validateManifest}. `execute` is the live handler the
 * command fires — typically "run this Lab and surface its output".
 */
export function buildLabExtensionManifest(
  lab: Pick<LabNode, 'id' | 'title' | 'description'>,
  options: LabExtensionOptions
): XNetExtension {
  const id = `xnet.lab.${slugifyForId(lab.title || lab.id)}`
  const description = options.description ?? lab.description
  const kind = options.kind ?? 'command'

  const manifest: XNetExtension = {
    id,
    name: lab.title || 'Untitled Lab',
    version: options.version ?? '1.0.0',
    ...(description ? { description } : {}),
    ...(options.author ? { author: options.author } : {}),
    ...(options.permissions ? { permissions: options.permissions } : {}),
    contributes:
      kind === 'slashCommand'
        ? {
            slashCommands: [
              {
                id: `${id}.run`,
                name: lab.title || 'Run Lab',
                ...(description ? { description } : {}),
                // SlashCommand handlers receive the editor context; the Lab
                // result is surfaced by the injected `execute`.
                execute: (_ctx: SlashCommandContext) => {
                  void options.execute()
                }
              }
            ]
          }
        : {
            commands: [
              {
                id: `${id}.run`,
                name: lab.title || 'Run Lab',
                ...(description ? { description } : {}),
                execute: options.execute
              }
            ]
          }
  }

  return validateManifest(manifest)
}

/** The minimal registry surface the publisher drives. */
export interface LabExtensionInstaller {
  install(manifest: XNetExtension): Promise<void>
  activate(pluginId: string): Promise<void>
}

export interface PublishLabRequest {
  manifest: XNetExtension
  registry: LabExtensionInstaller
  /**
   * Human-in-the-loop capability review. Return false to decline. When omitted,
   * the manifest is installed without a prompt (caller already consented).
   */
  requestPermission?: (permissions: PluginPermissions | undefined) => boolean | Promise<boolean>
  /** Provenance of this install (default `authored`). Determines the trust tier. */
  source?: LabInstallSource
}

export interface PublishLabResult {
  id: string
  manifest: XNetExtension
  trustTier: LabTrustTier
}

/**
 * Validate, gate, and hot-install a Lab extension. Throws if validation fails
 * or the user declines the capability prompt.
 */
export async function publishLabAsExtension(
  request: PublishLabRequest
): Promise<PublishLabResult> {
  const manifest = validateManifest(request.manifest)

  if (request.requestPermission) {
    const approved = await request.requestPermission(manifest.permissions)
    if (!approved) {
      throw new Error('Extension install declined')
    }
  }

  await request.registry.install(manifest)
  await request.registry.activate(manifest.id)

  return {
    id: manifest.id,
    manifest,
    trustTier: deriveTrustTier(request.source ?? 'authored')
  }
}
