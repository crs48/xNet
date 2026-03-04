# 04: Plugin System

> Sandboxed third-party code execution with permission-based API access

**Package:** `@xnetjs/plugins`
**Dependencies:** `@xnetjs/modules`, `@xnetjs/data`
**Estimated Time:** 3 weeks

> **Architecture Update (Jan 2026):**
>
> - Plugins access data via NodeStore API
> - Permissions: `read:nodes`, `write:nodes` instead of `read:databases`

## Goals

- Secure sandbox for untrusted code
- Permission-based API access
- Plugin marketplace with discovery
- Developer SDK and documentation
- Hot-reload during development

## Core Types

```typescript
// packages/plugins/src/types.ts

export type PluginId = `plugin:${string}`
export type PluginVersion = `${number}.${number}.${number}`

// Plugin Manifest (plugin.json)

export interface PluginManifest {
  id: PluginId
  name: string
  version: PluginVersion
  description: string

  // Author info
  author: {
    name: string
    email?: string
    url?: string
  }

  // Requirements
  platform: {
    minVersion: string
    maxVersion?: string
  }

  // Permissions
  permissions: PluginPermission[]

  // Entry points
  main: string // Main JS bundle
  styles?: string // Optional CSS bundle
  worker?: string // Optional Web Worker

  // UI Extensions
  ui?: {
    widgets?: WidgetExtension[]
    actions?: ActionExtension[]
    panels?: PanelExtension[]
    commands?: CommandExtension[]
  }

  // Hooks
  hooks?: {
    onInstall?: string
    onUninstall?: string
    onActivate?: string
    onDeactivate?: string
  }

  // Settings
  settings?: PluginSetting[]

  // Assets
  assets?: string[] // Static assets to include

  // Marketplace
  marketplace?: {
    category: PluginCategory
    tags: string[]
    screenshots: string[]
    pricing?: 'free' | 'paid' | 'freemium'
  }
}

// Permissions

export type PluginPermission =
  | 'read:databases' // Read any database
  | 'write:databases' // Write to any database
  | 'read:records' // Read specific records
  | 'write:records' // Write specific records
  | 'read:settings' // Read plugin settings
  | 'write:settings' // Write plugin settings
  | 'notifications' // Show notifications
  | 'clipboard' // Access clipboard
  | 'network' // Make network requests
  | 'storage' // Local storage access
  | 'background' // Run in background
  | `database:${string}` // Specific database access
  | `module:${string}` // Specific module access

export interface PermissionRequest {
  permission: PluginPermission
  reason: string
  optional: boolean
}

// Extensions

export interface WidgetExtension {
  id: string
  name: string
  description: string
  component: string // Component export name
  defaultConfig: Record<string, unknown>
  configSchema: ConfigSchema
}

export interface ActionExtension {
  id: string
  name: string
  icon?: string
  context: ('record' | 'database' | 'global')[]
  handler: string // Handler function name
}

export interface PanelExtension {
  id: string
  name: string
  icon?: string
  location: 'sidebar' | 'bottom' | 'modal'
  component: string
}

export interface CommandExtension {
  id: string
  name: string
  description: string
  shortcut?: string
  handler: string
}

// Settings

export interface PluginSetting {
  id: string
  label: string
  description?: string
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect'
  default: unknown
  options?: { label: string; value: unknown }[]
  validation?: SettingValidation
}

// Categories

export type PluginCategory =
  | 'productivity'
  | 'integration'
  | 'visualization'
  | 'automation'
  | 'communication'
  | 'developer'
  | 'analytics'
  | 'other'

// Plugin State

export interface PluginState {
  id: PluginId
  manifest: PluginManifest
  status: 'installed' | 'active' | 'disabled' | 'error'
  installedAt: number
  updatedAt: number
  error?: string
  settings: Record<string, unknown>
}
```

## Sandbox Architecture

