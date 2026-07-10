/**
 * MarketplaceView — browse and install plugins from the registry (exploration 0201).
 *
 * Reads the same committed `registry.json` the website renders (via
 * `MarketplaceClient`), and installs community plugins through the real
 * `PluginRegistry.install` pipeline: the capability-consent gate
 * (`evaluateInstallConsent`) is surfaced as a dialog the user must approve, and
 * the plugin is stamped with `marketplace` provenance so it runs at the right
 * trust tier. First-party plugins install from the app-side catalog
 * (`plugins/first-party-catalog.ts`) at `builtin` provenance, and grouping is
 * by ACTUAL install state — "Built in" never lies (0290). Installed first-party
 * plugins configure through `PluginConfigDialog`.
 *
 * Note: loading executable plugin code from a community Release into a
 * tier-appropriate sandbox is a separate hardening step (see exploration 0201
 * Phase 4); this view drives discovery + the consent-gated install of the
 * fetched manifest.
 */

import { MarketplaceClient, describeCapabilities, type ConsentDecision } from '@xnetjs/plugins'
import { useXNet } from '@xnetjs/react'
import {
  AlertTriangle,
  CheckCircle,
  Download,
  ExternalLink,
  Eye,
  Globe,
  KeyRound,
  Loader2,
  Pencil,
  Plug,
  Scale,
  Search,
  Settings2,
  Star,
  Store,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { firstPartyManifest, firstPartyRecord } from '../plugins/first-party-catalog'
import { isPluginConfigured, onPluginConfigChange, readPluginConfig } from '../plugins/plugin-config'
import {
  PLUGIN_REGISTRY_URL,
  fetchManifest,
  isInstallable,
  partitionListings,
  type MarketplaceListing
} from './marketplace-listing'
import { PluginConfigDialog } from './PluginConfigDialog'

const QUIET_BUTTON =
  'flex items-center gap-2 rounded-md border border-hairline bg-surface-0 px-3 py-1.5 text-xs text-ink-1 transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50'

const CONSENT_ICON = {
  edit: Pencil,
  eye: Eye,
  globe: Globe,
  key: KeyRound,
  plug: Plug
} as const

type SortOption = 'relevance' | 'installs' | 'stars' | 'name'

/** A pending consent prompt: the decision to show and the resolver to settle. */
interface ConsentPrompt {
  entry: MarketplaceListing
  decision: ConsentDecision
  resolve: (granted: boolean) => void
}

export function MarketplaceView() {
  const { pluginRegistry: registry, nodeStoreReady } = useXNet()
  const client = useMemo(() => new MarketplaceClient({ indexUrl: PLUGIN_REGISTRY_URL }), [])

  const [entries, setEntries] = useState<MarketplaceListing[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('')
  const [sort, setSort] = useState<SortOption>('relevance')

  const [installedIds, setInstalledIds] = useState<string[]>([])
  const [installing, setInstalling] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [consent, setConsent] = useState<ConsentPrompt | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [configForId, setConfigForId] = useState<string | null>(null)

  // Re-render when a config dialog saves (needs-setup hints depend on it).
  const [, setConfigTick] = useState(0)
  useEffect(() => onPluginConfigChange(() => setConfigTick((t) => t + 1)), [])

  // Keep installed ids in sync with the registry.
  useEffect(() => {
    if (!registry) return
    const refresh = () => setInstalledIds(registry.getAll().map((p) => p.manifest.id))
    refresh()
    const disposable = registry.onChange(refresh)
    return () => disposable.dispose()
  }, [registry])

  // Search whenever the query/sort/category changes.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    client
      .search(query, { sort, category: category || undefined })
      .then((results) => {
        if (!cancelled) setEntries(results as MarketplaceListing[])
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load plugins')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, query, sort, category])

  const categories = useMemo(
    () => [...new Set(entries.map((e) => e.category).filter(Boolean) as string[])].sort(),
    [entries]
  )

  const handleInstall = useCallback(
    async (entry: MarketplaceListing) => {
      if (!registry) return
      setActionError(null)
      setInstalling(entry.id)
      try {
        // First-party plugins install from the app-side catalog; community
        // plugins fetch their manifest from the registry entry's URL.
        const firstParty = firstPartyManifest(entry)
        const manifest =
          firstParty ?? (entry.manifestUrl ? await fetchManifest(entry.manifestUrl) : null)
        if (!manifest) return
        await registry.install(manifest, {
          provenance: firstParty ? 'builtin' : 'marketplace',
          onConsent: (decision) =>
            new Promise<boolean>((resolve) => setConsent({ entry, decision, resolve }))
        })
        // Installed and configurable → drop straight into the config form.
        if (firstParty && firstPartyRecord(entry.id)?.config?.length) {
          setConfigForId(entry.id)
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Install failed')
      } finally {
        setInstalling(null)
      }
    },
    [registry]
  )

  const resolveConsent = useCallback(
    (granted: boolean) => {
      consent?.resolve(granted)
      setConsent(null)
    },
    [consent]
  )

  const { builtIn, available, installed } = partitionListings(entries, installedIds)

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId]
  )
  const selectedState = selected ? listingState(selected, installedIds) : undefined
  const configFor = useMemo(
    () => (configForId ? (entries.find((e) => e.id === configForId) ?? null) : null),
    [entries, configForId]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium text-ink-1">Browse plugins</h2>
          <p className="text-xs text-ink-3">Discover and install plugins from the marketplace</p>
        </div>
        <Store size={18} strokeWidth={1.5} className="text-ink-3" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search
            size={14}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plugins…"
            className="w-full rounded-md border border-hairline bg-surface-1 py-1.5 pl-8 pr-3 text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-hairline bg-surface-1 px-2 py-1.5 text-xs text-ink-1 outline-none"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="rounded-md border border-hairline bg-surface-1 px-2 py-1.5 text-xs text-ink-1 outline-none"
          aria-label="Sort plugins"
        >
          <option value="relevance">Relevance</option>
          <option value="installs">Most installed</option>
          <option value="stars">Most starred</option>
          <option value="name">Name</option>
        </select>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive-muted px-3 py-2 text-xs text-destructive">
          <AlertTriangle size={16} strokeWidth={1.5} />
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-ink-3">
          <Loader2 size={20} strokeWidth={1.5} className="animate-spin" />
        </div>
      ) : loadError ? (
        <div className="rounded-md border border-dashed border-hairline py-10 text-center text-xs text-ink-3">
          Couldn't load the marketplace ({loadError}).
        </div>
      ) : (
        <div className="space-y-6">
          {available.length > 0 && (
            <Group title="Available">
              {available.map((entry) => (
                <MarketplaceCard
                  key={entry.id}
                  entry={entry}
                  installing={installing === entry.id}
                  disabled={!nodeStoreReady || !registry}
                  onInstall={() => handleInstall(entry)}
                  onOpen={() => setSelectedId(entry.id)}
                />
              ))}
            </Group>
          )}
          {builtIn.length > 0 && (
            <Group title="Built in">
              {builtIn.map((entry) => (
                <MarketplaceCard
                  key={entry.id}
                  entry={entry}
                  state="builtin"
                  onOpen={() => setSelectedId(entry.id)}
                />
              ))}
            </Group>
          )}
          {installed.length > 0 && (
            <Group title="Installed">
              {installed.map((entry) => (
                <MarketplaceCard
                  key={entry.id}
                  entry={entry}
                  state="installed"
                  onOpen={() => setSelectedId(entry.id)}
                />
              ))}
            </Group>
          )}
          {entries.length === 0 && (
            <div className="rounded-md border border-dashed border-hairline py-10 text-center text-xs text-ink-3">
              No plugins match your search.
            </div>
          )}
        </div>
      )}

      {selected && !configFor && (
        <PluginDetailsDialog
          entry={selected}
          state={selectedState}
          installing={installing === selected.id}
          disabled={!nodeStoreReady || !registry}
          onInstall={() => handleInstall(selected)}
          onConfigure={
            selectedState && firstPartyRecord(selected.id)?.config?.length
              ? () => setConfigForId(selected.id)
              : undefined
          }
          onClose={() => setSelectedId(null)}
        />
      )}

      {configFor && (
        <PluginConfigDialog
          pluginId={configFor.id}
          pluginName={configFor.name}
          record={firstPartyRecord(configFor.id)!}
          onClose={() => setConfigForId(null)}
        />
      )}

      {consent && <ConsentDialog prompt={consent} onResolve={resolveConsent} />}
    </div>
  )
}

/**
 * Classify a listing for display by ACTUAL install state: "Built-in" means a
 * first-party plugin that is genuinely installed, never a mere catalog tier.
 */
function listingState(
  entry: MarketplaceListing,
  installedIds: readonly string[]
): 'builtin' | 'installed' | undefined {
  if (!installedIds.includes(entry.id)) return undefined
  return entry.tier === 'bundled' ? 'builtin' : 'installed'
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-medium uppercase tracking-wider text-ink-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

interface MarketplaceCardProps {
  entry: MarketplaceListing
  state?: 'builtin' | 'installed'
  installing?: boolean
  disabled?: boolean
  onInstall?: () => void
  onOpen?: () => void
}

function MarketplaceCard({
  entry,
  state,
  installing,
  disabled,
  onInstall,
  onOpen
}: MarketplaceCardProps) {
  const caps = describeCapabilities(entry.capabilities ?? firstPartyRecord(entry.id)?.capabilities)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen?.()
        }
      }}
      className="cursor-pointer rounded-md border border-hairline bg-surface-0 p-3 text-left transition-colors hover:border-border-emphasis hover:bg-surface-1"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2">
          <Plug size={18} strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-medium text-ink-1">{entry.name}</h4>
            <span className="font-mono text-[10px] text-ink-3">v{entry.version}</span>
            {entry.category && (
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3">
                {entry.category}
              </span>
            )}
          </div>
          <p className="mb-1 line-clamp-2 text-xs text-ink-3">{entry.description}</p>
          <p className="text-xs text-ink-3">By {entry.author}</p>
          {caps.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {caps.map((line, i) => {
                const Icon = CONSENT_ICON[line.icon]
                return (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                      line.danger
                        ? 'bg-destructive-muted text-destructive'
                        : 'bg-surface-2 text-ink-3'
                    }`}
                  >
                    <Icon size={10} strokeWidth={1.5} />
                    {line.text}
                  </span>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex-shrink-0">
          {state === 'builtin' || state === 'installed' ? (
            <span className="inline-flex items-center gap-1 rounded bg-success-muted px-1.5 py-1 text-[10px] font-medium text-success">
              <CheckCircle size={10} strokeWidth={1.5} />
              {state === 'builtin' ? 'Built-in' : 'Installed'}
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onInstall?.()
              }}
              disabled={disabled || installing || !isInstallable(entry)}
              className={QUIET_BUTTON}
            >
              {installing ? (
                <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
              ) : (
                <Download size={14} strokeWidth={1.5} />
              )}
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Full-detail view for a single plugin, opened by clicking a marketplace card.
 * Shows the description, stats, requested capabilities, and what the plugin
 * contributes — with an Install button that drives the same consent-gated
 * install flow as the inline card action.
 */
function PluginDetailsDialog({
  entry,
  state,
  installing,
  disabled,
  onInstall,
  onConfigure,
  onClose
}: {
  entry: MarketplaceListing
  state?: 'builtin' | 'installed'
  installing?: boolean
  disabled?: boolean
  onInstall?: () => void
  /** Present when the plugin is installed and has a config form. */
  onConfigure?: () => void
  onClose: () => void
}) {
  const record = firstPartyRecord(entry.id)
  const caps = describeCapabilities(entry.capabilities ?? record?.capabilities)
  const needsSetup =
    !!onConfigure && !isPluginConfigured(record?.config, readPluginConfig(entry.id))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-[480px] flex-col overflow-hidden rounded-md border border-hairline bg-surface-0 shadow-lg">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-hairline px-6 py-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2">
            <Plug size={22} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-medium text-ink-1">{entry.name}</h2>
              <span className="font-mono text-[10px] text-ink-3">v{entry.version}</span>
              {entry.category && (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3">
                  {entry.category}
                </span>
              )}
            </div>
            <p className="text-xs text-ink-3">By {entry.author}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-1"
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <p className="text-xs leading-relaxed text-ink-2">{entry.description}</p>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3">
            {typeof entry.installs === 'number' && (
              <span className="inline-flex items-center gap-1">
                <Download size={11} strokeWidth={1.5} />
                {entry.installs.toLocaleString()} installs
              </span>
            )}
            {typeof entry.stars === 'number' && (
              <span className="inline-flex items-center gap-1">
                <Star size={11} strokeWidth={1.5} />
                {entry.stars.toLocaleString()}
              </span>
            )}
            {entry.license && (
              <span className="inline-flex items-center gap-1">
                <Scale size={11} strokeWidth={1.5} />
                {entry.license}
              </span>
            )}
            {entry.homepage && (
              <a
                href={entry.homepage}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-ink-2 transition-colors hover:text-ink-1"
              >
                <ExternalLink size={11} strokeWidth={1.5} />
                Homepage
              </a>
            )}
          </div>

          {caps.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-[10px] font-medium uppercase tracking-wider text-ink-3">
                Requested access
              </h3>
              <div className="space-y-1.5">
                {caps.map((line, i) => {
                  const Icon = CONSENT_ICON[line.icon]
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                        line.danger
                          ? 'bg-destructive-muted text-destructive'
                          : 'bg-surface-1 text-ink-2'
                      }`}
                    >
                      <Icon size={14} strokeWidth={1.5} />
                      {line.text}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {entry.contributes && entry.contributes.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-[10px] font-medium uppercase tracking-wider text-ink-3">Adds</h3>
              <div className="flex flex-wrap gap-1.5">
                {entry.contributes.map((c) => (
                  <span
                    key={c}
                    className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-hairline px-6 py-4">
          <span className="text-[11px] text-warning">
            {needsSetup && (
              <span className="inline-flex items-center gap-1">
                <AlertTriangle size={12} strokeWidth={1.5} />
                Needs setup
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {onConfigure && (
              <button type="button" onClick={onConfigure} className={QUIET_BUTTON}>
                <Settings2 size={14} strokeWidth={1.5} />
                Configure
              </button>
            )}
            {state === 'builtin' || state === 'installed' ? (
              <span className="inline-flex items-center gap-1 rounded bg-success-muted px-2 py-1 text-[11px] font-medium text-success">
                <CheckCircle size={12} strokeWidth={1.5} />
                {state === 'builtin' ? 'Built-in' : 'Installed'}
              </span>
            ) : (
              <button
                type="button"
                onClick={onInstall}
                disabled={disabled || installing || !isInstallable(entry)}
                className={QUIET_BUTTON}
              >
                {installing ? (
                  <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                ) : (
                  <Download size={14} strokeWidth={1.5} />
                )}
                Install
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ConsentDialog({
  prompt,
  onResolve
}: {
  prompt: ConsentPrompt
  onResolve: (granted: boolean) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => onResolve(false)} />
      <div className="relative w-[440px] overflow-hidden rounded-md border border-hairline bg-surface-0 shadow-lg">
        <div className="border-b border-hairline px-6 py-4">
          <h2 className="text-base font-medium text-ink-1">Install {prompt.entry.name}?</h2>
          <p className="text-xs text-ink-3">This plugin requests the following access:</p>
        </div>
        <div className="space-y-2 p-6">
          {prompt.decision.lines.map((line, i) => {
            const Icon = CONSENT_ICON[line.icon]
            return (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                  line.danger ? 'bg-destructive-muted text-destructive' : 'bg-surface-1 text-ink-2'
                }`}
              >
                <Icon size={14} strokeWidth={1.5} />
                {line.text}
              </div>
            )
          })}
          {prompt.decision.hasDanger && (
            <p className="flex items-center gap-1.5 pt-1 text-[11px] text-destructive">
              <AlertTriangle size={12} strokeWidth={1.5} />
              This plugin requests broad or sensitive access. Only continue if you trust it.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-hairline px-6 py-4">
          <button type="button" onClick={() => onResolve(false)} className={QUIET_BUTTON}>
            Cancel
          </button>
          <button type="button" onClick={() => onResolve(true)} className={QUIET_BUTTON}>
            <CheckCircle size={14} strokeWidth={1.5} />
            Approve & install
          </button>
        </div>
      </div>
    </div>
  )
}
