/**
 * Desktop's WorkbenchHost (0406) — the minimum the contract demands, honest
 * about what the desktop surface does not have yet.
 *
 * Real: workspace tags, Space-aware doc creation (through the PlatformPort),
 * identity avatar. Absent-by-design (renders an explicit empty state, never a
 * silent stub that looks like data): comms presence/chats/inbox, habits,
 * share links, coachmarks, wind-down, What's New — each arrives with its own
 * exploration, not as a side effect of the shell mount.
 */
import { CanvasSchema, DatabaseSchema, MapSchema, PageSchema, TagSchema } from '@xnetjs/data'
import { useIdentity, useMutate, useQuery } from '@xnetjs/react'
import {
  newDocId,
  setWorkbenchHost,
  useSpaces,
  type NavTarget,
  type WorkbenchHost
} from '@xnetjs/workbench'
import { useCallback, useMemo } from 'react'
import { AddSharedDialog, type AddSharedInput } from '../components/AddSharedDialog'
import { normalizeHubUrl, persistedHubUrl, setPersistedHubUrl } from '../lib/hub-url'

/** Deterministic presence-style color from a DID (same palette rule as web). */
function colorForDid(did: string): string {
  let hash = 0
  for (let i = 0; i < did.length; i++) hash = (hash * 31 + did.charCodeAt(i)) | 0
  return `hsl(${((hash % 360) + 360) % 360} 65% 55%)`
}

