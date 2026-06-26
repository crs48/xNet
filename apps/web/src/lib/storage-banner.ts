/**
 * Storage banner descriptors (explorations 0154 + 0172).
 *
 * Pure mapping from PersistentStorageStatus + browser context to the
 * banner the app shows. Browsers decide persist() very differently, so
 * tone, title, copy, and available actions are all per-family:
 *
 * - Chromium re-evaluates a silent request on every call and grants it
 *   from install/notification/engagement signals — denial is pending,
 *   not final, so it gets an informational note.
 * - Safari only grants to installed (Dock/Home Screen) web apps and ITP
 *   deletes best-effort site data after 7 days of non-use; an in-tab
 *   retry cannot succeed, so the retry action is dropped there.
 * - Firefox shows a real permission prompt the user controls.
 */
import type { PersistentStorageStatus } from '@xnetjs/sqlite'

export type BrowserFamily = 'chromium' | 'firefox' | 'safari' | 'other'

export type StorageBannerTone = 'success' | 'warning' | 'info'

export type StorageBannerDescriptor = {
  tone: StorageBannerTone
  title: string
  message: string
  usageBytes?: number
  quotaBytes?: number
  actionLabel?: string
  actionPendingLabel?: string
  secondaryActionLabel?: string
  secondaryActionPendingLabel?: string
  detailItems?: string[]
}

export interface StorageBannerContext {
  browserFamily: BrowserFamily
  installAvailable: boolean
  isInstalled: boolean
}

export function detectBrowserFamily(): BrowserFamily {
  if (typeof navigator === 'undefined') {
    return 'other'
  }

  const userAgent = navigator.userAgent
  const isChromium =
    /Chrome|Chromium|Edg|OPR/i.test(userAgent) &&
    !/Firefox|FxiOS|Safari\/.*Version/i.test(userAgent)
  const isFirefox = /Firefox|FxiOS/i.test(userAgent)
  const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(userAgent)

  if (isChromium) return 'chromium'
  if (isFirefox) return 'firefox'
  if (isSafari) return 'safari'
  return 'other'
}

function localhostHint(): string[] {
  return typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? [
        'Localhost can be stricter than a real HTTPS app origin for install and engagement heuristics.'
      ]
    : []
}

function safariRecoveryItems(): string[] {
  return [
    'Safari only grants durable storage to installed web apps, and clears data from sites unused for 7 days of Safari browsing.',
    'On macOS, use Share > Add to Dock. On iPhone or iPad, use Share > Add to Home Screen. Installed apps are exempt from that cleanup.',
    'Until then, opening xNet at least weekly resets the cleanup timer, and hub sync keeps your data recoverable.'
  ]
}

function chromiumRecoveryItems(context: StorageBannerContext): string[] {
  return [
    'No action needed: this browser re-evaluates the request automatically, and regular use grants it within a few days.',
    context.installAvailable && !context.isInstalled
      ? 'To enable it now, turn on desktop alerts in the Notifications panel or install xNet with the Install app button.'
      : 'To enable it now, turn on desktop alerts in the Notifications panel or install xNet from the browser menu.'
  ]
}

function firefoxRecoveryItems(requested: boolean): string[] {
  return [
    requested
      ? 'Firefox remembers a blocked prompt. Re-allow it from the permissions icon in the address bar or Page Info > Permissions > Store data in persistent storage.'
      : 'Firefox shows a permission prompt. Choose Allow, and check "Remember this decision" to keep it.'
  ]
}

export function getStorageRecoveryItems(
  storageStatus: PersistentStorageStatus,
  context: StorageBannerContext
): string[] {
  if (storageStatus.state !== 'not-granted') {
    return []
  }

  const items: Record<BrowserFamily, () => string[]> = {
    safari: safariRecoveryItems,
    chromium: () => chromiumRecoveryItems(context),
    firefox: () => firefoxRecoveryItems(storageStatus.requested),
    other: () => [
      'Browsers grant durable storage from install, notification, and usage signals. Keep using xNet from this profile, then retry.'
    ]
  }

  return [...items[context.browserFamily](), ...localhostHint()]
}

