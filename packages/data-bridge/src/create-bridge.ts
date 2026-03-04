/**
 * Factory functions for creating DataBridge instances
 *
 * Provides platform-aware bridge creation with automatic detection
 * of Web Worker support and appropriate fallbacks.
 */

import type { DataBridge, DataBridgeConfig } from './types'
import type { NodeStore } from '@xnetjs/data'
import { MainThreadBridge } from './main-thread-bridge'
import { WorkerBridge } from './worker-bridge'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateBridgeOptions {
  /**
   * NodeStore instance (required for MainThreadBridge fallback)
   */
  nodeStore: NodeStore

  /**
   * Configuration for the bridge
   */
  config: DataBridgeConfig

  /**
   * URL to the data worker script.
   * If not provided, MainThreadBridge will be used.
   *
   * In Vite, use import.meta.url to get the worker URL:
   * ```ts
   * // Option 1: Use the package's built worker
   * const workerUrl = new URL('@xnetjs/data-bridge/worker', import.meta.url)
   *
   * // Option 2: Use Vite's ?worker&url import (bundles into your build)
   * import workerUrl from '@xnetjs/data-bridge/dist/worker/data-worker.js?worker&url'
   * ```
   *
   * Note: Vite handles Web Worker bundling automatically. No additional
   * configuration is needed - just pass the URL to WorkerBridge.
   */
  workerUrl?: URL | string

  /**
   * Force a specific bridge type.
   * - 'worker': Force WorkerBridge (fails if workers not supported)
   * - 'main-thread': Force MainThreadBridge
   * - 'auto': Auto-detect (default)
   */
  mode?: 'worker' | 'main-thread' | 'auto'
}

// ─── Worker Support Detection ────────────────────────────────────────────────

/**
 * Check if Web Workers are supported in the current environment.
 */
export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined'
}

/**
 * Check if we're in a Node.js environment (e.g., SSR, tests).
 */
export function isNodeEnvironment(): boolean {
  return typeof process !== 'undefined' && process.versions?.node !== undefined
}

// ─── Factory Functions ───────────────────────────────────────────────────────

/**
 * Create a DataBridge with automatic platform detection.
 *
 * @example
 * ```ts
 * // In a web app with Vite
 * const bridge = await createDataBridge({
 *   nodeStore,
 *   config: { authorDID, signingKey },
 *   workerUrl: new URL('@xnetjs/data-bridge/worker', import.meta.url)
 * })
 *
 * // In tests or when workers aren't needed
 * const bridge = await createDataBridge({
 *   nodeStore,
 *   config: { authorDID, signingKey },
 *   mode: 'main-thread'
 * })
 * ```
 */
export async function createDataBridge(options: CreateBridgeOptions): Promise<DataBridge> {
  const { nodeStore, config, workerUrl, mode = 'auto' } = options

  // Determine which bridge to use
  const useWorker =
    mode === 'worker' ||
    (mode === 'auto' && workerUrl && isWorkerSupported() && !isNodeEnvironment())

  if (useWorker) {
    if (!workerUrl) {
      throw new Error('workerUrl is required when mode is "worker"')
    }
    if (!isWorkerSupported()) {
      throw new Error('Web Workers are not supported in this environment')
    }

    const bridge = new WorkerBridge(workerUrl)
    await bridge.initialize(config)
    return bridge
  }

  // Fall back to MainThreadBridge
  return new MainThreadBridge(nodeStore)
}

/**
 * Create a MainThreadBridge directly.
 * Use this when you don't need off-main-thread support.
 */
export function createMainThreadBridgeSync(nodeStore: NodeStore): MainThreadBridge {
  return new MainThreadBridge(nodeStore)
}

/**
 * Create a WorkerBridge directly.
 * The bridge must be initialized before use.
 *
 * @example
 * ```ts
 * const bridge = createWorkerBridgeSync(workerUrl)
 * await bridge.initialize(config)
 * ```
 */
export function createWorkerBridgeSync(workerUrl: URL | string): WorkerBridge {
  return new WorkerBridge(workerUrl)
}