function SelfAvatar({ size = 32, className }: { size?: number; className?: string }) {
  const { did } = useIdentity()
  const initial = did
    ? did
        .replace(/^did:[a-z]+:/, '')
        .slice(0, 1)
        .toUpperCase()
    : '?'
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${className ?? ''}`}
      style={{ width: size, height: size, backgroundColor: did ? colorForDid(did) : '#888' }}
      title="You"
    >
      {initial}
    </span>
  )
}

function AbsentPanel({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-xs text-ink-3">
      {label}
    </div>
  )
}

const ChatsPanel = () => <AbsentPanel label="Chats arrive when comms lands on desktop." />
const InboxTray = () => <AbsentPanel label="The inbox arrives when comms lands on desktop." />
const Null = (): null => null

function DesktopErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-sm font-semibold text-ink-1">This view crashed</div>
      <div className="max-w-md break-words font-mono text-[11px] text-ink-3">{error.message}</div>
      <button
        type="button"
        onClick={reset}
        className="cursor-pointer rounded-md border border-hairline bg-surface-2 px-3 py-1.5 text-xs text-ink-1 hover:bg-surface-3"
      >
        Try again
      </button>
    </div>
  )
}

function ShareDialogPlaceholder({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-80 rounded-xl border border-hairline bg-surface-0 p-5 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-ink-1">Sharing</div>
        <p className="mt-2 text-xs text-ink-3">
          Share links arrive on desktop with hub connect — use the web app to share this document
          for now.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 cursor-pointer rounded-md border border-hairline bg-surface-2 px-3 py-1.5 text-xs text-ink-1"
        >
          Close
        </button>
      </div>
    </div>
  )
}

/** The schema each creatable type persists through (mirrors web's table). */
const CREATE_SCHEMAS = {
  page: { schema: PageSchema, seed: { title: 'Untitled' } },
  database: { schema: DatabaseSchema, seed: { title: 'Untitled Database' } },
  canvas: { schema: CanvasSchema, seed: { title: 'Untitled Canvas' } },
  map: { schema: MapSchema, seed: { title: 'Untitled Map' } }
} as const

export interface DesktopHostDeps {
  /** The shell's add-shared handler (join a shared doc/channel by link or id). */
  addShared: (input: AddSharedInput) => Promise<void>
}

/**
 * Build the desktop host. A hook because the createInSpace member needs the
 * live navigate function; App calls this once and registers the result.
 */
export function useDesktopWorkbenchHost(
  navigate: (target: NavTarget) => void,
  deps: DesktopHostDeps
): WorkbenchHost {
  const { create } = useMutate()
  const { addShared } = deps

  const useCreateInSpaceDesktop = useCallback(() => {
    return async (type: keyof typeof CREATE_SCHEMAS | string, spaceId: string | null) => {
      const entry = CREATE_SCHEMAS[type as keyof typeof CREATE_SCHEMAS]
      const id = newDocId()
      if (entry && spaceId) {
        await create(entry.schema, { ...entry.seed, space: spaceId }, id)
      } else if (entry) {
        await create(entry.schema, { ...entry.seed }, id)
      }
      navigate({ kind: 'node', nodeType: type as 'page', nodeId: id })
    }
  }, [create, navigate])

  return useMemo<WorkbenchHost>(
    () => ({
      logout: async () => {
        // Desktop has no lock/relock flow yet (identity lives in the OS keychain);
        // loud so a dead menu item is diagnosable, not mysterious.
        console.warn('[desktop-host] logout is not wired on desktop yet')
      },

      useStorageStatus: () => null, // native SQLite — the OPFS quota story is web's
      useCreateInSpace: useCreateInSpaceDesktop,
      useWorkspaceTags: function useWorkspaceTagsDesktop() {
        const { data } = useQuery(TagSchema)
        return {
          allTags: (data ?? []).map((node) => ({
            id: node.id,
            name: (node.name as string) ?? '',
            color: node.color as string | undefined,
            archived: node.archived as boolean | undefined
          }))
        }
      },

      hub: {
        configuredUrl: () => persistedHubUrl(''),
        connect: (raw) => {
          const trimmed = raw.trim()
          if (!trimmed) {
            setPersistedHubUrl('')
            return null
          }
          const url = normalizeHubUrl(trimmed)
          if (!url) return 'Enter a hub URL like wss://hub.example.com'
          setPersistedHubUrl(url)
          return null
        }
      },

      comms: {
        useComms: () => {
          throw new Error('[desktop-host] comms is not available on desktop yet')
        },
        useCommsMaybe: () => null,
        useChannels: () => ({ channels: [], loading: false }),
        useInbox: () => ({ items: [], state: {} }),
        useProfiles: () => [],
        useEnsureProfiles: () => undefined,
        displayName: (did, profiles) =>
          profiles.find((p) => p.did === did)?.name ?? did.slice(0, 16),
        channelLabel: (channel) => channel.name ?? channel.id,
        colorForDid,
        ChatsPanel,
        InboxTray
      },

      experiments: {
        useHabits: () => ({
          metrics: [],
          loading: false,
          today: 0,
          due: [],
          summaryFor: () => ({
            done: false,
            streak: 0,
            longest: 0,
            strength: 0,
            rate30: 0,
            completedDays: new Set<number>(),
            byDay: new Map()
          }),
          toggleHabit: async () => undefined,
          logValue: async () => undefined,
          setNote: async () => undefined,
          createHabit: async () => null,
          createMetric: async () => null
        }),
        isHabit: () => false,
        metricName: (metric) => metric.id,
        MetricEditor: Null
      },

      SelfAvatar,
      ShareDialog: ShareDialogPlaceholder,
      ErrorFallback: DesktopErrorFallback,
      // The real desktop join-by-link dialog, bound to the shell's handler —
      // reachable through the `share.addShared` command (AddSharedHost).
      AddSharedDialog: function AddSharedDialogHosted({ isOpen, onClose }) {
        return <AddSharedDialog isOpen={isOpen} onClose={onClose} onAdd={addShared} />
      },
      WinddownOverlay: Null,
      CoachmarkLayer: Null,
      contributeTips: () => () => undefined,
      WhatsNewButton: Null
    }),
    [useCreateInSpaceDesktop, addShared]
  )
}

export { setWorkbenchHost, useSpaces }
