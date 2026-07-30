/**
 * Workspace-plugin sandbox frame (exploration 0331).
 *
 * Builds the `srcdoc` for the opaque-origin iframe a workspace plugin runs in.
 * The isolation posture, layered:
 *
 *  1. `sandbox="allow-scripts"` and NEVER `allow-same-origin` — the frame runs
 *     on an opaque origin with no access to host cookies/storage/DOM (the same
 *     rung App Labs and `IframeWidgetHost` use).
 *  2. A frame CSP with `script-src 'unsafe-inline' blob:` — module code links
 *     from blob: URLs the loader mints from MessagePort-delivered source; the
 *     frame can never fetch script from the network. `connect-src` derives
 *     from the manifest's declared `network` allowlist (default `'none'`),
 *     bounding exfiltration in a way Patchwork's isolation doc punts on.
 *  3. The host CSP is untouched: plugin code NEVER enters the host realm —
 *     the host serves source over the port and receives JSON back.
 *
 * The loader implements the es-module-shims-style source hook by hand: it
 * receives the whole built graph, rewrites import specifiers bottom-up to
 * blob: URLs (vendors first, then plugin modules in dependency order), then
 * `import()`s the entry — all inside the sandbox.
 */

import type { PluginPermissions } from '../types'

/** Sandbox token set for a workspace-plugin frame. NEVER allow-same-origin. */
export const PLUGIN_FRAME_SANDBOX = 'allow-scripts'

/**
 * Derive the frame CSP `connect-src` from a manifest's declared network
 * capability. `true` (all hosts) is deliberately NOT honored with `*` — a
 * workspace plugin must enumerate hosts to get egress.
 */
export function frameConnectSrc(permissions: PluginPermissions | undefined): string {
  const network = permissions?.capabilities?.network
  if (!Array.isArray(network) || network.length === 0) return "'none'"
  const sources = network
    .filter((host) => typeof host === 'string' && /^[a-z0-9.-]+$/i.test(host))
    .map((host) => `https://${host}`)
  // Hosts that fail the shape check are dropped; an all-invalid list must
  // close the frame, never emit an empty (permissive) directive.
  return sources.length > 0 ? sources.join(' ') : "'none'"
}

/** The frame document's CSP. Everything defaults closed. */
export function framePluginCsp(permissions: PluginPermissions | undefined): string {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' blob:",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    `connect-src ${frameConnectSrc(permissions)}`
  ].join('; ')
}

/**
 * The loader + plugin-api runtime that boots inside the frame. Kept as a
 * template so `buildPluginFrameSrcdoc` can inject nothing but static strings.
 */
