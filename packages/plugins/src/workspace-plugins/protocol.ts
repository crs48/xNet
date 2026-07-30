/**
 * Workspace-plugin frame protocol (exploration 0331).
 *
 * The typed message vocabulary between the host realm and a sandboxed plugin
 * frame. Everything that crosses is JSON-pure data — module SOURCE goes in,
 * SafeNode-style render trees and JSON results come back. No functions, no
 * live references, no DOM.
 */

// ─── Frame → host ──────────────────────────────────────────────────────────

export type PluginFrameToHostMessage =
  /** Loader booted; ready to receive the module graph. */
  | { type: 'plugin:ready' }
  /** Entry module imported; these are the handler keys it actually exports. */
  | {
      type: 'plugin:registered'
      commands: string[]
      slashCommands: string[]
      views: string[]
      widgets: string[]
      agentTools: string[]
    }
  /** console.* inside the frame. */
  | { type: 'plugin:log'; level: 'log' | 'info' | 'warn' | 'error'; message: string }
  /** Uncaught error / unhandled rejection / module-link failure. */
  | { type: 'plugin:crash'; error: string }
  /** Store RPC request (the only way plugin code reaches data). */
  | { type: 'plugin:store-call'; id: number; op: string; args: Record<string, unknown> }
  /** Reply to a host `plugin:invoke`. */
  | { type: 'plugin:invoke-result'; id: number; ok: boolean; value?: unknown; error?: string }
  /** Reply to a host `plugin:render-view` — a JSON-pure render tree. */
  | { type: 'plugin:view-tree'; id: number; ok: boolean; tree?: unknown; error?: string }

// ─── Host → frame ──────────────────────────────────────────────────────────

export interface PluginGraphPayload {
  entry: string
  modules: Array<{ path: string; code: string; imports: Record<string, string> }>
  /** Vendor module sources keyed by pinned specifier (import-map singletons). */
  vendors: Record<string, string>
}

export type PluginHostToFrameMessage =
  /** The built module graph; the loader links and imports the entry. */
  | { type: 'plugin:load'; pluginId: string; graph: PluginGraphPayload }
  /** Invoke a contributed handler (command/slash-command/agent-tool). */
  | {
      type: 'plugin:invoke'
      id: number
      kind: 'command' | 'slashCommand' | 'agentTool'
      key: string
      args?: Record<string, unknown>
    }
  /** Render a contributed view/widget to a JSON-pure tree. */
  | { type: 'plugin:render-view'; id: number; viewType: string; props: Record<string, unknown> }
  /** Reply to a frame `plugin:store-call`. */
  | { type: 'plugin:store-result'; id: number; ok: boolean; value?: unknown; error?: string }

/** Store ops a plugin frame may request. Everything else is rejected. */
export const PLUGIN_STORE_OPS = ['query', 'get', 'create', 'update', 'delete'] as const
export type PluginStoreOp = (typeof PLUGIN_STORE_OPS)[number]