```typescript
// packages/plugins/src/sandbox/PluginSandbox.ts

export class PluginSandbox {
  private iframe: HTMLIFrameElement | null = null
  private messageHandlers = new Map<string, (data: unknown) => void>()
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
    }
  >()

  constructor(
    private pluginId: PluginId,
    private permissions: PluginPermission[],
    private bridge: PluginBridge
  ) {}

  // Initialize sandbox
  async initialize(): Promise<void> {
    // Create sandboxed iframe
    this.iframe = document.createElement('iframe')
    this.iframe.sandbox.add(
      'allow-scripts',
      'allow-same-origin' // Needed for postMessage
    )

    // Don't allow:
    // - allow-top-navigation
    // - allow-forms (direct submission)
    // - allow-popups
    // - allow-pointer-lock
    // - allow-modals

    this.iframe.style.display = 'none'
    this.iframe.src = this.createSandboxUrl()

    // Set up message handling
    window.addEventListener('message', this.handleMessage)

    // Add to DOM
    document.body.appendChild(this.iframe)

    // Wait for ready signal
    await this.waitForReady()
  }

  // Execute code in sandbox
  async execute(code: string): Promise<unknown> {
    return this.sendRequest('execute', { code })
  }

  // Call plugin function
  async call(functionName: string, args: unknown[]): Promise<unknown> {
    return this.sendRequest('call', { functionName, args })
  }

  // Destroy sandbox
  destroy(): void {
    window.removeEventListener('message', this.handleMessage)

    if (this.iframe) {
      this.iframe.remove()
      this.iframe = null
    }

    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('Sandbox destroyed'))
    })
    this.pendingRequests.clear()
  }

  private createSandboxUrl(): string {
    // Create blob URL with sandbox runtime
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script>
            ${this.getSandboxRuntime()}
          </script>
        </head>
        <body></body>
      </html>
    `
    const blob = new Blob([html], { type: 'text/html' })
    return URL.createObjectURL(blob)
  }

  private getSandboxRuntime(): string {
    return `
      (function() {
        'use strict';

        const permissions = ${JSON.stringify(this.permissions)};
        const pluginId = ${JSON.stringify(this.pluginId)};

        // Restricted globals
        const restrictedGlobals = [
          'fetch', 'XMLHttpRequest', 'WebSocket',
          'localStorage', 'sessionStorage', 'indexedDB',
          'open', 'close', 'print'
        ];

        // Save allowed globals before restriction
        const originalFetch = window.fetch;

        // Restrict dangerous APIs
        for (const global of restrictedGlobals) {
          Object.defineProperty(window, global, {
            get() {
              throw new Error(\`Access to \${global} is restricted. Request 'network' permission.\`);
            },
            configurable: false
          });
        }

        // xNet API (provided to plugins)
        window.xnet = {
          // Database API
          databases: {
            async list() {
              return sendToHost('databases.list');
            },
            async get(id) {
              return sendToHost('databases.get', { id });
            },
            async query(databaseId, query) {
              return sendToHost('databases.query', { databaseId, query });
            },
            async createRecord(databaseId, data) {
              checkPermission('write:databases');
              return sendToHost('databases.createRecord', { databaseId, data });
            },
            async updateRecord(databaseId, recordId, data) {
              checkPermission('write:databases');
              return sendToHost('databases.updateRecord', { databaseId, recordId, data });
            },
            async deleteRecord(databaseId, recordId) {
              checkPermission('write:databases');
              return sendToHost('databases.deleteRecord', { databaseId, recordId });
            }
          },

          // UI API
          ui: {
            async showNotification(message, options) {
              checkPermission('notifications');
              return sendToHost('ui.showNotification', { message, options });
            },
            async showModal(config) {
              return sendToHost('ui.showModal', { config });
            },
            async showToast(message, type) {
              return sendToHost('ui.showToast', { message, type });
            }
          },

          // Settings API
          settings: {
            async get(key) {
              return sendToHost('settings.get', { key });
            },
            async set(key, value) {
              checkPermission('write:settings');
              return sendToHost('settings.set', { key, value });
            },
            async getAll() {
              return sendToHost('settings.getAll');
            }
          },

          // Storage API (plugin-local)
          storage: {
            async get(key) {
              checkPermission('storage');
              return sendToHost('storage.get', { key });
            },
            async set(key, value) {
              checkPermission('storage');
              return sendToHost('storage.set', { key, value });
            },
            async remove(key) {
              checkPermission('storage');
              return sendToHost('storage.remove', { key });
            }
          },

          // Network API (if permitted)
          network: {
            async fetch(url, options) {
              checkPermission('network');
              return sendToHost('network.fetch', { url, options });
            }
          },

          // Clipboard API
          clipboard: {
            async read() {
              checkPermission('clipboard');
              return sendToHost('clipboard.read');
            },
            async write(text) {
              checkPermission('clipboard');
              return sendToHost('clipboard.write', { text });
            }
          }
        };

        // Permission checker
        function checkPermission(required) {
          if (!permissions.includes(required)) {
            throw new Error(\`Permission denied: \${required}\`);
          }
        }

        // Communication with host
        let requestId = 0;
        const pendingRequests = new Map();

        function sendToHost(method, params) {
          return new Promise((resolve, reject) => {
            const id = ++requestId;
            pendingRequests.set(id, { resolve, reject });

            parent.postMessage({
              type: 'xnet-plugin-request',
              pluginId,
              id,
              method,
              params
            }, '*');
          });
        }

        // Handle responses from host
        window.addEventListener('message', (event) => {
          const { type, id, result, error } = event.data;

          if (type === 'xnet-plugin-response') {
            const pending = pendingRequests.get(id);
            if (pending) {
              pendingRequests.delete(id);
              if (error) {
                pending.reject(new Error(error));
              } else {
                pending.resolve(result);
              }
            }
          } else if (type === 'xnet-plugin-execute') {
            // Execute code sent from host
            try {
              const result = eval(event.data.code);
              parent.postMessage({
                type: 'xnet-plugin-execute-result',
                id: event.data.id,
                result
              }, '*');
            } catch (error) {
              parent.postMessage({
                type: 'xnet-plugin-execute-result',
                id: event.data.id,
                error: error.message
              }, '*');
            }
          } else if (type === 'xnet-plugin-call') {
            // Call a function
            try {
              const fn = window[event.data.functionName];
              if (typeof fn !== 'function') {
                throw new Error(\`Function not found: \${event.data.functionName}\`);
              }
              const result = fn(...event.data.args);
              Promise.resolve(result).then(r => {
                parent.postMessage({
                  type: 'xnet-plugin-call-result',
                  id: event.data.id,
                  result: r
                }, '*');
              }).catch(e => {
                parent.postMessage({
                  type: 'xnet-plugin-call-result',
                  id: event.data.id,
                  error: e.message
                }, '*');
              });
            } catch (error) {
              parent.postMessage({
                type: 'xnet-plugin-call-result',
                id: event.data.id,
                error: error.message
              }, '*');
            }
          }
        });

        // Signal ready
        parent.postMessage({ type: 'xnet-plugin-ready', pluginId }, '*');
      })();
    `
  }

  private handleMessage = (event: MessageEvent): void => {
    if (event.source !== this.iframe?.contentWindow) return

    const { type, id, result, error } = event.data

    if (type === 'xnet-plugin-ready') {
      // Sandbox is ready
      this.messageHandlers.get('ready')?.(null)
    } else if (type === 'xnet-plugin-request') {
      // API request from plugin
      this.handleApiRequest(event.data)
    } else if (type === 'xnet-plugin-execute-result' || type === 'xnet-plugin-call-result') {
      const pending = this.pendingRequests.get(id)
      if (pending) {
        this.pendingRequests.delete(id)
        if (error) {
          pending.reject(new Error(error))
        } else {
          pending.resolve(result)
        }
      }
    }
  }

  private async handleApiRequest(request: {
    id: number
    method: string
    params: unknown
  }): Promise<void> {
    try {
      const result = await this.bridge.handleRequest(
        this.pluginId,
        request.method,
        request.params,
        this.permissions
      )

      this.iframe?.contentWindow?.postMessage(
        {
          type: 'xnet-plugin-response',
          id: request.id,
          result
        },
        '*'
      )
    } catch (error) {
      this.iframe?.contentWindow?.postMessage(
        {
          type: 'xnet-plugin-response',
          id: request.id,
          error: error instanceof Error ? error.message : String(error)
        },
        '*'
      )
    }
  }

  private sendRequest(type: string, data: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random()}`
      this.pendingRequests.set(id, { resolve, reject })

      this.iframe?.contentWindow?.postMessage(
        {
          type: `xnet-plugin-${type}`,
          id,
          ...data
        },
        '*'
      )

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }
      }, 30000)
    })
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve) => {
      this.messageHandlers.set('ready', () => resolve())
    })
  }
}
```

