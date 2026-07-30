/**
 * Web's WorkbenchHost (0406) — the app side of the shell's host adapter.
 *
 * Everything here is a straight binding of an existing app module onto the
 * contract in @xnetjs/workbench: no new behaviour, one place that knows both
 * names. If this file fails to typecheck, the app's API drifted from what the
 * shell chrome needs — fix the drift, don't widen the contract.
 */
import { setWorkbenchHost, type WorkbenchHost } from '@xnetjs/workbench'
import { CoachmarkLayer, contributeTips } from '../coachmarks'
import { ChatsPanel } from '../comms/ChatsPanel'
import { channelLabel, colorForDid } from '../comms/comms-utils'
import { useComms, useCommsMaybe } from '../comms/CommsContext'
import { displayName, useChannels, useEnsureProfiles, useInbox, useProfiles } from '../comms/hooks'
import { InboxTray } from '../comms/InboxTray'
import { AddSharedDialog } from '../components/AddSharedDialog'
import { ErrorFallback } from '../components/ErrorFallback'
import { isHabit, metricName } from '../components/experiments/habit-logic'
import { MetricEditor } from '../components/experiments/MetricEditor'
import { useHabits } from '../components/experiments/useHabits'
import { SelfAvatar } from '../components/SelfAvatar'
import { ShareDialog } from '../components/ShareDialog'
import { WinddownOverlay } from '../components/WinddownOverlay'
import { useCreateInSpace } from '../hooks/useCreateInSpace'
import { useStorageStatus } from '../hooks/useStorageStatus'
import { useWorkspaceTags } from '../hooks/useWorkspaceTags'
import { logout } from '../lib/identity'
import { WhatsNewButton } from '../whats-new/WhatsNewButton'

const webWorkbenchHost: WorkbenchHost = {
  logout,

  useStorageStatus,
  useCreateInSpace,
  useWorkspaceTags,

  comms: {
    useComms,
    useCommsMaybe,
    useChannels,
    useInbox,
    useProfiles,
    useEnsureProfiles,
    displayName,
    channelLabel,
    colorForDid,
    ChatsPanel,
    InboxTray
  },

  experiments: {
    useHabits,
    isHabit,
    metricName,
    MetricEditor
  },

  SelfAvatar,
  ShareDialog,
  ErrorFallback,
  AddSharedDialog,
  WinddownOverlay,
  CoachmarkLayer,
  contributeTips,
  WhatsNewButton
}

/** Idempotent; called at module scope from the root route. */
export function setWebWorkbenchHost(): void {
  setWorkbenchHost(webWorkbenchHost)
}
