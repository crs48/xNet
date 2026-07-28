/**
 * A stub {@link PlatformPort} for tests (exploration 0406).
 *
 * Components stopped importing the router directly — they read the port — so
 * tests stop mocking `@tanstack/react-router` and provide this instead. The
 * stub records navigations for assertion and renders links as plain anchors
 * carrying their target/search as data attributes.
 *
 * Named `test-platform`, not `platform.test`, so vitest's include glob does
 * not collect it as a suite.
 */

import type { SpacesApi, WorkbenchHost } from './host'
import type { NavigateOptions, NavTarget, PlatformCapabilities, PlatformPort } from './platform'
import type { ReactNode } from 'react'
import React from 'react'
import { PlatformProvider } from './platform'

export interface TestPlatformOptions {
  /** Static pathname, or a getter for tests that mutate it between renders. */
  pathname?: string | (() => string)
  search?: Record<string, unknown> | (() => Record<string, unknown>)
  capabilities?: Partial<PlatformCapabilities>
}

export interface TestPlatform {
  port: PlatformPort
  /** Every navigate the component issued, in order. */
  navigations: Array<{ target: NavTarget; options?: NavigateOptions }>
}

const DEFAULT_CAPABILITIES: PlatformCapabilities = {
  nativeMenus: false,
  meetingsCapture: false,
  agentBridge: false,
  filesystem: false,
  urlAddressable: true
}

export function createTestPlatform(options: TestPlatformOptions = {}): TestPlatform {
  const navigations: TestPlatform['navigations'] = []
  const readPathname = () =>
    typeof options.pathname === 'function' ? options.pathname() : (options.pathname ?? '/')
  const readSearch = () =>
    typeof options.search === 'function' ? options.search() : (options.search ?? {})

  const port: PlatformPort = {
    navigate: (target, navOptions) => {
      navigations.push({ target, ...(navOptions ? { options: navOptions } : {}) })
    },
    usePathname: readPathname,
    useSearch: readSearch,
    Link: ({
      target,
      search,
      children,
      className,
      title,
      onClick,
      draggable,
      onDragStart,
      'data-testid': testId
    }) => (
      <a
        className={className}
        title={title}
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        data-testid={testId}
        data-target={JSON.stringify(target)}
        data-search={search ? JSON.stringify(search) : undefined}
      >
        {children}
      </a>
    ),
    capabilities: { ...DEFAULT_CAPABILITIES, ...options.capabilities }
  }
  return { port, navigations }
}

/** Provider wrapper for `render`/`renderHook`. */
export function TestPlatformProvider({
  platform,
  children
}: {
  platform: TestPlatform
  children: ReactNode
}): React.ReactElement {
  return <PlatformProvider value={platform.port}>{children}</PlatformProvider>
}

const NullComponent = (): null => null

/**
 * An inert {@link WorkbenchHost} for tests: empty data, null components,
 * every action a no-op. Install with `setWorkbenchHost(createTestWorkbenchHost())`
 * before rendering chrome that reads the host adapter.
 */
export function createTestWorkbenchHost(overrides: Partial<WorkbenchHost> = {}): WorkbenchHost {
  const spacesApi: SpacesApi = {
    allSpaces: [],
    spaces: [],
    tree: [],
    getSpace: () => null,
    createSpace: async () => null,
    renameSpace: async () => undefined,
    updateSpace: async () => undefined,
    archiveSpace: async () => undefined,
    setSpaceParent: async () => undefined,
    setNodeSpace: async () => undefined,
    setSpaceVisibility: async () => undefined
  }
  return {
    logout: async () => undefined,
    useSpaces: () => spacesApi,
    useRequestCount: () => 0,
    useStorageStatus: () => null,
    useCreateInSpace: () => async () => undefined,
    useWorkspaceTags: () => ({ allTags: [] }),
    useNodeActions: () => [],
    comms: {
      useComms: () => {
        throw new Error('[test-host] no comms provider in tests')
      },
      useCommsMaybe: () => null,
      useChannels: () => ({ channels: [], loading: false }),
      useInbox: () => ({ items: [], state: {} }),
      useProfiles: () => [],
      useEnsureProfiles: () => undefined,
      displayName: (did) => did,
      channelLabel: (channel) => channel.name ?? channel.id,
      colorForDid: () => '#888888',
      ChatsPanel: NullComponent,
      InboxTray: NullComponent
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
      MetricEditor: NullComponent
    },
    SelfAvatar: NullComponent,
    ShareDialog: NullComponent,
    GlobalSearch: NullComponent,
    WorkspaceCommands: NullComponent,
    UndoToastProvider: ({ children }) => <>{children}</>,
    useUndoToast: () => ({ showUndoToast: () => undefined }),
    ErrorFallback: NullComponent,
    AddSharedDialog: NullComponent,
    WinddownOverlay: NullComponent,
    CoachmarkLayer: NullComponent,
    contributeTips: () => () => undefined,
    WhatsNewButton: NullComponent,
    ...overrides
  }
}
