/**
 * PluginManager - UI for managing installed plugins
 *
 * Features:
 * - List installed plugins with status
 * - Enable/disable plugins
 * - Install new plugins from manifest
 * - Uninstall plugins
 */

import type { RegisteredPlugin } from '@xnetjs/plugins'
import { useXNet } from '@xnetjs/react'
import {
  Puzzle,
  Power,
  PowerOff,
  Trash2,
  Plus,
  AlertCircle,
  CheckCircle,
  XCircle,
  Package,
  Loader2
} from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'

export function PluginManager() {
  const [error, setError] = useState<string | null>(null)
  const [showInstallDialog, setShowInstallDialog] = useState(false)
  const [plugins, setPlugins] = useState<RegisteredPlugin[]>([])

  // Access the plugin registry from XNet context
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

  const handleUninstall = useCallback(
    async (pluginId: string) => {
      if (!registry) return
      setError(null)
      const confirmed = window.confirm(`Are you sure you want to uninstall this plugin?`)
      if (!confirmed) return

      try {
        await registry.uninstall(pluginId)
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
        <div>
          <h2 className="text-lg font-medium mb-1">Plugins</h2>
          <p className="text-sm text-muted-foreground">Manage extensions and plugins</p>
        </div>

        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Loader2 size={24} className="text-muted-foreground animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">Initializing plugin system...</p>
        </div>
      </div>
    )
  }

  // If plugins aren't enabled after initialization, show a message
  if (!pluginsEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium mb-1">Plugins</h2>
          <p className="text-sm text-muted-foreground">Manage extensions and plugins</p>
        </div>

        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Puzzle size={24} className="text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium mb-2">Plugin System Not Available</h3>
          <p className="text-xs text-muted-foreground max-w-[300px]">
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium mb-1">Plugins</h2>
          <p className="text-sm text-muted-foreground">
            {plugins.length} plugin{plugins.length !== 1 ? 's' : ''} installed
          </p>
        </div>
        <button
          onClick={() => setShowInstallDialog(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-md text-sm transition-colors"
        >
          <Plus size={14} />
          Install Plugin
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-md px-3 py-2 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Plugin list */}
      {plugins.length === 0 ? (
        <EmptyState onInstall={() => setShowInstallDialog(true)} />
      ) : (
        <div className="space-y-3">
          {plugins.map((plugin) => (
            <PluginCard
              key={plugin.manifest.id}
              plugin={plugin}
              onActivate={handleActivate}
              onDeactivate={handleDeactivate}
              onUninstall={handleUninstall}
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
    </div>
  )
}

// ─── Plugin Card ──────────────────────────────────────────────────────────────

interface PluginCardProps {
  plugin: RegisteredPlugin
  onActivate: (id: string) => void
  onDeactivate: (id: string) => void
  onUninstall: (id: string) => void
}

function PluginCard({ plugin, onActivate, onDeactivate, onUninstall }: PluginCardProps) {
  const { manifest, status, error } = plugin
  const isActive = status === 'active'
  const hasError = status === 'error'

  return (
    <div
      className={`border rounded-lg p-4 transition-colors ${
        hasError
          ? 'border-destructive/50 bg-destructive/5'
          : isActive
            ? 'border-border bg-background'
            : 'border-border bg-muted/30'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            hasError
              ? 'bg-destructive/20 text-destructive'
              : isActive
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          <Package size={20} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium truncate">{manifest.name}</h3>
            <span className="text-xs text-muted-foreground">v{manifest.version}</span>
            <StatusBadge status={status} />
          </div>

          {manifest.description && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
              {manifest.description}
            </p>
          )}

          {manifest.author && <p className="text-xs text-muted-foreground">By {manifest.author}</p>}

          {hasError && error && (
            <p className="text-xs text-destructive mt-2 flex items-center gap-1">
              <AlertCircle size={12} />
              {error.message}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isActive ? (
            <button
              onClick={() => onDeactivate(manifest.id)}
              className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Deactivate"
            >
              <PowerOff size={16} />
            </button>
          ) : (
            <button
              onClick={() => onActivate(manifest.id)}
              className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Activate"
            >
              <Power size={16} />
            </button>
          )}

          <button
            onClick={() => onUninstall(manifest.id)}
            className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Uninstall"
          >
            <Trash2 size={16} />
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
    installed: { label: 'Installed', color: 'bg-muted text-muted-foreground', icon: null },
    active: {
      label: 'Active',
      color: 'bg-green-500/10 text-green-600 dark:text-green-400',
      icon: <CheckCircle size={10} />
    },
    disabled: {
      label: 'Disabled',
      color: 'bg-muted text-muted-foreground',
      icon: <PowerOff size={10} />
    },
    error: {
      label: 'Error',
      color: 'bg-destructive/10 text-destructive',
      icon: <XCircle size={10} />
    }
  }
  const config = configs[status]

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.color}`}
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
      <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-lg">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Puzzle size={24} className="text-muted-foreground" />
        </div>
        <h3 className="text-sm font-medium mb-2">No plugins installed</h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-[300px]">
          Plugins extend xNet with custom views, commands, sidebar items, and integrations.
        </p>
        <button
          onClick={onInstall}
          className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-md text-sm transition-colors"
        >
          <Plus size={14} />
          Install Plugin
        </button>
      </div>

      {/* Built-in features note */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="text-xs font-medium mb-2 text-muted-foreground">Built-in Features</h4>
        <p className="text-xs text-muted-foreground">
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
      <div className="relative bg-background border border-border rounded-lg shadow-lg w-[500px] max-h-[80vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Install Plugin</h2>
          <p className="text-sm text-muted-foreground">Paste the plugin manifest JSON to install</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Plugin Manifest</label>
            <textarea
              value={manifest}
              onChange={(e) => setManifest(e.target.value)}
              placeholder={exampleManifest}
              className="w-full h-[200px] bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              spellCheck={false}
            />
          </div>

          {(parseError || error) && (
            <div className="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-md px-3 py-2 text-sm">
              <AlertCircle size={16} />
              {parseError || error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!manifest.trim()}
              className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-md text-sm transition-colors"
            >
              <Plus size={14} />
              Install
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
