/**
 * PluginManager - UI for managing installed plugins
 *
 * Features:
 * - List installed plugins with status
 * - Enable/disable plugins
 * - Install new plugins from manifest
 * - Uninstall plugins
 *
 * Workbench-idiom styling: hairline list rows, the design-system <Switch>
 * for enable/disable, and the monochrome ramp (exploration 0179).
 */

import type { RegisteredPlugin } from '@xnetjs/plugins'
import { useXNet } from '@xnetjs/react'
import { Switch } from '@xnetjs/ui'
import {
  Puzzle,
  Trash2,
  Plus,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  PowerOff,
  Settings2,
  XCircle,
  Package,
  Loader2
} from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { firstPartyRecord } from '../plugins/first-party-catalog'
import {
  clearPluginConfig,
  isPluginConfigured,
  onPluginConfigChange,
  readPluginConfig
} from '../plugins/plugin-config'
import { PluginConfigDialog } from './PluginConfigDialog'

/** Quiet bordered button — the workbench's default action affordance. */
const QUIET_BUTTON =
  'flex items-center gap-2 rounded-md border border-hairline bg-surface-0 px-3 py-1.5 text-xs text-ink-1 transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50'

function PluginsHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-base font-medium text-ink-1">Plugins</h2>
        <p className="text-xs text-ink-3">Manage extensions and plugins</p>
      </div>
      {children}
    </div>
  )
}

