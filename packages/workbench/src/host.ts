/**
 * WorkbenchHost — the app-side services the shell chrome consumes but cannot
 * define (exploration 0406).
 *
 * The PlatformPort answers "how do I navigate"; this contract answers
 * everything else the chrome used to reach into apps/web for: workspace data
 * hooks, comms presence, and the handful of app components (dialogs, search,
 * avatars) that stay host-owned because they bind to app data or the router.
 *
 * Design rules, in order:
 *  - The contract encodes what the SHELL needs, not what web offers — members
 *    are narrowed to the fields the chrome actually reads, so a second host
 *    (desktop) implements the minimum, not web's whole API surface.
 *  - Pure logic never rides the adapter — it moves into this package instead
 *    (view registry, explorer items, data-runtime, tag ranking).
 *  - Reading before the app registers throws, exactly like the view registry:
 *    a silently absent host is indistinguishable from a broken shell.
 */
import type { CreatableDocType } from './doc-id'
import type { InboxItem, InboxStateData, UserCard } from '@xnetjs/comms'
import type { PersistentStorageStatus } from '@xnetjs/sqlite'
import type { ComponentType } from 'react'

// Space data hooks live in this package now (they are pure @xnetjs/react data
// hooks); the type re-export keeps chrome imports of `SpaceEntry` from
// './host' stable.
export type { SpaceEntry, SpacesApi } from './hooks/useSpaces'

export interface TagEntry {
  id: string
  name: string
  color?: string
  archived?: boolean
}

/** The doc types the share dialog can be opened for from the chrome. */
export type ShareDocType =
  | 'page'
  | 'database'
  | 'canvas'
  | 'dashboard'
  | 'view'
  | 'space'
  | 'workspace'
  | 'channel'

export interface ShareDialogProps {
  docId: string
  docType: ShareDocType
  isOpen: boolean
  onClose: () => void
}

export interface ProfileEntry {
  did: string
  name?: string
  avatar?: string
  handle?: string
}

export interface ChannelEntry {
  id: string
  name?: string
  kind?: string
  members?: string[]
  topic?: string
  updatedAt?: number
  createdAt?: number
}

export interface WorkbenchCommsHost {
  /** Throws outside the host's comms provider, like the app hook it wraps. */
  useComms(): { me: UserCard }
  useCommsMaybe(): { me: UserCard } | null
  useChannels(): { channels: ChannelEntry[]; loading: boolean }
  useInbox(): { items: InboxItem[]; state: InboxStateData }
  useProfiles(): ProfileEntry[]
  useEnsureProfiles(dids: ReadonlyArray<string | undefined | null>): void
  displayName(did: string, profiles: ProfileEntry[]): string
  channelLabel(channel: ChannelEntry, me: string, profiles: ProfileEntry[]): string
  colorForDid(did: string): string
  ChatsPanel: ComponentType
  InboxTray: ComponentType
}

/** Structural twins of the app's habit-logic shapes (only `id` is trusted). */
export interface MetricLike {
  id: string
  name?: unknown
  kind?: unknown
  schedule?: unknown
  scheduleDays?: unknown
  color?: unknown
  icon?: unknown
  unit?: unknown
  scaleMin?: unknown
  scaleMax?: unknown
  target?: unknown
  polarity?: unknown
  cue?: unknown
  experiment?: unknown
}

export interface ObservationLike {
  id: string
  metric?: unknown
  day?: unknown
  value?: unknown
  note?: unknown
}

export interface HabitSummary {
  done: boolean
  streak: number
  longest: number
  strength: number
  rate30: number
  completedDays: Set<number>
  byDay: Map<number, ObservationLike>
}

export interface HabitsApi {
  metrics: MetricLike[]
  loading: boolean
  today: number
  due: Array<{ metric: MetricLike; summary: HabitSummary }>
  summaryFor: (metric: MetricLike) => HabitSummary
  toggleHabit: (metric: MetricLike, summary: HabitSummary, done: boolean) => Promise<void>
  logValue: (metric: MetricLike, value: number) => Promise<void>
  setNote: (metric: MetricLike, note: string) => Promise<void>
  createHabit: (input: {
    name: string
    kind?: string
    schedule?: string
    scheduleDays?: number[]
  }) => Promise<string | null>
  createMetric: (input?: {
    name?: string
    kind?: string
    schedule?: string
  }) => Promise<string | null>
}

export interface MetricEditorProps {
  metricId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

export interface WorkbenchExperimentsHost {
  useHabits(): HabitsApi
  isHabit(metric: MetricLike): boolean
  metricName(metric: MetricLike): string
  MetricEditor: ComponentType<MetricEditorProps>
}

export type CoachTipId = `${string}@${number}`

export interface CoachTip {
  id: CoachTipId
  view: string
  anchor: string
  title: string
  body: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  order?: number
}

export interface WorkbenchHost {
  /** Lock the identity and restart the surface. */
  logout(): Promise<void>

  // Workspace data hooks (call-through: stable as long as the host is set once).
  useStorageStatus(): PersistentStorageStatus | null
  useCreateInSpace(): (type: CreatableDocType, spaceId: string | null) => Promise<void>
  useWorkspaceTags(): { allTags: TagEntry[] }

  comms: WorkbenchCommsHost
  experiments: WorkbenchExperimentsHost

  // Host-owned components the chrome mounts as-is. These stay app-side
  // because they bind app data or the host's router (ErrorFallback,
  // AddSharedDialog, CoachmarkLayer, ChatsPanel, InboxTray all navigate).
  SelfAvatar: ComponentType<{ size?: number; className?: string }>
  ShareDialog: ComponentType<ShareDialogProps>
  ErrorFallback: ComponentType<{ error: Error; reset: () => void }>
  AddSharedDialog: ComponentType<{ isOpen: boolean; onClose: () => void }>
  WinddownOverlay: ComponentType
  CoachmarkLayer: ComponentType
  contributeTips(tips: readonly CoachTip[]): () => void
  WhatsNewButton: ComponentType
}

let host: WorkbenchHost | null = null

/** The host app provides its adapter once at boot (idempotent). */
export function setWorkbenchHost(next: WorkbenchHost): void {
  host = next
}

export function workbenchHost(): WorkbenchHost {
  if (!host) {
    throw new Error(
      '[workbench] workbenchHost() before setWorkbenchHost — the host app must provide its adapter at boot'
    )
  }
  return host
}
