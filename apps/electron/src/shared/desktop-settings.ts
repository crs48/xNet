/** Logical settings only: Chromium files and device-bound sessions are not portable. */
export const DESKTOP_SETTING_KEYS = [
  'xnet.library.capture-draft.v1',
  'xnet:workbench:v1',
  'xnet:hub-url',
  'xnet-electron-theme',
  'xnet-electron-theme-variant',
  'xnet-electron-theme-density',
  'xnet-electron-theme-tokens',
  'xnet:ai-api-key',
  'xnet:ai-cloud-provider',
  'xnet:ai-model',
  'xnet:ai-local-base-url',
  'xnet:ai-tier',
  'xnet:ai-semantic-search',
  'xnet:ai-writes',
  'xnet:ai:assist-mode',
  'xnet:experiment:quiet-default',
  'xnet:experiment:desk-radial',
  'xnet:meetings:consent',
  'xnet:meetings:engine',
  'xnet:meetings:byo-endpoint',
  'xnet:data-workspace:dismissed-patterns',
  'xnet:telemetry:consent'
] as const

export type DesktopSettings = {
  version: 1
  values: Record<(typeof DESKTOP_SETTING_KEYS)[number], string | null>
}

export type SettingsRecovery = { settings: DesktopSettings | null; restoreId: string | null }
export const SETTINGS_LIMIT = 16 * 1024 * 1024

export function validateDesktopSettings(value: unknown): DesktopSettings {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1)
    throw new Error('Unsupported desktop settings version')
  if (!('values' in value) || !value.values || typeof value.values !== 'object')
    throw new Error('Invalid desktop settings')
  const entries = Object.entries(value.values)
  if (
    entries.length !== DESKTOP_SETTING_KEYS.length ||
    entries.some(
      ([key, entry]) =>
        !(DESKTOP_SETTING_KEYS as readonly string[]).includes(key) ||
        (entry !== null && typeof entry !== 'string')
    ) ||
    new TextEncoder().encode(JSON.stringify(value)).byteLength > SETTINGS_LIMIT
  )
    throw new Error('Incomplete, unsupported, or oversized desktop settings')
  return value as DesktopSettings
}

export function captureDesktopSettings(storage: Pick<Storage, 'getItem'>): DesktopSettings {
  return validateDesktopSettings({
    version: 1,
    values: Object.fromEntries(DESKTOP_SETTING_KEYS.map((key) => [key, storage.getItem(key)]))
  })
}

const INITIALIZED = 'xnet:recovery:settings-initialized'
const APPLIED = 'xnet:recovery:settings-applied'

/** Run before importing consumers. A failed application is retried in full on next boot. */
export function restoreDesktopSettings(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  recovery: SettingsRecovery
): void {
  const restoring =
    !storage.getItem(INITIALIZED) ||
    (recovery.restoreId !== null && storage.getItem(APPLIED) !== recovery.restoreId)
  if (restoring && recovery.settings) {
    const settings = validateDesktopSettings(recovery.settings)
    for (const key of DESKTOP_SETTING_KEYS) {
      const value = settings.values[key]
      if (value === null) storage.removeItem(key)
      else storage.setItem(key, value)
    }
  }
  if (restoring && recovery.restoreId) {
    // These authorize a session on this installation; they must be paired again.
    storage.removeItem('xnet:ai-bridge-token')
    storage.removeItem('xnet:ai-openrouter-verifier')
    storage.setItem(APPLIED, recovery.restoreId)
  }
  storage.setItem(INITIALIZED, '1')
}
