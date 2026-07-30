/**
 * Workspace-plugin host session (exploration 0331).
 *
 * The host-realm half of the frame protocol, transport-agnostic: the web app
 * wires `sendToFrame`/`handleFrameMessage` to a real iframe + MessagePort;
 * tests wire them to an in-process fake frame. The session owns:
 *
 *  - serving the built module graph on `plugin:ready`,
 *  - dispatching store calls through the gated {@link PluginStoreRpc},
 *  - request/response bookkeeping for handler invocation + view rendering,
 *  - the FEEDBACK BUFFER — console output, crashes, and store denials,
 *    timestamped and capped, that `plugin_preview_feedback` hands back to the
 *    authoring agent. Feedback is DATA about the plugin run, never
 *    instructions: consumers must treat it as untrusted plugin output.
 */

import type {
  PluginFrameToHostMessage,
  PluginGraphPayload,
  PluginHostToFrameMessage
} from './protocol'
import type { PluginStoreRpc } from './store-rpc'

export interface PluginFeedbackEntry {
  kind: 'log' | 'crash' | 'store-denied'
  level: 'log' | 'info' | 'warn' | 'error'
  message: string
  at: number
}

/** What the frame reported it actually exports after the entry import. */
export interface PluginRegisteredHandlers {
  commands: string[]
  slashCommands: string[]
  views: string[]
  widgets: string[]
  agentTools: string[]
}

export interface PluginFrameSessionOptions {
  pluginId: string
  graph: PluginGraphPayload
  storeRpc: PluginStoreRpc
  sendToFrame: (message: PluginHostToFrameMessage) => void
  /** Fired once the entry module imported and reported its handler keys. */
  onRegistered?: (handlers: PluginRegisteredHandlers) => void
  /** Fired on any uncaught frame error (module-link failure, crash). */
  onCrash?: (error: string) => void
  /** Wall-clock budget for invoke/render round-trips (default 3000ms). */
  callTimeoutMs?: number
  /** Feedback buffer cap (default 200 entries; oldest dropped). */
  feedbackLimit?: number
  now?: () => number
}

export interface PluginFrameSession {
  handleFrameMessage(message: PluginFrameToHostMessage): void
  /** Invoke a contributed handler in the frame. */
  invoke(
    kind: 'command' | 'slashCommand' | 'agentTool',
    key: string,
    args?: Record<string, unknown>
  ): Promise<unknown>
  /** Render a contributed view/widget to a JSON-pure tree. */
  renderView(viewType: string, props?: Record<string, unknown>): Promise<unknown>
  /** Drain (and clear) the buffered feedback for the authoring agent. */
  drainFeedback(): PluginFeedbackEntry[]
  /** Peek at buffered feedback without clearing. */
  peekFeedback(): PluginFeedbackEntry[]
  readonly registered: PluginRegisteredHandlers | null
  dispose(): void
}

const DEFAULT_CALL_TIMEOUT_MS = 3000
const DEFAULT_FEEDBACK_LIMIT = 200

export function createPluginFrameSession(options: PluginFrameSessionOptions): PluginFrameSession {
  const {
    graph,
    storeRpc,
    sendToFrame,
    onRegistered,
    onCrash,
    callTimeoutMs = DEFAULT_CALL_TIMEOUT_MS,
    feedbackLimit = DEFAULT_FEEDBACK_LIMIT,
    now = () => Date.now()
  } = options

  let disposed = false
  let registered: PluginRegisteredHandlers | null = null
  const feedback: PluginFeedbackEntry[] = []
  let nextCallId = 1
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: unknown }
  >()

  const pushFeedback = (entry: PluginFeedbackEntry): void => {
    feedback.push(entry)
    if (feedback.length > feedbackLimit) feedback.splice(0, feedback.length - feedbackLimit)
  }

  const settle = (id: number, ok: boolean, value: unknown, error?: string): void => {
    const call = pending.get(id)
    if (!call) return
    pending.delete(id)
    clearTimeout(call.timer as number)
    if (ok) call.resolve(value)
    else call.reject(new Error(error ?? 'plugin call failed'))
  }

  const roundTrip = (message: PluginHostToFrameMessage & { id: number }): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (disposed) {
        reject(new Error('plugin session disposed'))
        return
      }
      const timer = setTimeout(() => {
        pending.delete(message.id)
        reject(new Error(`plugin call timed out after ${callTimeoutMs}ms`))
      }, callTimeoutMs)
      pending.set(message.id, { resolve, reject, timer })
      sendToFrame(message)
    })

  return {
    handleFrameMessage(message) {
      if (disposed) return
      switch (message.type) {
        case 'plugin:ready':
          sendToFrame({ type: 'plugin:load', pluginId: options.pluginId, graph })
          break
        case 'plugin:registered':
          registered = {
            commands: message.commands,
            slashCommands: message.slashCommands,
            views: message.views,
            widgets: message.widgets,
            agentTools: message.agentTools
          }
          onRegistered?.(registered)
          break
        case 'plugin:log':
          pushFeedback({ kind: 'log', level: message.level, message: message.message, at: now() })
          break
        case 'plugin:crash':
          pushFeedback({ kind: 'crash', level: 'error', message: message.error, at: now() })
          onCrash?.(message.error)
          break
        case 'plugin:store-call':
          void storeRpc
            .call(message.op, message.args)
            .then((value) =>
              sendToFrame({ type: 'plugin:store-result', id: message.id, ok: true, value })
            )
            .catch((err: unknown) => {
              const text = err instanceof Error ? err.message : String(err)
              pushFeedback({ kind: 'store-denied', level: 'warn', message: text, at: now() })
              sendToFrame({ type: 'plugin:store-result', id: message.id, ok: false, error: text })
            })
          break
        case 'plugin:invoke-result':
          settle(message.id, message.ok, message.value, message.error)
          break
        case 'plugin:view-tree':
          settle(message.id, message.ok, message.tree, message.error)
          break
      }
    },

    invoke(kind, key, args) {
      const id = nextCallId++
      return roundTrip({ type: 'plugin:invoke', id, kind, key, args })
    },

    renderView(viewType, props) {
      const id = nextCallId++
      return roundTrip({ type: 'plugin:render-view', id, viewType, props: props ?? {} })
    },

    drainFeedback() {
      return feedback.splice(0, feedback.length)
    },

    peekFeedback() {
      return [...feedback]
    },

    get registered() {
      return registered
    },

    dispose() {
      disposed = true
      for (const [id, call] of pending) {
        clearTimeout(call.timer as number)
        call.reject(new Error('plugin session disposed'))
        pending.delete(id)
      }
    }
  }
}