const FRAME_RUNTIME = `
'use strict'
let port = null
const pending = new Map()
let callId = 0
let descriptor = null

const post = (msg) => { if (port) port.postMessage(msg) }

for (const level of ['log', 'info', 'warn', 'error']) {
  const orig = console[level].bind(console)
  console[level] = (...args) => {
    orig(...args)
    try {
      post({ type: 'plugin:log', level, message: args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') })
    } catch { post({ type: 'plugin:log', level, message: String(args) }) }
  }
}
window.addEventListener('error', (event) => {
  post({ type: 'plugin:crash', error: String(event.message || event.error) })
})
window.addEventListener('unhandledrejection', (event) => {
  post({ type: 'plugin:crash', error: String(event.reason && event.reason.message || event.reason) })
})

const storeCall = (op, args) => new Promise((resolve, reject) => {
  const id = ++callId
  pending.set(id, { resolve, reject })
  post({ type: 'plugin:store-call', id, op, args: args || {} })
})

// The module the pinned specifier 'xnet:plugin-api' resolves to.
const PLUGIN_API_SOURCE = [
  'export function definePlugin(descriptor) { return descriptor }',
  'const call = globalThis.__xnetStoreCall',
  'export const store = {',
  '  query: (args) => call("query", args),',
  '  get: (id) => call("get", { id }),',
  '  create: (args) => call("create", args),',
  '  update: (id, properties) => call("update", { id, properties }),',
  '  remove: (id) => call("delete", { id })',
  '}'
].join('\\n')
globalThis.__xnetStoreCall = storeCall

function linkGraph(graph) {
  const urls = new Map()
  urls.set('xnet:plugin-api', URL.createObjectURL(new Blob([PLUGIN_API_SOURCE], { type: 'text/javascript' })))
  for (const [specifier, source] of Object.entries(graph.vendors || {})) {
    urls.set(specifier, URL.createObjectURL(new Blob([source], { type: 'text/javascript' })))
  }
  const modules = new Map(graph.modules.map((m) => [m.path, m]))
  const linking = new Set()
  const linkModule = (path) => {
    if (urls.has(path)) return urls.get(path)
    if (linking.has(path)) throw new Error('Import cycle at ' + path)
    linking.add(path)
    const mod = modules.get(path)
    if (!mod) throw new Error('Module not in graph: ' + path)
    let code = mod.code
    for (const [specifier, resolved] of Object.entries(mod.imports)) {
      const url = linkModule(resolved)
      // Rewrite every quoted occurrence of the specifier used in import position.
      code = code.replaceAll("'" + specifier + "'", JSON.stringify(url))
      code = code.replaceAll('"' + specifier + '"', JSON.stringify(url))
    }
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    urls.set(path, url)
    linking.delete(path)
    return url
  }
  return linkModule(graph.entry)
}

async function handleHostMessage(msg) {
  if (msg.type === 'plugin:store-result') {
    const entry = pending.get(msg.id)
    if (!entry) return
    pending.delete(msg.id)
    if (msg.ok) entry.resolve(msg.value)
    else entry.reject(new Error(msg.error || 'store call failed'))
    return
  }
  if (msg.type === 'plugin:load') {
    try {
      const entryUrl = linkGraph(msg.graph)
      const mod = await import(entryUrl)
      descriptor = mod.default || {}
      post({
        type: 'plugin:registered',
        commands: Object.keys(descriptor.commands || {}),
        slashCommands: Object.keys(descriptor.slashCommands || {}),
        views: Object.keys(descriptor.views || {}),
        widgets: Object.keys(descriptor.widgets || {}),
        agentTools: Object.keys(descriptor.agentTools || {})
      })
    } catch (err) {
      post({ type: 'plugin:crash', error: String(err && err.message || err) })
    }
    return
  }
  if (msg.type === 'plugin:invoke') {
    const table = msg.kind === 'command' ? 'commands' : msg.kind === 'slashCommand' ? 'slashCommands' : 'agentTools'
    try {
      const handler = descriptor && descriptor[table] && descriptor[table][msg.key]
      if (typeof handler !== 'function') throw new Error('No handler: ' + msg.kind + '/' + msg.key)
      const value = await handler(msg.args || {})
      let safe; try { safe = JSON.parse(JSON.stringify(value ?? null)) } catch { safe = String(value) }
      post({ type: 'plugin:invoke-result', id: msg.id, ok: true, value: safe })
    } catch (err) {
      post({ type: 'plugin:invoke-result', id: msg.id, ok: false, error: String(err && err.message || err) })
    }
    return
  }
  if (msg.type === 'plugin:render-view') {
    try {
      const renderer = descriptor && ((descriptor.views && descriptor.views[msg.viewType]) || (descriptor.widgets && descriptor.widgets[msg.viewType]))
      if (typeof renderer !== 'function') throw new Error('No view: ' + msg.viewType)
      const tree = await renderer(msg.props || {})
      post({ type: 'plugin:view-tree', id: msg.id, ok: true, tree: JSON.parse(JSON.stringify(tree ?? null)) })
    } catch (err) {
      post({ type: 'plugin:view-tree', id: msg.id, ok: false, error: String(err && err.message || err) })
    }
  }
}

window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'plugin:connect' && event.ports && event.ports[0]) {
    port = event.ports[0]
    port.onmessage = (e) => { void handleHostMessage(e.data) }
    post({ type: 'plugin:ready' })
  }
})
`

/**
 * Build the sandbox frame document for a workspace plugin. Pure string
 * assembly — the host mounts it with `sandbox={PLUGIN_FRAME_SANDBOX}` and
 * hands the frame one end of a MessageChannel via `plugin:connect`.
 */
export function buildPluginFrameSrcdoc(permissions: PluginPermissions | undefined): string {
  const csp = framePluginCsp(permissions)
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body>
<script type="module">${FRAME_RUNTIME}</script>
</body></html>`
}