export function PluginManager() {
  const [error, setError] = useState<string | null>(null)
  const [showInstallDialog, setShowInstallDialog] = useState(false)
  const [plugins, setPlugins] = useState<RegisteredPlugin[]>([])
  const [configFor, setConfigFor] = useState<RegisteredPlugin | null>(null)

  // Re-render when a config dialog saves (needs-setup hints depend on it).
  const [, setConfigTick] = useState(0)
  useEffect(() => onPluginConfigChange(() => setConfigTick((t) => t + 1)), [])

  // Access the plugin registry from xNet context
  const { pluginRegistry: registry, nodeStoreReady } = useXNet()
  const pluginsEnabled = registry !== null

  // Subscribe to plugin changes
  useEffect(() => {
    if (!registry) return

    // Initial load
    setPlugins(registry.getAll())

    // Subscribe to changes
    const disposable = registry.onChange(() => {
      setPlugins(registry.getAll())
    })

    return () => disposable.dispose()
  }, [registry])

  const handleActivate = useCallback(
    async (pluginId: string) => {
      if (!registry) return
      setError(null)
      try {
        await registry.activate(pluginId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to activate plugin')
      }
    },
    [registry]
  )

  const handleDeactivate = useCallback(
    async (pluginId: string) => {
      if (!registry) return
      setError(null)
      try {
        await registry.deactivate(pluginId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to deactivate plugin')
      }
    },
    [registry]
  )

  const handleToggle = useCallback(
    (pluginId: string, next: boolean) => {
      if (next) void handleActivate(pluginId)
      else void handleDeactivate(pluginId)
    },
    [handleActivate, handleDeactivate]
  )

  const handleUninstall = useCallback(
    async (pluginId: string) => {
      if (!registry) return
      setError(null)
      const confirmed = window.confirm(`Are you sure you want to uninstall this plugin?`)
      if (!confirmed) return

      try {
        await registry.uninstall(pluginId)
        clearPluginConfig(pluginId) // saved tokens don't outlive the plugin
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to uninstall plugin')
      }
    },
    [registry]
  )

  const handleInstall = useCallback(
    async (manifestJson: string) => {
      if (!registry) return
      setError(null)
      try {
        const manifest = JSON.parse(manifestJson)
        await registry.install(manifest)
        setShowInstallDialog(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to install plugin')
      }
    },
    [registry]
  )

  // Show loading state while initializing
  if (!nodeStoreReady) {
    return (
      <div className="space-y-6">
        <PluginsHeader />
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Loader2 size={24} strokeWidth={1.5} className="mb-4 animate-spin text-ink-3" />
          <p className="text-xs text-ink-3">Initializing plugin system…</p>
        </div>
      </div>
    )
  }

  // If plugins aren't enabled after initialization, show a message
  if (!pluginsEnabled) {
    return (
      <div className="space-y-6">
        <PluginsHeader />
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
            <Puzzle size={24} strokeWidth={1.5} className="text-ink-3" />
          </div>
          <h3 className="mb-2 text-sm font-medium text-ink-1">Plugin System Not Available</h3>
          <p className="max-w-[300px] text-xs text-ink-3">
            The plugin system is not available in this environment. Plugins require specific
            platform capabilities that may not be enabled.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PluginsHeader>
        <button type="button" onClick={() => setShowInstallDialog(true)} className={QUIET_BUTTON}>
          <Plus size={14} strokeWidth={1.5} />
          Install Plugin
        </button>
      </PluginsHeader>

      <p className="text-xs text-ink-3">
        {plugins.length} plugin{plugins.length !== 1 ? 's' : ''} installed
      </p>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive-muted px-3 py-2 text-xs text-destructive">
          <AlertCircle size={16} strokeWidth={1.5} />
          {error}
        </div>
      )}

      {/* Plugin list */}
      {plugins.length === 0 ? (
        <EmptyState onInstall={() => setShowInstallDialog(true)} />
      ) : (
        <div className="space-y-2">
          {plugins.map((plugin) => (
            <PluginCard
              key={plugin.manifest.id}
              plugin={plugin}
              onToggle={handleToggle}
              onUninstall={handleUninstall}
              onConfigure={
                firstPartyRecord(plugin.manifest.id)?.config?.length
                  ? () => setConfigFor(plugin)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Install dialog */}
      {showInstallDialog && (
        <InstallPluginDialog
          onInstall={handleInstall}
          onClose={() => setShowInstallDialog(false)}
          error={error}
        />
      )}

      {/* Configure dialog (first-party plugins with a config spec) */}
      {configFor && (
        <PluginConfigDialog
          pluginId={configFor.manifest.id}
          pluginName={configFor.manifest.name}
          record={firstPartyRecord(configFor.manifest.id)!}
          onClose={() => setConfigFor(null)}
        />
      )}
    </div>
  )
}

// ─── Plugin Card ──────────────────────────────────────────────────────────────

interface PluginCardProps {
  plugin: RegisteredPlugin
  onToggle: (id: string, next: boolean) => void
  onUninstall: (id: string) => void
  /** Present when the plugin has a first-party config form. */
  onConfigure?: () => void
}

function PluginCard({ plugin, onToggle, onUninstall, onConfigure }: PluginCardProps) {
  const { manifest, status, error } = plugin
  const isActive = status === 'active'
  const hasError = status === 'error'
  const needsSetup =
    !!onConfigure &&
    !isPluginConfigured(firstPartyRecord(manifest.id)?.config, readPluginConfig(manifest.id))

  return (
    <div
      className={`rounded-md border p-3 transition-colors ${
        hasError ? 'border-destructive/40 bg-destructive-muted' : 'border-hairline bg-surface-0'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md ${
            hasError ? 'bg-destructive/15 text-destructive' : 'bg-surface-2 text-ink-2'
          }`}
        >
          <Package size={18} strokeWidth={1.5} />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-ink-1">{manifest.name}</h3>
            <span className="font-mono text-[10px] text-ink-3">v{manifest.version}</span>
            <StatusBadge status={status} />
          </div>

          {manifest.description && (
            <p className="mb-1 line-clamp-2 text-xs text-ink-3">{manifest.description}</p>
          )}

          {manifest.author && <p className="text-xs text-ink-3">By {manifest.author}</p>}

          {needsSetup && (
            <p className="mt-2 flex items-center gap-1 text-xs text-warning">
              <AlertTriangle size={12} strokeWidth={1.5} />
              Needs setup — open Configure to finish connecting.
            </p>
          )}

          {hasError && error && (
            <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
              <AlertCircle size={12} strokeWidth={1.5} />
              {error.message}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {onConfigure && (
            <button
              type="button"
              onClick={onConfigure}
              className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-1"
              title="Configure"
              aria-label="Configure plugin"
            >
              <Settings2 size={16} strokeWidth={1.5} />
            </button>
          )}
          <Switch
            checked={isActive}
            onCheckedChange={(next) => onToggle(manifest.id, next)}
            aria-label={isActive ? 'Deactivate plugin' : 'Activate plugin'}
          />
          <button
            type="button"
            onClick={() => onUninstall(manifest.id)}
            className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-destructive"
            title="Uninstall"
            aria-label="Uninstall plugin"
          >
            <Trash2 size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: RegisteredPlugin['status'] }) {
  const configs: Record<
    RegisteredPlugin['status'],
    { label: string; color: string; icon: React.ReactNode }
  > = {
    installed: { label: 'Installed', color: 'bg-surface-2 text-ink-3', icon: null },
    active: {
      label: 'Active',
      color: 'bg-success-muted text-success',
      icon: <CheckCircle size={10} strokeWidth={1.5} />
    },
    disabled: {
      label: 'Disabled',
      color: 'bg-surface-2 text-ink-3',
      icon: <PowerOff size={10} strokeWidth={1.5} />
    },
    error: {
      label: 'Error',
      color: 'bg-destructive-muted text-destructive',
      icon: <XCircle size={10} strokeWidth={1.5} />
    }
  }
  const config = configs[status]

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${config.color}`}
    >
      {config.icon}
      {config.label}
    </span>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onInstall }: { onInstall: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-hairline py-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
          <Puzzle size={24} strokeWidth={1.5} className="text-ink-3" />
        </div>
        <h3 className="mb-2 text-sm font-medium text-ink-1">No plugins installed</h3>
        <p className="mb-4 max-w-[300px] text-xs text-ink-3">
          Plugins extend xNet with custom views, commands, sidebar items, and integrations.
        </p>
        <button type="button" onClick={onInstall} className={QUIET_BUTTON}>
          <Plus size={14} strokeWidth={1.5} />
          Install Plugin
        </button>
      </div>

      {/* Built-in features note */}
      <div className="rounded-md border border-hairline bg-surface-1 p-3">
        <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wider text-ink-3">
          Built-in Features
        </h4>
        <p className="text-xs text-ink-3">
          Core editor features like Mermaid diagrams, callouts, embeds, and code blocks are built
          into xNet and don't require plugins. Plugins are for adding custom functionality beyond
          the built-in features.
        </p>
      </div>
    </div>
  )
}

// ─── Install Dialog ───────────────────────────────────────────────────────────

interface InstallPluginDialogProps {
  onInstall: (manifestJson: string) => void
  onClose: () => void
  error: string | null
}

function InstallPluginDialog({ onInstall, onClose, error }: InstallPluginDialogProps) {
  const [manifest, setManifest] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setParseError(null)

    try {
      // Validate JSON before submitting
      JSON.parse(manifest)
      onInstall(manifest)
    } catch {
      setParseError('Invalid JSON format')
    }
  }

  const exampleManifest = `{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A sample plugin",
  "author": "Your Name",
  "platforms": ["electron", "web"]
}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative max-h-[80vh] w-[500px] overflow-hidden rounded-md border border-hairline bg-surface-0 shadow-lg">
        <div className="border-b border-hairline px-6 py-4">
          <h2 className="text-base font-medium text-ink-1">Install Plugin</h2>
          <p className="text-xs text-ink-3">Paste the plugin manifest JSON to install</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-ink-3">
              Plugin Manifest
            </label>
            <textarea
              value={manifest}
              onChange={(e) => setManifest(e.target.value)}
              placeholder={exampleManifest}
              className="h-[200px] w-full resize-none rounded-md border border-hairline bg-surface-1 px-3 py-2 font-mono text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
              spellCheck={false}
            />
          </div>

          {(parseError || error) && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive-muted px-3 py-2 text-xs text-destructive">
              <AlertCircle size={16} strokeWidth={1.5} />
              {parseError || error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={QUIET_BUTTON}>
              Cancel
            </button>
            <button type="submit" disabled={!manifest.trim()} className={QUIET_BUTTON}>
              <Plus size={14} strokeWidth={1.5} />
              Install
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
