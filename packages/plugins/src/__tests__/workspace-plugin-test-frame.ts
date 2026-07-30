/**
 * In-process fake of the workspace-plugin sandbox frame (0331 tests).
 *
 * Emulates exactly what the real frame runtime (`frame.ts`) does — link the
 * delivered module graph, import the entry, serve invoke/render/store calls —
 * but in the test realm, using `data:` URL dynamic imports instead of blob
 * URLs. This makes host-side tests exercise the REAL protocol and REAL module
 * execution without a DOM. Production isolation properties (opaque origin,
 * CSP) are asserted separately against the srcdoc string.
 */

import type {
  PluginFrameToHostMessage,
  PluginGraphPayload,
  PluginHostToFrameMessage
} from '../workspace-plugins/protocol'
import type { PluginFrameTransport } from '../workspace-plugins/host'

interface PluginDescriptor {
  commands?: Record<string, (args: Record<string, unknown>) => unknown>
  slashCommands?: Record<string, (args: Record<string, unknown>) => unknown>
  views?: Record<string, (props: Record<string, unknown>) => unknown>
  widgets?: Record<string, (props: Record<string, unknown>) => unknown>
  agentTools?: Record<string, (args: Record<string, unknown>) => unknown>
}

let frameCounter = 0

/** Link a module graph via data: URLs (the test analog of the blob linker). */
function linkGraph(graph: PluginGraphPayload, apiSource: string): string {
  const urls = new Map<string, string>()
  const toDataUrl = (code: string): string =>
    `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`
  urls.set('xnet:plugin-api', toDataUrl(apiSource))
  for (const [specifier, source] of Object.entries(graph.vendors ?? {})) {
    urls.set(specifier, toDataUrl(source))
  }
  const modules = new Map(graph.modules.map((m) => [m.path, m]))
  const linking = new Set<string>()
  const linkModule = (path: string): string => {
    const existing = urls.get(path)
    if (existing) return existing
    if (linking.has(path)) throw new Error(`Import cycle at ${path}`)
    linking.add(path)
    const mod = modules.get(path)
    if (!mod) throw new Error(`Module not in graph: ${path}`)
    let code = mod.code
    for (const [specifier, resolved] of Object.entries(mod.imports)) {
      const url = linkModule(resolved)
      code = code.replaceAll(`'${specifier}'`, JSON.stringify(url))
      code = code.replaceAll(`"${specifier}"`, JSON.stringify(url))
    }
    const url = toDataUrl(code)
    urls.set(path, url)
    linking.delete(path)
    return url
  }
  return linkModule(graph.entry)
}

export interface FakeFrame {
  transport: PluginFrameTransport
  /** Messages the host sent to the frame (for protocol assertions). */
  hostMessages: PluginHostToFrameMessage[]
  /** Force a crash report from the frame (simulates window.onerror). */
  crash(error: string): void
  readonly mounted: boolean
  readonly srcdoc: string | null
}

/**
 * A transport whose "frame" runs the delivered modules for real. Mirrors the
 * FRAME_RUNTIME state machine in `frame.ts`.
 */
