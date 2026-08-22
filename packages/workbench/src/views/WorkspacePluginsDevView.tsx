/**
 * Workspace Plugins dev surface (explorations 0331 → 0455).
 *
 * The first app mount of the workspace-plugin runtime: lists `PluginSource`
 * nodes, activates one in the opaque-origin iframe host, and keeps it running
 * through `createWorkspacePluginHotReloader` — edit the source node and the
 * frame rebuilds and swaps; a crash auto-disables with the last good hash
 * pinned. Until this view existed, the entire 0331 runtime (host, builder,
 * store RPC, watcher — 7 test files) had no caller in any app.
 *
 * Deliberate limits of this rung: plugin views/widgets register their
 * contributions but render as placeholders here (the SafeNode renderer is the
 * dashboard host's job), and without an injected transpiler a TypeScript
 * entry reports its build error in the event log — plain-JS entries run.
 */

import type { NodeStore } from '@xnetjs/data'
import type {
  HotReloadEvent,
  PluginFrameToHostMessage,
  PluginFrameTransport,
  PluginSourceNode,
  WorkspacePluginHostDeps,
  WorkspacePluginHotReloader
} from '@xnetjs/plugins'
import {
  createPluginSourceWatcher,
  createWorkspacePluginHotReloader,
  PLUGIN_FRAME_SANDBOX,
  readPluginSourceNode
} from '@xnetjs/plugins'
import { usePluginRegistryOptional } from '@xnetjs/react'
import { useNodeStore } from '@xnetjs/react/internal'
import { Play, Square } from 'lucide-react'
import { createElement, useCallback, useEffect, useRef, useState } from 'react'

const PLUGIN_SOURCE_SCHEMA_IRI = 'xnet://xnet.fyi/PluginSource@1.0.0'

/** Mount the sandbox frame as a real DOM iframe (the production transport). */
function createDomFrameTransport(container: HTMLElement): PluginFrameTransport {
  return {
    mountFrame(srcdoc, onMessage) {
      const iframe = document.createElement('iframe')
      iframe.setAttribute('sandbox', PLUGIN_FRAME_SANDBOX)
      iframe.style.width = '100%'
      iframe.style.height = '160px'
      iframe.style.border = '0'
      const channel = new MessageChannel()
      channel.port1.onmessage = (event) => onMessage(event.data as PluginFrameToHostMessage)
      iframe.addEventListener('load', () => {
        iframe.contentWindow?.postMessage({ type: 'plugin:connect' }, '*', [channel.port2])
      })
      iframe.srcdoc = srcdoc
      container.appendChild(iframe)
      return {
        send: (message) => channel.port1.postMessage(message),
        dispose: () => {
          channel.port1.close()
          iframe.remove()
        }
      }
    }
  }
}

/** The store shapes the host and watcher need, over the app NodeStore. */
function storeAdapters(store: NodeStore) {
  type ListOptions = Parameters<NodeStore['list']>[0]
  type CreateOptions = Parameters<NodeStore['create']>[0]
  return {
    pluginStore: {
      list: (query: { schemaId?: string; limit?: number; offset?: number }) =>
        store.list(query as ListOptions),
      get: (id: string) => store.get(id),
      create: (options: { schemaId: string; properties: Record<string, unknown> }) =>
        store.create(options as CreateOptions),
      update: (id: string, properties: Record<string, unknown>) => store.update(id, { properties }),
      delete: (id: string) => store.delete(id)
    },
    watcherStore: {
      subscribeToNode: (nodeId: string, listener: () => void) =>
        store.subscribe((event) => {
          const changed = (event as { change?: { payload?: { nodeId?: string } } }).change?.payload
            ?.nodeId
          if (changed === nodeId) listener()
        })
    }
  }
}

type LogLine = { at: number; text: string }

