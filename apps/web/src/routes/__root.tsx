/**
 * Root layout — the xNet Workbench (exploration 0166) wrapped in the
 * comms layer (explorations 0167/0168).
 *
 * CommsProvider owns presence rooms and the notifier; CallProvider owns
 * the active call. The CommsDock mounts OUTSIDE the router outlet so an
 * active call survives navigation; RoomSection and the status items
 * publish into shell contribution points.
 */
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { CallProvider, CommsDock } from '../comms/CallDock'
import { CommsProvider } from '../comms/CommsContext'
import { useSharedRoomBootSync } from '../comms/hooks'
import { RoomSection } from '../comms/RoomSection'
import { FormInboxItem, InboxBellItem, PresenceStatusItem } from '../comms/StatusItems'
import { AppLinkUpres } from '../components/AppLinkUpres'
import { registerWebHostedViews } from '../platform/hosted-views'
import { useWebPlatformPort } from '../platform/web-platform'
import { setWebWorkbenchHost } from '../platform/workbench-host'
import { PlatformProvider } from '../workbench/platform'
import { Workbench } from '../workbench/Workbench'

// The shell renders tab content through the view registry and reaches app
// services through the WorkbenchHost (0406); fill both before anything under
// the root layout renders.
registerWebHostedViews()
setWebWorkbenchHost()

export const Route = createRootRoute({
  component: RootLayout
})

/**
 * Keeps shared channels/workspaces receiving edits across reloads (0298).
 * Mounted inside CommsProvider so it stays alive for the whole session.
 */
function SharedRoomBootSync(): null {
  useSharedRoomBootSync()
  return null
}

function RootLayout() {
  // The shell reaches the router only through this port (exploration 0406) —
  // the same components will mount on desktop over a ShellState-backed port.
  const platform = useWebPlatformPort()
  return (
    <PlatformProvider value={platform}>
      <CommsProvider>
        <CallProvider>
          <AppLinkUpres>
            <SharedRoomBootSync />
            <RoomSection />
            <InboxBellItem />
            <PresenceStatusItem />
            <FormInboxItem />
            <Workbench>
              <Outlet />
            </Workbench>
            <CommsDock />
          </AppLinkUpres>
        </CallProvider>
      </CommsProvider>
    </PlatformProvider>
  )
}
