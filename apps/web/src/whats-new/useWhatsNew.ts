/**
 * In-app "What's New" hook (exploration 0195).
 *
 * The changelog feed is fetched lazily — only when the panel is opened — so the
 * app makes no background network request on startup (which would surface as a
 * console error in the offline e2e environment). Closing the panel marks the
 * newest entry as seen, persisted in the workbench store.
 */
import { useCallback, useState } from 'react'
import { useWorkbench } from '../workbench/state'
import { fetchChangelog, selectUnseen, type ChangelogFeedItem } from './feed'

export interface WhatsNewApi {
  open: boolean
  items: ChangelogFeedItem[]
  loading: boolean
  loaded: boolean
  /** Entries newer than the last-seen id (empty on first-ever open). */
  unseen: ChangelogFeedItem[]
  appVersion: string | undefined
  openPanel: () => void
  closePanel: () => void
}

export function useWhatsNew(): WhatsNewApi {
  const lastSeenId = useWorkbench((s) => s.lastSeenChangelogId)
  const setLastSeen = useWorkbench((s) => s.setLastSeenChangelogId)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ChangelogFeedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const openPanel = useCallback(() => {
    setOpen(true)
    if (loaded || loading) return
    setLoading(true)
    void fetchChangelog().then((data) => {
      setItems(data)
      setLoaded(true)
      setLoading(false)
    })
  }, [loaded, loading])

  const closePanel = useCallback(() => {
    setOpen(false)
    if (items[0]) setLastSeen(items[0].id)
  }, [items, setLastSeen])

  return {
    open,
    items,
    loading,
    loaded,
    unseen: selectUnseen(items, lastSeenId),
    appVersion: import.meta.env.VITE_APP_VERSION,
    openPanel,
    closePanel
  }
}