function notGrantedTitle(requested: boolean, browserFamily: BrowserFamily): string {
  if (!requested) return 'Enable durable local storage'
  if (browserFamily === 'chromium') return 'Durable storage pending'
  if (browserFamily === 'safari') return 'Safari limits durable storage in browser tabs'
  return 'Browser declined durable storage'
}

function requestAction(
  storageStatus: PersistentStorageStatus,
  context: StorageBannerContext
): Pick<StorageBannerDescriptor, 'actionLabel' | 'actionPendingLabel'> {
  // An in-tab Safari retry cannot succeed — the recovery items carry the
  // install guidance instead. Installed Safari keeps the action.
  const retryCanSucceed = context.browserFamily !== 'safari' || context.isInstalled
  if (!storageStatus.requestable || !retryCanSucceed) return {}
  return {
    actionLabel: storageStatus.requested ? 'Retry durable storage' : 'Enable durable storage',
    actionPendingLabel: 'Requesting storage'
  }
}

function installAction(
  context: StorageBannerContext
): Pick<StorageBannerDescriptor, 'secondaryActionLabel' | 'secondaryActionPendingLabel'> {
  if (!context.installAvailable || context.isInstalled) return {}
  return {
    secondaryActionLabel: 'Install app',
    secondaryActionPendingLabel: 'Opening install'
  }
}

function detailItems(
  storageStatus: PersistentStorageStatus,
  context: StorageBannerContext
): Pick<StorageBannerDescriptor, 'detailItems'> {
  const items = getStorageRecoveryItems(storageStatus, context)
  return items.length > 0 ? { detailItems: items } : {}
}

function warningBanner(
  storageWarning: string,
  storageStatus: PersistentStorageStatus | undefined,
  context: StorageBannerContext
): StorageBannerDescriptor {
  const granted = storageStatus?.state === 'granted'
  return {
    tone: granted ? 'info' : 'warning',
    title: 'Storage may be limited',
    message:
      storageStatus && !granted ? `${storageWarning} ${storageStatus.message}` : storageWarning,
    usageBytes: storageStatus?.usageBytes,
    quotaBytes: storageStatus?.quotaBytes,
    ...(storageStatus?.requestable
      ? { actionLabel: 'Enable durable storage', actionPendingLabel: 'Requesting storage' }
      : {}),
    ...(storageStatus ? detailItems(storageStatus, context) : {}),
    ...(storageStatus?.state === 'not-granted' ? installAction(context) : {})
  }
}

function notGrantedBanner(
  storageStatus: PersistentStorageStatus,
  context: StorageBannerContext
): StorageBannerDescriptor {
  // Chromium's denial resolves itself with regular use — informational.
  // Safari's best-effort storage has a date-certain ITP cleanup — warning.
  return {
    tone: context.browserFamily === 'chromium' ? 'info' : 'warning',
    title: notGrantedTitle(storageStatus.requested, context.browserFamily),
    message: storageStatus.message,
    usageBytes: storageStatus.usageBytes,
    quotaBytes: storageStatus.quotaBytes,
    ...requestAction(storageStatus, context),
    ...detailItems(storageStatus, context),
    ...installAction(context)
  }
}

export function getStorageBanner(input: {
  storageWarning?: string
  storageStatus?: PersistentStorageStatus
  browserFamily: BrowserFamily
  installAvailable: boolean
  isInstalled: boolean
}): StorageBannerDescriptor | null {
  const { storageWarning, storageStatus, ...context } = input

  if (storageWarning) {
    return warningBanner(storageWarning, storageStatus, context)
  }

  if (!storageStatus) {
    return null
  }

  switch (storageStatus.state) {
    case 'granted':
      // The working state is ambient, not a top banner. A green "enabled"
      // bar re-appeared on every page load and crowded the shell despite
      // having no action to take; the StatusBar surfaces durable storage as
      // glanceable system info instead (see StorageStatus). Only the
      // not-working states below still warrant an actionable banner.
      return null
    case 'not-granted':
      return notGrantedBanner(storageStatus, context)
    case 'unsupported':
    case 'error':
      return {
        tone: 'info',
        title: 'Storage durability unavailable',
        message: storageStatus.message,
        usageBytes: storageStatus.usageBytes,
        quotaBytes: storageStatus.quotaBytes
      }
  }
}