## Plugin Bridge

```typescript
// packages/plugins/src/bridge/PluginBridge.ts

import { DatabaseManager } from '@xnetjs/database'

export class PluginBridge {
  constructor(
    private databaseManager: DatabaseManager,
    private notificationService: NotificationService,
    private pluginStorage: PluginStorage
  ) {}

  async handleRequest(
    pluginId: PluginId,
    method: string,
    params: unknown,
    permissions: PluginPermission[]
  ): Promise<unknown> {
    // Parse method path (e.g., 'databases.query')
    const [namespace, action] = method.split('.')

    switch (namespace) {
      case 'databases':
        return this.handleDatabaseRequest(action, params, permissions)
      case 'ui':
        return this.handleUiRequest(action, params, permissions)
      case 'settings':
        return this.handleSettingsRequest(pluginId, action, params, permissions)
      case 'storage':
        return this.handleStorageRequest(pluginId, action, params, permissions)
      case 'network':
        return this.handleNetworkRequest(action, params, permissions)
      case 'clipboard':
        return this.handleClipboardRequest(action, params, permissions)
      default:
        throw new Error(`Unknown API namespace: ${namespace}`)
    }
  }

  private async handleDatabaseRequest(
    action: string,
    params: unknown,
    permissions: PluginPermission[]
  ): Promise<unknown> {
    const p = params as Record<string, unknown>

    // Check read permission
    if (!permissions.includes('read:databases') && !permissions.includes('read:records')) {
      throw new Error('Permission denied: read:databases')
    }

    switch (action) {
      case 'list':
        return this.databaseManager.listDatabases()

      case 'get':
        return this.databaseManager.getDatabase(p.id as string)

      case 'query': {
        const db = await this.databaseManager.getDatabase(p.databaseId as string)
        return db
          .query()
          .filter(p.query as FilterGroup)
          .execute()
      }

      case 'createRecord': {
        if (!permissions.includes('write:databases') && !permissions.includes('write:records')) {
          throw new Error('Permission denied: write:databases')
        }
        const db = await this.databaseManager.getDatabase(p.databaseId as string)
        return db.createRecord(p.data as Record<string, unknown>)
      }

      case 'updateRecord': {
        if (!permissions.includes('write:databases') && !permissions.includes('write:records')) {
          throw new Error('Permission denied: write:databases')
        }
        const db = await this.databaseManager.getDatabase(p.databaseId as string)
        return db.updateRecord(p.recordId as string, p.data as Record<string, unknown>)
      }

      case 'deleteRecord': {
        if (!permissions.includes('write:databases') && !permissions.includes('write:records')) {
          throw new Error('Permission denied: write:databases')
        }
        const db = await this.databaseManager.getDatabase(p.databaseId as string)
        return db.deleteRecord(p.recordId as string)
      }

      default:
        throw new Error(`Unknown database action: ${action}`)
    }
  }

  private async handleUiRequest(
    action: string,
    params: unknown,
    permissions: PluginPermission[]
  ): Promise<unknown> {
    const p = params as Record<string, unknown>

    switch (action) {
      case 'showNotification':
        if (!permissions.includes('notifications')) {
          throw new Error('Permission denied: notifications')
        }
        return this.notificationService.show(p.message as string, p.options as NotificationOptions)

      case 'showModal':
        // Modals always allowed for plugin UI
        return this.notificationService.showModal(p.config as ModalConfig)

      case 'showToast':
        return this.notificationService.showToast(
          p.message as string,
          p.type as 'success' | 'error' | 'info'
        )

      default:
        throw new Error(`Unknown UI action: ${action}`)
    }
  }

  private async handleSettingsRequest(
    pluginId: PluginId,
    action: string,
    params: unknown,
    permissions: PluginPermission[]
  ): Promise<unknown> {
    const p = params as Record<string, unknown>

    switch (action) {
      case 'get':
        return this.pluginStorage.getSetting(pluginId, p.key as string)

      case 'set':
        if (!permissions.includes('write:settings')) {
          throw new Error('Permission denied: write:settings')
        }
        return this.pluginStorage.setSetting(pluginId, p.key as string, p.value)

      case 'getAll':
        return this.pluginStorage.getAllSettings(pluginId)

      default:
        throw new Error(`Unknown settings action: ${action}`)
    }
  }

  private async handleStorageRequest(
    pluginId: PluginId,
    action: string,
    params: unknown,
    permissions: PluginPermission[]
  ): Promise<unknown> {
    if (!permissions.includes('storage')) {
      throw new Error('Permission denied: storage')
    }

    const p = params as Record<string, unknown>

    switch (action) {
      case 'get':
        return this.pluginStorage.get(pluginId, p.key as string)
      case 'set':
        return this.pluginStorage.set(pluginId, p.key as string, p.value)
      case 'remove':
        return this.pluginStorage.remove(pluginId, p.key as string)
      default:
        throw new Error(`Unknown storage action: ${action}`)
    }
  }

  private async handleNetworkRequest(
    action: string,
    params: unknown,
    permissions: PluginPermission[]
  ): Promise<unknown> {
    if (!permissions.includes('network')) {
      throw new Error('Permission denied: network')
    }

    const p = params as Record<string, unknown>

    switch (action) {
      case 'fetch': {
        const url = p.url as string
        const options = p.options as RequestInit | undefined

        // Validate URL (block internal/localhost unless explicitly allowed)
        const parsedUrl = new URL(url)
        if (
          parsedUrl.hostname === 'localhost' ||
          parsedUrl.hostname === '127.0.0.1' ||
          parsedUrl.hostname.startsWith('192.168.') ||
          parsedUrl.hostname.startsWith('10.')
        ) {
          throw new Error('Access to local network is not allowed')
        }

        const response = await fetch(url, {
          ...options,
          // Force CORS mode
          mode: 'cors'
        })

        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: await response.text()
        }
      }

      default:
        throw new Error(`Unknown network action: ${action}`)
    }
  }

  private async handleClipboardRequest(
    action: string,
    params: unknown,
    permissions: PluginPermission[]
  ): Promise<unknown> {
    if (!permissions.includes('clipboard')) {
      throw new Error('Permission denied: clipboard')
    }

    const p = params as Record<string, unknown>

    switch (action) {
      case 'read':
        return navigator.clipboard.readText()
      case 'write':
        await navigator.clipboard.writeText(p.text as string)
        return true
      default:
        throw new Error(`Unknown clipboard action: ${action}`)
    }
  }
}
```

