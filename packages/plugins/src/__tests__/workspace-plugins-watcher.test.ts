/**
 * SourceWatcher + hot reloader tests (0331 — increment 4a).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginSourceNode } from '../schemas/plugin-source'
import { ContributionRegistry } from '../contributions'
import type { WorkspacePluginHostDeps } from '../workspace-plugins/host'
import {
  SOURCE_SETTLE_DEBOUNCE_MS,
  createPluginSourceWatcher,
  createWorkspacePluginHotReloader,
  type HotReloadEvent
} from '../workspace-plugins/watcher'
import { createFakeFrameTransport, waitFor } from './workspace-plugin-test-frame'

function fakeSubscribable() {
  const listeners = new Map<string, Set<() => void>>()
  return {
    subscribeToNode(nodeId: string, listener: () => void) {
      const set = listeners.get(nodeId) ?? new Set()
      set.add(listener)
      listeners.set(nodeId, set)
      return () => set.delete(listener)
    },
    fire(nodeId: string) {
      for (const listener of listeners.get(nodeId) ?? []) listener()
    },
    count(nodeId: string) {
      return listeners.get(nodeId)?.size ?? 0
    }
  }
}

describe('createPluginSourceWatcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces a burst of changes into one settle (250ms default)', () => {
    const store = fakeSubscribable()
    const watcher = createPluginSourceWatcher({ store })
    const settled = vi.fn()
    watcher.watch('n1', settled)

    store.fire('n1')
    vi.advanceTimersByTime(100)
    store.fire('n1')
    vi.advanceTimersByTime(249)
    expect(settled).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(settled).toHaveBeenCalledTimes(1)
    expect(SOURCE_SETTLE_DEBOUNCE_MS).toBe(250)

    // A later, separate burst settles again.
    store.fire('n1')
    vi.advanceTimersByTime(250)
    expect(settled).toHaveBeenCalledTimes(2)
  })

  it('stops on unwatch and dispose', () => {
    const store = fakeSubscribable()
    const watcher = createPluginSourceWatcher({ store, debounceMs: 10 })
    const settled = vi.fn()
    const stop = watcher.watch('n1', settled)
    stop()
    store.fire('n1')
    vi.advanceTimersByTime(20)
    expect(settled).not.toHaveBeenCalled()
    expect(store.count('n1')).toBe(0)

    watcher.watch('n2', settled)
    watcher.dispose()
    expect(store.count('n2')).toBe(0)
  })
})

// ─── Hot reloader (real timers; the loop is microtask-async) ───────────────

const source = (code: string, id = 'src-hot'): PluginSourceNode => ({
  id,
  name: 'Hot',
  entry: 'index.js',
  files: {
    'index.js': [
      "import { definePlugin } from 'xnet:plugin-api'",
      'export default definePlugin({',
      `  commands: { 'com.test.hot.run': async () => ${code} }`,
      '})'
    ].join('\n')
  },
  manifest: {
    id: 'com.test.hot',
    name: 'Hot',
    version: '1.0.0',
    contributes: { commands: [{ id: 'com.test.hot.run', name: 'Run' }] }
  }
})

function reloaderHarness(initial: PluginSourceNode) {
  const store = fakeSubscribable()
  const contributions = new ContributionRegistry()
  let current = initial
  const events: HotReloadEvent[] = []
  let frame = createFakeFrameTransport()
  const deps: WorkspacePluginHostDeps = {
    contributions,
    store: {
      list: async () => [],
      get: async () => null,
      create: async () => ({ id: 'x' }),
      update: async () => {},
      delete: async () => {}
    },
    // Each activation mounts a fresh frame.
    transport: {
      mountFrame: (srcdoc, onMessage) => {
        frame = createFakeFrameTransport()
        return frame.transport.mountFrame(srcdoc, onMessage)
      }
    },
    provenance: 'authored'
  }
  const reloader = createWorkspacePluginHotReloader({
    watcher: createPluginSourceWatcher({ store, debounceMs: 5 }),
    readSource: async () => current,
    deps,
    onEvent: (event) => events.push(event)
  })
  return {
    store,
    reloader,
    events,
    setSource: (next: PluginSourceNode) => {
      current = next
    },
    crashFrame: (error: string) => frame.crash(error)
  }
}

describe('createWorkspacePluginHotReloader (4a)', () => {
  it('rebuilds and swaps on a settled source change', async () => {
    const h = reloaderHarness(source("'v1'"))
    const first = await h.reloader.start(source("'v1'"))
    await waitFor(() => first.session.registered !== null)
    expect(await first.session.invoke('command', 'com.test.hot.run')).toBe('v1')
    const firstHash = first.contentHash

    h.setSource(source("'v2'"))
    h.store.fire('src-hot')
    await waitFor(() => h.events.some((e) => e.kind === 'reloaded' && e.runningHash !== firstHash))

    const next = h.reloader.current
    expect(next).not.toBeNull()
    await waitFor(() => next?.session.registered !== null)
    expect(await next?.session.invoke('command', 'com.test.hot.run')).toBe('v2')
    expect(first.status).toBe('disabled')
    expect(h.reloader.lastGoodHash).toBe(next?.contentHash)
    h.reloader.stop()
  })

  it('keeps the old version running when the new source does not build', async () => {
    const h = reloaderHarness(source("'v1'"))
    const first = await h.reloader.start(source("'v1'"))
    await waitFor(() => first.session.registered !== null)

    h.setSource({
      ...source("'x'"),
      files: { 'index.js': "import gone from './missing'" }
    })
    h.store.fire('src-hot')
    await waitFor(() => h.events.some((e) => e.kind === 'build-failed'))

    expect(h.reloader.current).toBe(first)
    expect(first.status).toBe('active')
    expect(await first.session.invoke('command', 'com.test.hot.run')).toBe('v1')
    h.reloader.stop()
  })

  it('crash → auto-disable, last good hash pinned (the 0190 remediation rule)', async () => {
    const h = reloaderHarness(source("'v1'"))
    const first = await h.reloader.start(source("'v1'"))
    await waitFor(() => first.session.registered !== null)
    const goodHash = first.contentHash

    h.crashFrame('ReferenceError: boom')
    await waitFor(() => h.events.some((e) => e.kind === 'crashed'))

    expect(h.reloader.current).toBeNull()
    expect(first.status).toBe('disabled')
    const crashEvent = h.events.find((e) => e.kind === 'crashed')
    expect(crashEvent?.runningHash).toBe(goodHash)
    expect(h.reloader.lastGoodHash).toBe(goodHash)
    h.reloader.stop()
  })
})
