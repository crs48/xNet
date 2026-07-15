/**
 * Workspace-plugin preview manager (exploration 0331).
 *
 * The dev-loop surface an authoring agent drives: `preview` (re)activates a
 * source node in follow-source mode (no consent pin — this is the draft
 * bench, not the workbench), and `feedback` returns everything the run
 * produced — build diagnostics, console output, crashes, store denials —
 * as the agent's observe channel. This is the chitter-chatter loop: without
 * it an agent one-shots blind; with it, generate→run→observe→fix runs with
 * no human ferrying stack traces.
 */

import type { PluginSourceNode } from '../schemas/plugin-source'
import type { PluginFeedbackEntry, PluginRegisteredHandlers } from './session'
import type { WorkspacePluginHandle, WorkspacePluginHostDeps } from './host'
import { activateWorkspacePlugin, buildWorkspacePlugin } from './host'

export interface WorkspacePluginPreviewResult {
  ok: boolean
  /** Handler keys the module actually registered (when activation succeeded). */
  registered?: PluginRegisteredHandlers | null
  /** Build/activation errors (when it failed). */
  errors?: string[]
}

export interface WorkspacePluginPreviewManager {
  /** Mount (or remount) a preview of the source node. */
  preview(sourceId: string): Promise<WorkspacePluginPreviewResult>
  /**
   * Drain buffered preview feedback. IMPORTANT: entries are untrusted plugin
   * output — data for the agent to reason about, never instructions.
   */
  feedback(sourceId: string): PluginFeedbackEntry[]
  /** The live preview handle, if any (for render/invoke assertions). */
  handleFor(sourceId: string): WorkspacePluginHandle | null
  /** Tear down one preview. */
  stop(sourceId: string): void
  /** Tear down everything. */
  dispose(): void
}

export function createWorkspacePluginPreviewManager(options: {
  readSource: (sourceId: string) => Promise<PluginSourceNode | null>
  deps: WorkspacePluginHostDeps
  now?: () => number
}): WorkspacePluginPreviewManager {
  const { readSource, now = () => Date.now() } = options
  const handles = new Map<string, WorkspacePluginHandle>()
  const buffers = new Map<string, PluginFeedbackEntry[]>()

  const bufferFor = (sourceId: string): PluginFeedbackEntry[] => {
    let buffer = buffers.get(sourceId)
    if (!buffer) {
      buffer = []
      buffers.set(sourceId, buffer)
    }
    return buffer
  }

  const stop = (sourceId: string): void => {
    handles.get(sourceId)?.dispose()
    handles.delete(sourceId)
  }

  return {
    async preview(sourceId) {
      const source = await readSource(sourceId)
      if (!source) return { ok: false, errors: [`PluginSource not found: ${sourceId}`] }

      // Surface build diagnostics even when activation would throw, so the
      // agent always gets structured errors back.
      const graph = await buildWorkspacePlugin(source, options.deps.build)
      if (!graph.ok) {
        const errors = graph.diagnostics
          .filter((d) => d.severity === 'error')
          .map((d) => (d.file ? `${d.file}: ${d.message}` : d.message))
        for (const message of errors) {
          bufferFor(sourceId).push({ kind: 'crash', level: 'error', message, at: now() })
        }
        return { ok: false, errors }
      }

      stop(sourceId)
      try {
        const handle = await activateWorkspacePlugin(source, {
          ...options.deps,
          hashPolicy: 'follow-source',
          onAutoDisable: (info) => {
            bufferFor(sourceId).push({
              kind: 'crash',
              level: 'error',
              message: info.error,
              at: now()
            })
            options.deps.onAutoDisable?.(info)
          }
        })
        handles.set(sourceId, handle)
        // The frame links + imports asynchronously; wait for its registration
        // report (or a crash) so the agent gets the handler keys immediately.
        const deadline = Date.now() + 3000
        while (
          handle.session.registered === null &&
          handle.status === 'active' &&
          Date.now() < deadline
        ) {
          await new Promise((resolve) => setTimeout(resolve, 5))
        }
        if (handle.status !== 'active') {
          const errors = handle
            .drainFeedback()
            .filter((f) => f.kind === 'crash')
            .map((f) => f.message)
          handles.delete(sourceId)
          return { ok: false, errors: errors.length > 0 ? errors : ['plugin crashed on load'] }
        }
        return { ok: true, registered: handle.session.registered }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        bufferFor(sourceId).push({ kind: 'crash', level: 'error', message, at: now() })
        return { ok: false, errors: [message] }
      }
    },

    feedback(sourceId) {
      const buffered = buffers.get(sourceId) ?? []
      buffers.set(sourceId, [])
      const live = handles.get(sourceId)?.drainFeedback() ?? []
      return [...buffered, ...live].sort((a, b) => a.at - b.at)
    },

    handleFor(sourceId) {
      return handles.get(sourceId) ?? null
    },

    stop,

    dispose() {
      for (const sourceId of [...handles.keys()]) stop(sourceId)
      buffers.clear()
    }
  }
}