export function createFakeFrameTransport(): FakeFrame {
  const hostMessages: PluginHostToFrameMessage[] = []
  let post: ((message: PluginFrameToHostMessage) => void) | null = null
  let descriptor: PluginDescriptor | null = null
  let mounted = false
  let srcdoc: string | null = null

  const storePending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >()
  let storeCallId = 0
  const hookName = `__xnetTestStoreCall_${++frameCounter}`

  const storeCall = (op: string, args: Record<string, unknown>): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = ++storeCallId
      storePending.set(id, { resolve, reject })
      post?.({ type: 'plugin:store-call', id, op, args: args ?? {} })
    })
  ;(globalThis as Record<string, unknown>)[hookName] = storeCall

  const apiSource = [
    'export function definePlugin(descriptor) { return descriptor }',
    `const call = globalThis.${hookName}`,
    'export const store = {',
    '  query: (args) => call("query", args),',
    '  get: (id) => call("get", { id }),',
    '  create: (args) => call("create", args),',
    '  update: (id, properties) => call("update", { id, properties }),',
    '  remove: (id) => call("delete", { id })',
    '}'
  ].join('\n')

  /**
   * The real frame runtime intercepts console.* globally (its realm is the
   * sandbox). In-process we can only safely intercept around awaited handler
   * calls — tests are single-threaded, so a try/finally swap is faithful.
   */
  const withConsoleCapture = async <T>(run: () => Promise<T>): Promise<T> => {
    const original = globalThis.console
    const capture = Object.create(original) as Console
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      capture[level] = (...args: unknown[]) => {
        post?.({
          type: 'plugin:log',
          level,
          message: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
        })
      }
    }
    globalThis.console = capture
    try {
      return await run()
    } finally {
      globalThis.console = original
    }
  }

  const handleHostMessage = async (msg: PluginHostToFrameMessage): Promise<void> => {
    hostMessages.push(msg)
    if (msg.type === 'plugin:store-result') {
      const entry = storePending.get(msg.id)
      if (!entry) return
      storePending.delete(msg.id)
      if (msg.ok) entry.resolve(msg.value)
      else entry.reject(new Error(msg.error ?? 'store call failed'))
      return
    }
    if (msg.type === 'plugin:load') {
      try {
        const entryUrl = linkGraph(msg.graph, apiSource)
        const mod = (await import(entryUrl)) as { default?: PluginDescriptor }
        descriptor = mod.default ?? {}
        post?.({
          type: 'plugin:registered',
          commands: Object.keys(descriptor.commands ?? {}),
          slashCommands: Object.keys(descriptor.slashCommands ?? {}),
          views: Object.keys(descriptor.views ?? {}),
          widgets: Object.keys(descriptor.widgets ?? {}),
          agentTools: Object.keys(descriptor.agentTools ?? {})
        })
      } catch (err) {
        post?.({
          type: 'plugin:crash',
          error: err instanceof Error ? err.message : String(err)
        })
      }
      return
    }
    if (msg.type === 'plugin:invoke') {
      const table =
        msg.kind === 'command'
          ? descriptor?.commands
          : msg.kind === 'slashCommand'
            ? descriptor?.slashCommands
            : descriptor?.agentTools
      try {
        const handler = table?.[msg.key]
        if (typeof handler !== 'function') throw new Error(`No handler: ${msg.kind}/${msg.key}`)
        const value = await withConsoleCapture(async () => handler(msg.args ?? {}))
        post?.({
          type: 'plugin:invoke-result',
          id: msg.id,
          ok: true,
          value: JSON.parse(JSON.stringify(value ?? null))
        })
      } catch (err) {
        post?.({
          type: 'plugin:invoke-result',
          id: msg.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        })
      }
      return
    }
    if (msg.type === 'plugin:render-view') {
      try {
        const renderer = descriptor?.views?.[msg.viewType] ?? descriptor?.widgets?.[msg.viewType]
        if (typeof renderer !== 'function') throw new Error(`No view: ${msg.viewType}`)
        const tree = await withConsoleCapture(async () => renderer(msg.props ?? {}))
        post?.({
          type: 'plugin:view-tree',
          id: msg.id,
          ok: true,
          tree: JSON.parse(JSON.stringify(tree ?? null))
        })
      } catch (err) {
        post?.({
          type: 'plugin:view-tree',
          id: msg.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    }
  }

  return {
    transport: {
      mountFrame(doc, onMessage) {
        mounted = true
        srcdoc = doc
        post = onMessage
        // The real frame posts plugin:ready after the port handshake.
        queueMicrotask(() => post?.({ type: 'plugin:ready' }))
        return {
          send: (message) => {
            void handleHostMessage(message)
          },
          dispose: () => {
            mounted = false
            post = null
            descriptor = null
            delete (globalThis as Record<string, unknown>)[hookName]
          }
        }
      }
    },
    hostMessages,
    crash(error) {
      post?.({ type: 'plugin:crash', error })
    },
    get mounted() {
      return mounted
    },
    get srcdoc() {
      return srcdoc
    }
  }
}

/** Await until a predicate holds (protocol round-trips are microtask-async). */
export async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 1000, intervalMs = 5 }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
