/**
 * Status bar chips (0167/0168): ambient presence for the active node and
 * the inbox bell with Discord-style two-tier badging — a number for unread
 * mentions/DMs, a dot for other activity. Clicking the bell opens the
 * Notifications tray; clicking presence opens the Room section.
 */
import { useRouterState } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useFormSubmissionDrain } from '../hooks/useFormSubmissionDrain'
import { revealContextSection } from '../workbench/context-panel'
import { useWorkbench } from '../workbench/state'
import { useStatusBarItem } from '../workbench/status'
import { tabFromPathname } from '../workbench/tabs'
import { useComms } from './CommsContext'
import { useInbox } from './hooks'

function bellText(mentions: number, activity: boolean): string {
  if (mentions > 0) return `🔔 ${mentions}`
  return activity ? '🔔 ·' : '🔔'
}

export function InboxBellItem() {
  const { badges } = useInbox()
  const showPanelView = useWorkbench((state) => state.showPanelView)

  useStatusBarItem(
    useMemo(
      () => ({
        id: 'comms-inbox-bell',
        side: 'left' as const,
        text: bellText(badges.mentions, badges.activity),
        title: 'Notifications — mentions, DMs, assignments',
        onClick: () => showPanelView('bottom', 'notifications')
      }),
      [badges.mentions, badges.activity, showPanelView]
    )
  )
  return null
}

export function PresenceStatusItem() {
  const { workspacePeers } = useComms()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const here = useMemo(() => {
    const tab = tabFromPathname(pathname)
    if (!tab) return 0
    return workspacePeers.filter((peer) => peer.viewing === tab.nodeId).length
  }, [workspacePeers, pathname])

  useStatusBarItem(
    useMemo(() => {
      if (here === 0) return null
      return {
        id: 'comms-presence',
        side: 'left' as const,
        text: `◉ ${here} here`,
        title: 'People viewing this node — open the Room panel',
        onClick: () => revealContextSection('comms-room')
      }
    }, [here])
  )
  return null
}

/**
 * Form inbox chip (exploration 0278): hosts the drain agent that turns
 * public form submissions into rows, and surfaces submissions that failed
 * drain-time validation (rejected) so they are reviewed, not lost. Pending
 * normally drains to 0 within a tick, so the chip mostly shows rejects.
 */
export function FormInboxItem() {
  const { pendingTotal, rejectedTotal } = useFormSubmissionDrain()

  useStatusBarItem(
    useMemo(() => {
      if (pendingTotal + rejectedTotal === 0) return null
      const parts: string[] = []
      if (pendingTotal > 0) parts.push(`${pendingTotal} pending`)
      if (rejectedTotal > 0) parts.push(`${rejectedTotal} rejected`)
      return {
        id: 'form-inbox',
        side: 'left' as const,
        text: `📥 ${parts.join(' · ')}`,
        title: 'Form submissions — pending drain into rows; rejected need review'
      }
    }, [pendingTotal, rejectedTotal])
  )
  return null
}
