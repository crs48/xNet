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
import { RoomSection } from '../comms/RoomSection'
import { FormInboxItem, InboxBellItem, PresenceStatusItem } from '../comms/StatusItems'
import { AppLinkUpres } from '../components/AppLinkUpres'
import { Workbench } from '../workbench/Workbench'

export const Route = createRootRoute({
  component: RootLayout
})

function RootLayout() {
  return (
    <CommsProvider>
      <CallProvider>
        <AppLinkUpres>
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
  )
}
