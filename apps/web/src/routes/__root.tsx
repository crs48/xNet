/**
 * Root layout — the xNet Workbench (exploration 0166).
 *
 * Rail · Left Panel · Editor Area · Right Panel · Bottom Panel ·
 * Status Bar. The router outlet renders inside the editor area's
 * active group; everything else is shell.
 */
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Workbench } from '../workbench/Workbench'

export const Route = createRootRoute({
  component: RootLayout
})

function RootLayout() {
  return (
    <Workbench>
      <Outlet />
    </Workbench>
  )
}
