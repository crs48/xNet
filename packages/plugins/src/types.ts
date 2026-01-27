/**
 * Core types for the plugin system
 */

import type { SchemaIRI } from '@xnet/data'

// ─── Disposable ────────────────────────────────────────────────────────────

/**
 * A resource that can be disposed/cleaned up
 */
export interface Disposable {
  dispose(): void
}

// ─── Platform ──────────────────────────────────────────────────────────────

export type Platform = 'web' | 'electron' | 'mobile'

// ─── Permissions ───────────────────────────────────────────────────────────

export interface PluginPermissions {
  schemas?: {
    read?: SchemaIRI[] | '*'
    write?: SchemaIRI[] | '*'
    create?: SchemaIRI[]
  }
  capabilities?: {
    /** Network access: true for all, or array of allowed domains */
    network?: boolean | string[]
    /** Storage scope: 'local' (plugin only) or 'shared' (visible to other plugins) */
    storage?: 'local' | 'shared'
    /** Clipboard access */
    clipboard?: boolean
    /** System notifications */
    notifications?: boolean
    /** Spawn child processes (Electron only) */
    processes?: boolean
  }
}

// ─── Platform Capabilities ─────────────────────────────────────────────────

export interface PlatformCapabilities {
  platform: Platform
  features: {
    views: boolean
    editorExtensions: boolean
    slashCommands: boolean
    services: boolean
    processes: boolean
    localAPI: boolean
    filesystem: boolean
    clipboard: boolean
    notifications: boolean
    p2pSync: boolean
  }
}

export function getPlatformCapabilities(platform: Platform): PlatformCapabilities {
  return {
    platform,
    features: {
      views: true,
      editorExtensions: platform !== 'mobile',
      slashCommands: platform !== 'mobile',
      services: platform === 'electron',
      processes: platform === 'electron',
      localAPI: platform === 'electron',
      filesystem: platform === 'electron',
      clipboard: platform !== 'mobile',
      notifications: true,
      p2pSync: true
    }
  }
}

// ─── Extension Storage ─────────────────────────────────────────────────────

export interface ExtensionStorage {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
  delete(key: string): void
  keys(): string[]
}

export function createExtensionStorage(): ExtensionStorage {
  const storage = new Map<string, unknown>()

  return {
    get<T>(key: string): T | undefined {
      return storage.get(key) as T | undefined
    },
    set<T>(key: string, value: T): void {
      storage.set(key, value)
    },
    delete(key: string): void {
      storage.delete(key)
    },
    keys(): string[] {
      return [...storage.keys()]
    }
  }
}
