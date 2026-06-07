/**
 * Data workspace route.
 */

import { createFileRoute } from '@tanstack/react-router'
import { DataWorkspaceView } from '../components/DataWorkspaceView'

export const Route = createFileRoute('/data')({
  component: DataWorkspacePage
})

function DataWorkspacePage(): JSX.Element {
  return <DataWorkspaceView />
}