export function WorkspacePluginsDevView() {
  const { store } = useNodeStore()
  const registry = usePluginRegistryOptional()
  const frameHostRef = useRef<HTMLDivElement | null>(null)
  const reloaderRef = useRef<WorkspacePluginHotReloader | null>(null)
  const [sources, setSources] = useState<PluginSourceNode[]>([])
  const [runningId, setRunningId] = useState<string | null>(null)
  const [log, setLog] = useState<LogLine[]>([])

  const appendLog = useCallback((text: string) => {
    setLog((prev) => [...prev.slice(-49), { at: Date.now(), text }])
  }, [])

  // Live source list.
  useEffect(() => {
    if (!store) return
    let disposed = false
    const refresh = async () => {
      const nodes = await store.list({ schemaId: PLUGIN_SOURCE_SCHEMA_IRI })
      if (!disposed) setSources(nodes.map((node) => readPluginSourceNode(node)))
    }
    void refresh()
    const unsubscribe = store.subscribe(() => void refresh())
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [store])

  const stop = useCallback(() => {
    reloaderRef.current?.stop()
    reloaderRef.current = null
    setRunningId(null)
  }, [])

  // The reloader outlives renders but never this view.
  useEffect(() => () => stop(), [stop])

  const run = useCallback(
    async (source: PluginSourceNode) => {
      if (!store || !registry || !frameHostRef.current) return
      stop()
      const { pluginStore, watcherStore } = storeAdapters(store)
      const deps: WorkspacePluginHostDeps = {
        contributions: registry.getContributions(),
        store: pluginStore,
        transport: createDomFrameTransport(frameHostRef.current),
        provenance: 'authored',
        // Dev rung: follow the live source; pin-and-consent is install's job.
        hashPolicy: 'follow-source',
        onAutoDisable: (info) =>
          appendLog(
            `crashed and auto-disabled (${info.error}); last good ${info.lastGoodHash.slice(0, 8)}`
          ),
        createViewComponent: ({ viewType }) =>
          (() =>
            createElement(
              'div',
              { className: 'p-2 text-xs text-ink-3' },
              `Sandboxed view ${viewType} is registered; rendering hosts wire SafeNode themselves.`
            )) as never
      }
      const reloader = createWorkspacePluginHotReloader({
        watcher: createPluginSourceWatcher({ store: watcherStore }),
        readSource: async (nodeId) => {
          const node = await store.get(nodeId)
          return node ? readPluginSourceNode(node) : null
        },
        deps,
        onEvent: (event: HotReloadEvent) =>
          appendLog(`${event.kind}${event.error ? `: ${event.error}` : ''}`)
      })
      reloaderRef.current = reloader
      try {
        await reloader.start(source)
        setRunningId(source.id)
        appendLog(`running ${source.name} (${source.id})`)
      } catch (error) {
        appendLog(`activation failed: ${error instanceof Error ? error.message : String(error)}`)
        reloaderRef.current = null
      }
    },
    [store, registry, stop, appendLog]
  )

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3 text-sm">
      <div>
        <h3 className="font-medium text-ink-1">Workspace plugins</h3>
        <p className="text-xs text-ink-3">
          Sandboxed plugins built from PluginSource nodes — edits hot-reload, crashes roll back.
        </p>
      </div>

      {sources.length === 0 ? (
        <p className="text-xs text-ink-3">
          No PluginSource nodes yet. Ask your connected agent to run <code>plugin_scaffold</code>.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex items-center justify-between rounded border border-hairline px-2 py-1.5"
            >
              <span className="truncate text-ink-1">{source.name}</span>
              {runningId === source.id ? (
                <button
                  className="flex items-center gap-1 text-xs text-ink-2 hover:text-ink-1"
                  onClick={stop}
                >
                  <Square size={12} /> Stop
                </button>
              ) : (
                <button
                  className="flex items-center gap-1 text-xs text-ink-2 hover:text-ink-1"
                  onClick={() => void run(source)}
                >
                  <Play size={12} /> Run
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div ref={frameHostRef} className="min-h-0" />

      {log.length > 0 && (
        <div className="rounded border border-hairline bg-surface-2 p-2 font-mono text-[11px] leading-relaxed text-ink-2">
          {log.map((line) => (
            <div key={line.at + line.text}>{line.text}</div>
          ))}
        </div>
      )}
    </div>
  )
}