## Plugin Manager

```typescript
// packages/plugins/src/PluginManager.ts

import { PluginSandbox } from './sandbox/PluginSandbox'
import { PluginBridge } from './bridge/PluginBridge'

export class PluginManager {
  private plugins = new Map<PluginId, PluginState>()
  private sandboxes = new Map<PluginId, PluginSandbox>()
  private bridge: PluginBridge

  constructor(
    private databaseManager: DatabaseManager,
    private storage: PluginStorage
  ) {
    this.bridge = new PluginBridge(databaseManager, new NotificationService(), storage)
  }

  // Install plugin
  async install(manifest: PluginManifest, bundleUrl: string): Promise<PluginState> {
    // Validate manifest
    this.validateManifest(manifest)

    // Check platform compatibility
    if (!this.isCompatible(manifest.platform)) {
      throw new Error(`Plugin requires platform version ${manifest.platform.minVersion}`)
    }

    // Store plugin state
    const state: PluginState = {
      id: manifest.id,
      manifest,
      status: 'installed',
      installedAt: Date.now(),
      updatedAt: Date.now(),
      settings: this.getDefaultSettings(manifest)
    }

    // Save to storage
    await this.storage.savePlugin(state)

    // Load bundle
    await this.loadBundle(manifest.id, bundleUrl)

    this.plugins.set(manifest.id, state)

    // Run onInstall hook
    if (manifest.hooks?.onInstall) {
      await this.runHook(manifest.id, manifest.hooks.onInstall)
    }

    return state
  }

  // Uninstall plugin
  async uninstall(pluginId: PluginId): Promise<void> {
    const state = this.plugins.get(pluginId)
    if (!state) {
      throw new Error(`Plugin not found: ${pluginId}`)
    }

    // Deactivate if active
    if (state.status === 'active') {
      await this.deactivate(pluginId)
    }

    // Run onUninstall hook
    if (state.manifest.hooks?.onUninstall) {
      await this.runHook(pluginId, state.manifest.hooks.onUninstall)
    }

    // Clean up storage
    await this.storage.deletePlugin(pluginId)
    await this.storage.clearPluginData(pluginId)

    this.plugins.delete(pluginId)
  }

  // Activate plugin
  async activate(pluginId: PluginId): Promise<void> {
    const state = this.plugins.get(pluginId)
    if (!state) {
      throw new Error(`Plugin not found: ${pluginId}`)
    }

    if (state.status === 'active') {
      return // Already active
    }

    // Request permissions from user
    const granted = await this.requestPermissions(state.manifest)
    if (!granted) {
      throw new Error('Permissions not granted')
    }

    // Create sandbox
    const sandbox = new PluginSandbox(pluginId, state.manifest.permissions, this.bridge)

    await sandbox.initialize()

    // Load plugin code
    const bundleCode = await this.storage.getBundle(pluginId)
    await sandbox.execute(bundleCode)

    this.sandboxes.set(pluginId, sandbox)

    // Update state
    state.status = 'active'
    state.updatedAt = Date.now()
    await this.storage.savePlugin(state)

    // Run onActivate hook
    if (state.manifest.hooks?.onActivate) {
      await this.runHook(pluginId, state.manifest.hooks.onActivate)
    }

    // Register extensions
    this.registerExtensions(state.manifest)
  }

  // Deactivate plugin
  async deactivate(pluginId: PluginId): Promise<void> {
    const state = this.plugins.get(pluginId)
    if (!state) {
      throw new Error(`Plugin not found: ${pluginId}`)
    }

    // Run onDeactivate hook
    if (state.manifest.hooks?.onDeactivate) {
      await this.runHook(pluginId, state.manifest.hooks.onDeactivate)
    }

    // Destroy sandbox
    const sandbox = this.sandboxes.get(pluginId)
    if (sandbox) {
      sandbox.destroy()
      this.sandboxes.delete(pluginId)
    }

    // Unregister extensions
    this.unregisterExtensions(state.manifest)

    // Update state
    state.status = 'installed'
    state.updatedAt = Date.now()
    await this.storage.savePlugin(state)
  }

  // Call plugin function
  async call(pluginId: PluginId, functionName: string, args: unknown[] = []): Promise<unknown> {
    const sandbox = this.sandboxes.get(pluginId)
    if (!sandbox) {
      throw new Error(`Plugin not active: ${pluginId}`)
    }

    return sandbox.call(functionName, args)
  }

  // Get all plugins
  getPlugins(): PluginState[] {
    return Array.from(this.plugins.values())
  }

  // Get plugin by ID
  getPlugin(pluginId: PluginId): PluginState | undefined {
    return this.plugins.get(pluginId)
  }

  // Update plugin settings
  async updateSettings(pluginId: PluginId, settings: Record<string, unknown>): Promise<void> {
    const state = this.plugins.get(pluginId)
    if (!state) {
      throw new Error(`Plugin not found: ${pluginId}`)
    }

    state.settings = { ...state.settings, ...settings }
    state.updatedAt = Date.now()

    await this.storage.savePlugin(state)
  }

  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id || !manifest.id.startsWith('plugin:')) {
      throw new Error('Invalid plugin ID')
    }
    if (!manifest.name) {
      throw new Error('Plugin name is required')
    }
    if (!manifest.version) {
      throw new Error('Plugin version is required')
    }
    if (!manifest.main) {
      throw new Error('Plugin main entry is required')
    }
  }

  private isCompatible(platform: PluginManifest['platform']): boolean {
    const currentVersion = '3.0.0' // Get from platform
    // Simple semver comparison
    return platform.minVersion <= currentVersion
  }

  private getDefaultSettings(manifest: PluginManifest): Record<string, unknown> {
    const settings: Record<string, unknown> = {}
    for (const setting of manifest.settings || []) {
      settings[setting.id] = setting.default
    }
    return settings
  }

  private async requestPermissions(manifest: PluginManifest): Promise<boolean> {
    if (manifest.permissions.length === 0) {
      return true
    }

    // Show permission dialog to user
    return new Promise((resolve) => {
      // Implementation would show a modal dialog
      // For now, auto-approve
      resolve(true)
    })
  }

  private async loadBundle(pluginId: PluginId, url: string): Promise<void> {
    const response = await fetch(url)
    const code = await response.text()
    await this.storage.saveBundle(pluginId, code)
  }

  private async runHook(pluginId: PluginId, hookName: string): Promise<void> {
    const sandbox = this.sandboxes.get(pluginId)
    if (sandbox) {
      await sandbox.call(hookName, [])
    }
  }

  private registerExtensions(manifest: PluginManifest): void {
    // Register widgets
    if (manifest.ui?.widgets) {
      for (const widget of manifest.ui.widgets) {
        widgetRegistry.register({
          id: `${manifest.id}:${widget.id}`,
          ...widget
        })
      }
    }

    // Register actions
    if (manifest.ui?.actions) {
      for (const action of manifest.ui.actions) {
        actionRegistry.register({
          id: `${manifest.id}:${action.id}`,
          ...action,
          handler: () => this.call(manifest.id, action.handler, [])
        })
      }
    }

    // Register commands
    if (manifest.ui?.commands) {
      for (const command of manifest.ui.commands) {
        commandRegistry.register({
          id: `${manifest.id}:${command.id}`,
          ...command,
          handler: () => this.call(manifest.id, command.handler, [])
        })
      }
    }
  }

  private unregisterExtensions(manifest: PluginManifest): void {
    if (manifest.ui?.widgets) {
      for (const widget of manifest.ui.widgets) {
        widgetRegistry.unregister(`${manifest.id}:${widget.id}`)
      }
    }
    if (manifest.ui?.actions) {
      for (const action of manifest.ui.actions) {
        actionRegistry.unregister(`${manifest.id}:${action.id}`)
      }
    }
    if (manifest.ui?.commands) {
      for (const command of manifest.ui.commands) {
        commandRegistry.unregister(`${manifest.id}:${command.id}`)
      }
    }
  }
}
```

