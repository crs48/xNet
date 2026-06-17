/**
 * @xnetjs/plugins — the AI→Lab→Plugin assembly line (exploration 0194 Phase 2).
 *
 * Closes the authoring loop: the AI *generates* a script, the script *runs* in a
 * Lab so the AI (and the user) see real output, and only after a human approves
 * is it *published* as a plugin. Each hop is an injected port, so this is pure
 * orchestration — testable without the AI provider, the labs ladder, or the
 * registry, and free of the `plugins → labs` dependency edge.
 *
 * It never auto-publishes: publishing is always gated on `consent`. The script
 * must be validated before it becomes a plugin (`scriptToPluginManifest` refuses
 * unvalidated code), so "the AI made it" never bypasses the gate.
 */

import { scriptToPluginManifest, type AiAuthoredPlugin, type GeneratedScript } from './ai-authoring'

/** The result of running a generated script in a Lab. */
export interface LabRunOutcome {
  ok: boolean
  output?: string
  error?: string
}

/** The injected capabilities the pipeline orchestrates. */
export interface AiPluginPipelinePorts {
  /** Generate a (validated) script from natural-language intent. */
  generate: (intent: string) => Promise<GeneratedScript>
  /** Run the script in a Lab and report the real result. */
  runLab: (code: string) => Promise<LabRunOutcome>
  /** Ask the human to approve publishing, given the plugin + its run output. */
  consent: (plugin: AiAuthoredPlugin, run: LabRunOutcome) => Promise<boolean>
  /** Publish the approved plugin (e.g. `publishLabAsExtension` / `registry.install`). */
  publish: (plugin: AiAuthoredPlugin) => Promise<void>
}

export interface AiPluginPipelineInput {
  /** Natural-language description of the plugin to build. */
  intent: string
  /** Reverse-domain id for the new plugin. */
  id: string
  author?: string
}

export type AiPluginPipelineResult =
  | { status: 'generation-invalid'; reason: string }
  | { status: 'run-failed'; plugin: AiAuthoredPlugin; run: LabRunOutcome }
  | { status: 'declined'; plugin: AiAuthoredPlugin; run: LabRunOutcome }
  | { status: 'published'; plugin: AiAuthoredPlugin; run: LabRunOutcome }

/**
 * Run the generate → lab-test → consent → publish pipeline. Returns a tagged
 * result at whichever stage it stops; only `published` means the plugin landed.
 */
export async function runAiPluginPipeline(
  input: AiPluginPipelineInput,
  ports: AiPluginPipelinePorts
): Promise<AiPluginPipelineResult> {
  const script = await ports.generate(input.intent)
  if (!script.validated) {
    return { status: 'generation-invalid', reason: 'AI produced a script that failed validation' }
  }

  const plugin = scriptToPluginManifest({ id: input.id, script, author: input.author })
  const run = await ports.runLab(script.code)
  if (!run.ok) {
    return { status: 'run-failed', plugin, run }
  }

  const approved = await ports.consent(plugin, run)
  if (!approved) {
    return { status: 'declined', plugin, run }
  }

  await ports.publish(plugin)
  return { status: 'published', plugin, run }
}
