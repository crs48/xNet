/**
 * Desktop notification delivery for the inbox (explorations 0168 + 0172).
 *
 * OS-level delivery of InboxItems when the tab is hidden, behind an
 * explicit user-gesture opt-in. A granted notification permission is also
 * one of Chromium's "important site" signals, so the opt-in chains a
 * persistent-storage re-request: enabling alerts typically flips durable
 * storage to granted in the same session.
 */
import type { InboxItem, Notifier } from '@xnetjs/comms'
import { requestPersistentStorage } from '@xnetjs/sqlite'
import { useEffect } from 'react'
import { publishStorageStatus } from '../lib/storage-durability'

const NOTIFICATION_TITLES: Partial<Record<InboxItem['reason'], string>> = {
  mention: 'You were mentioned',
  'room-mention': 'Room mention',
  dm: 'New direct message',
  assigned: 'Task assigned to you',
  reply: 'New reply',
  comment: 'New comment',
  keyword: 'Keyword alert',
  'call-missed': 'Missed call',
  system: 'xNet'
}

export function desktopNotificationsSupported(): boolean {
  return typeof Notification !== 'undefined'
}

export function desktopNotificationPermission(): NotificationPermission | 'unsupported' {
  return desktopNotificationsSupported() ? Notification.permission : 'unsupported'
}

/**
 * Request notification permission (must run in a user gesture). On grant,
 * immediately re-request persistent storage — the fresh permission is a
 * grant signal Chromium evaluates on the spot — and publish the resulting
 * status so the storage banner updates without a reload.
 */
export async function enableDesktopNotifications(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!desktopNotificationsSupported()) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission === 'granted') {
    const status = await requestPersistentStorage().catch(() => null)
    if (status) publishStorageStatus('notifications', status)
  }
  return permission
}

function deliver(item: InboxItem): void {
  const title = NOTIFICATION_TITLES[item.reason] ?? 'xNet'
  try {
    const notification = new Notification(title, {
      body: item.preview ?? '',
      tag: item.sourceId
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch {
    // Some platforms (e.g. Android Chrome) only allow notifications via a
    // service worker registration; in-app inbox remains the fallback.
  }
}

function deliveryAllowed(): boolean {
  return desktopNotificationPermission() === 'granted' && document.visibilityState === 'hidden'
}

/**
 * Deliver items not seen before, marking everything seen either way.
 * Exported for tests; the hook below wires it to the live notifier.
 */
export function deliverFreshInboxItems(
  items: InboxItem[],
  seen: Set<string>,
  allowed: () => boolean = deliveryAllowed,
  deliverItem: (item: InboxItem) => void = deliver
): void {
  const fresh = items.filter((item) => !seen.has(item.sourceId))
  for (const item of items) seen.add(item.sourceId)
  if (fresh.length === 0 || !allowed()) return
  for (const item of fresh) deliverItem(item)
}

/**
 * Mirror new inbox items to OS notifications while the tab is hidden.
 * Permission is checked at delivery time, so a grant from the opt-in (or
 * the browser's site settings) takes effect without remounting.
 */
export function useDesktopNotificationDelivery(notifier: Notifier): void {
  useEffect(() => {
    const seen = new Set(notifier.getItems().map((item) => item.sourceId))
    return notifier.subscribe(() => deliverFreshInboxItems(notifier.getItems(), seen))
  }, [notifier])
}