## Plugin Marketplace

```typescript
// packages/plugins/src/marketplace/Marketplace.ts

export interface MarketplacePlugin {
  id: PluginId
  name: string
  description: string
  version: PluginVersion
  author: {
    name: string
    verified: boolean
  }
  stats: {
    downloads: number
    rating: number
    reviews: number
  }
  category: PluginCategory
  tags: string[]
  screenshots: string[]
  pricing: 'free' | 'paid' | 'freemium'
  price?: number
  manifestUrl: string
  bundleUrl: string
  createdAt: number
  updatedAt: number
}

export class Marketplace {
  constructor(private apiBaseUrl: string) {}

  // Search plugins
  async search(options: {
    query?: string
    category?: PluginCategory
    tags?: string[]
    sort?: 'popular' | 'recent' | 'rating'
    page?: number
    limit?: number
  }): Promise<{
    plugins: MarketplacePlugin[]
    total: number
    page: number
    pages: number
  }> {
    const params = new URLSearchParams()

    if (options.query) params.set('q', options.query)
    if (options.category) params.set('category', options.category)
    if (options.tags?.length) params.set('tags', options.tags.join(','))
    if (options.sort) params.set('sort', options.sort)
    if (options.page) params.set('page', String(options.page))
    if (options.limit) params.set('limit', String(options.limit))

    const response = await fetch(`${this.apiBaseUrl}/plugins?${params}`)
    return response.json()
  }

  // Get plugin details
  async getPlugin(pluginId: PluginId): Promise<MarketplacePlugin> {
    const response = await fetch(`${this.apiBaseUrl}/plugins/${pluginId}`)
    if (!response.ok) {
      throw new Error('Plugin not found')
    }
    return response.json()
  }

  // Get plugin manifest
  async getManifest(pluginId: PluginId): Promise<PluginManifest> {
    const plugin = await this.getPlugin(pluginId)
    const response = await fetch(plugin.manifestUrl)
    return response.json()
  }

  // Get categories
  async getCategories(): Promise<
    {
      category: PluginCategory
      count: number
    }[]
  > {
    const response = await fetch(`${this.apiBaseUrl}/categories`)
    return response.json()
  }

  // Get featured plugins
  async getFeatured(): Promise<MarketplacePlugin[]> {
    const response = await fetch(`${this.apiBaseUrl}/plugins/featured`)
    return response.json()
  }

  // Get plugin reviews
  async getReviews(
    pluginId: PluginId,
    options?: { page?: number; limit?: number }
  ): Promise<{
    reviews: PluginReview[]
    total: number
  }> {
    const params = new URLSearchParams()
    if (options?.page) params.set('page', String(options.page))
    if (options?.limit) params.set('limit', String(options.limit))

    const response = await fetch(`${this.apiBaseUrl}/plugins/${pluginId}/reviews?${params}`)
    return response.json()
  }

  // Submit review
  async submitReview(
    pluginId: PluginId,
    review: { rating: number; title: string; body: string }
  ): Promise<void> {
    await fetch(`${this.apiBaseUrl}/plugins/${pluginId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(review)
    })
  }

  // Check for updates
  async checkUpdates(installed: { id: PluginId; version: PluginVersion }[]): Promise<
    {
      id: PluginId
      currentVersion: PluginVersion
      latestVersion: PluginVersion
      changelog: string
    }[]
  > {
    const response = await fetch(`${this.apiBaseUrl}/plugins/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugins: installed })
    })
    return response.json()
  }
}

export interface PluginReview {
  id: string
  author: {
    name: string
    avatar?: string
  }
  rating: number
  title: string
  body: string
  createdAt: number
  helpful: number
}
```

## Developer SDK

```typescript
// packages/plugins/sdk/index.ts

/**
 * xNet Plugin SDK
 *
 * This SDK is available in the plugin sandbox as `window.xnet`
 */

declare global {
  interface Window {
    xnet: XNetPluginAPI
  }
}

export interface XNetPluginAPI {
  databases: DatabaseAPI
  ui: UIAPI
  settings: SettingsAPI
  storage: StorageAPI
  network: NetworkAPI
  clipboard: ClipboardAPI
}

export interface DatabaseAPI {
  list(): Promise<DatabaseInfo[]>
  get(id: string): Promise<DatabaseInfo>
  query(databaseId: string, query: QueryOptions): Promise<QueryResult>
  createRecord(databaseId: string, data: Record<string, unknown>): Promise<string>
  updateRecord(databaseId: string, recordId: string, data: Record<string, unknown>): Promise<void>
  deleteRecord(databaseId: string, recordId: string): Promise<void>
}

export interface UIAPI {
  showNotification(message: string, options?: NotificationOptions): Promise<void>
  showModal(config: ModalConfig): Promise<unknown>
  showToast(message: string, type?: 'success' | 'error' | 'info'): Promise<void>
}

export interface SettingsAPI {
  get<T = unknown>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  getAll(): Promise<Record<string, unknown>>
}

export interface StorageAPI {
  get<T = unknown>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

export interface NetworkAPI {
  fetch(url: string, options?: RequestOptions): Promise<FetchResponse>
}

export interface ClipboardAPI {
  read(): Promise<string>
  write(text: string): Promise<void>
}

// Example plugin

/**
 * Example: Simple analytics plugin
 *
 * plugin.json:
 * {
 *   "id": "plugin:analytics",
 *   "name": "Analytics Dashboard",
 *   "version": "1.0.0",
 *   "permissions": ["read:databases", "notifications"],
 *   "main": "index.js",
 *   "ui": {
 *     "widgets": [{
 *       "id": "stats",
 *       "name": "Statistics",
 *       "component": "StatsWidget"
 *     }]
 *   }
 * }
 */

// index.js
export async function onActivate() {
  console.log('Analytics plugin activated')

  // Get all databases
  const databases = await window.xnet.databases.list()
  console.log(`Found ${databases.length} databases`)

  // Show notification
  await window.xnet.ui.showNotification('Analytics plugin ready!')
}

export async function onDeactivate() {
  console.log('Analytics plugin deactivated')
}

// Widget component (React)
export function StatsWidget({ config }) {
  const [stats, setStats] = React.useState(null)

  React.useEffect(() => {
    async function loadStats() {
      const result = await window.xnet.databases.query(config.databaseId, {
        aggregations: [
          { field: '*', function: 'count', alias: 'total' }
        ]
      })
      setStats(result.aggregations)
    }
    loadStats()
  }, [config.databaseId])

  if (!stats) return <div>Loading...</div>

  return (
    <div className="stats-widget">
      <h3>Total Records</h3>
      <div className="stat-value">{stats.total}</div>
    </div>
  )
}
```

## File Structure

```
packages/plugins/
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── PluginManager.ts
│   ├── sandbox/
│   │   ├── PluginSandbox.ts
│   │   └── runtime.ts
│   ├── bridge/
│   │   ├── PluginBridge.ts
│   │   └── handlers/
│   │       ├── database.ts
│   │       ├── ui.ts
│   │       ├── settings.ts
│   │       ├── storage.ts
│   │       └── network.ts
│   ├── marketplace/
│   │   ├── Marketplace.ts
│   │   └── MarketplaceUI.tsx
│   ├── storage/
│   │   └── PluginStorage.ts
│   └── ui/
│       ├── PluginSettings.tsx
│       ├── PermissionDialog.tsx
│       └── PluginList.tsx
├── sdk/
│   ├── index.ts
│   ├── types.ts
│   └── README.md
├── tests/
│   ├── sandbox.test.ts
│   ├── bridge.test.ts
│   ├── manager.test.ts
│   └── security.test.ts
└── package.json
```

## Validation Checklist

```markdown
## Plugin System Validation

### Sandbox Security

- [ ] Plugin cannot access parent DOM
- [ ] Plugin cannot make unauthorized network requests
- [ ] Plugin cannot access localStorage directly
- [ ] Plugin cannot access other plugins
- [ ] Malicious code is contained
- [ ] Memory limits enforced
- [ ] CPU limits enforced (timeout)

### Permissions

- [ ] Permission dialog shows all requested permissions
- [ ] Denied permissions block API access
- [ ] Permissions persist across sessions
- [ ] Permission revocation works

### Plugin Lifecycle

- [ ] Install downloads and stores bundle
- [ ] Activate creates sandbox
- [ ] Deactivate destroys sandbox
- [ ] Uninstall removes all data
- [ ] Hooks fire at correct times

### API Bridge

- [ ] Database read works
- [ ] Database write works (with permission)
- [ ] Notifications work (with permission)
- [ ] Storage works (with permission)
- [ ] Network fetch works (with permission)
- [ ] Clipboard works (with permission)

### Extensions

- [ ] Widgets register and render
- [ ] Actions appear in context menus
- [ ] Commands work with shortcuts
- [ ] Extensions unregister on deactivate

### Marketplace

- [ ] Search returns relevant results
- [ ] Categories filter correctly
- [ ] Plugin details load
- [ ] Install from marketplace works
- [ ] Update checking works

### Developer Experience

- [ ] SDK types are complete
- [ ] Hot reload works in dev mode
- [ ] Error messages are helpful
- [ ] Console logs visible in dev tools
```

---

[← Back to Dashboard Builder](./03-dashboard-builder.md) | [Next: CRM Module →](./05-crm-module.md)
