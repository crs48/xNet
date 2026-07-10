/**
 * Persistent per-plugin configuration — the storage half of the first-party
 * catalog's config forms.
 *
 * Values live in `localStorage` under one namespaced key per plugin, so
 * configuration survives reloads on this device and never syncs: tokens and
 * webhook secrets stay local. (The plugin runtime's `ExtensionStorage` is an
 * in-memory Map, so it can't back a settings form — see
 * packages/plugins/src/types.ts.)
 *
 * Pure helpers + a tiny listener registry so React views can re-render when a
 * dialog saves. Injectable storage keeps the module testable without a DOM.
 */

import type { PluginConfigField } from './first-party-catalog'

export type PluginConfigValues = Record<string, string>

/** The subset of `Storage` we use (injectable for tests). */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const PREFIX = 'xnet.pluginConfig.'

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // storage disabled (private mode, sandbox)
  }
}

function storageKey(pluginId: string): string {
  return `${PREFIX}${pluginId}`
}

/** Read a plugin's saved configuration ({} when unset or unreadable). */
export function readPluginConfig(
  pluginId: string,
  store: KeyValueStore | null = defaultStore()
): PluginConfigValues {
  const raw = store?.getItem(storageKey(pluginId))
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const values: PluginConfigValues = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') values[k] = v
    }
    return values
  } catch {
    return {}
  }
}

/** Persist a plugin's configuration (empty-string values are dropped). */
export function writePluginConfig(
  pluginId: string,
  values: PluginConfigValues,
  store: KeyValueStore | null = defaultStore()
): void {
  if (!store) return
  const compact = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ''))
  if (Object.keys(compact).length === 0) {
    store.removeItem(storageKey(pluginId))
  } else {
    store.setItem(storageKey(pluginId), JSON.stringify(compact))
  }
  notify(pluginId)
}

/** Remove a plugin's configuration entirely (used on uninstall). */
export function clearPluginConfig(
  pluginId: string,
  store: KeyValueStore | null = defaultStore()
): void {
  store?.removeItem(storageKey(pluginId))
  notify(pluginId)
}

/** True when every `required` field in the spec has a non-empty saved value. */
export function isPluginConfigured(
  fields: readonly PluginConfigField[] | undefined,
  values: PluginConfigValues
): boolean {
  if (!fields) return true
  return fields.filter((f) => f.required).every((f) => (values[f.key] ?? '').trim() !== '')
}

// ─── Change notification ─────────────────────────────────────────────────────

type Listener = (pluginId: string) => void
const listeners = new Set<Listener>()

function notify(pluginId: string): void {
  for (const l of listeners) l(pluginId)
}

/** Subscribe to config saves (any plugin). Returns an unsubscribe fn. */
export function onPluginConfigChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
