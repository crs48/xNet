/**
 * @xnetjs/plugins — AI-authored plugin transform (exploration 0192).
 *
 * The hard part of AI authoring already ships (`@xnetjs/plugins/ai`:
 * NL → AST-validated script + provider routing). The missing headless step is
 * turning a generated script into an *installable* plugin: this wraps a
 * validated `GeneratedScript` into a `FeatureModule` whose command runs the
 * script, stamped with `ai-generated` provenance so the install path sandboxes
 * it at the `user` tier and still routes its capability requests through consent.
 *
 * It deliberately **refuses unvalidated code** — "the AI made it" never bypasses
 * the safety gate.
 */

import type { FeatureModule, ModuleCapabilities } from '../feature-module'
import type { InstallProvenance } from './provenance-trust'

/** The subset of `@xnetjs/plugins/ai`'s `AIScriptResponse` this transform needs. */
export interface GeneratedScript {
  code: string
  suggestedName: string
  validated: boolean
  explanation?: string
}

/** Runs the generated script body (injected so this stays decoupled from the sandbox). */
export type ScriptExecutor = (code: string) => void | Promise<void>

export interface ScriptToManifestInput {
  /** Reverse-domain id for the new plugin. */
  id: string
  /** The validated generated script. */
  script: GeneratedScript
  author?: string
  /** Capabilities the script needs (default: none — Layer-1 scripts are sandboxed). */
  capabilities?: ModuleCapabilities
  /** How to run the script when the command fires (default: throws until wired). */
  run?: ScriptExecutor
}

export interface AiAuthoredPlugin {
  manifest: FeatureModule
  /** Always `ai-generated` — the install path derives the `user` trust tier from it. */
  provenance: InstallProvenance
  /** The raw script body, for persistence/audit. */
  code: string
}

export class AiAuthoringError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiAuthoringError'
  }
}

const ID_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/i

/** `Summarize Tasks` → `summarize-tasks` (a safe command id). */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'run'
  )
}

/**
 * Wrap a validated generated script into an installable, `ai-generated` plugin.
 *
 * @throws {AiAuthoringError} if the id is malformed or the script is unvalidated.
 */
export function scriptToPluginManifest(input: ScriptToManifestInput): AiAuthoredPlugin {
  if (!ID_RE.test(input.id)) {
    throw new AiAuthoringError(`id must be reverse-domain (got: ${JSON.stringify(input.id)})`)
  }
  if (!input.script.validated) {
    throw new AiAuthoringError('refusing to wrap an unvalidated script')
  }

  const { code, suggestedName, explanation } = input.script
  const run = input.run
  const manifest: FeatureModule = {
    id: input.id,
    name: suggestedName,
    version: '0.1.0',
    author: input.author,
    description: explanation,
    capabilities: input.capabilities,
    contributes: {
      commands: [
        {
          id: slug(suggestedName),
          name: suggestedName,
          description: explanation,
          execute: () => {
            if (!run) throw new AiAuthoringError('no script executor configured')
            return run(code)
          }
        }
      ]
    }
  }

  return { manifest, provenance: 'ai-generated', code }
}
