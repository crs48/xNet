import type { Meta, StoryObj } from '@storybook/react-vite'
import { SystemMenu } from './SystemMenu'

const meta = {
  title: 'Electron/SystemMenu',
  component: SystemMenu,
  parameters: {
    layout: 'centered'
  },
  args: {
    recentDocuments: [
      { id: 'page-1', title: 'Planning notes', type: 'page' },
      { id: 'database-1', title: 'Roadmap tracker', type: 'database' },
      { id: 'canvas-1', title: 'Workspace Canvas', type: 'canvas' }
    ],
    onOpenDocument: () => undefined,
    onOpenSettings: () => undefined,
    onAddShared: () => undefined,
    onToggleDebugPanel: () => undefined
  }
} satisfies Meta<typeof SystemMenu>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const EmptyRecent: Story = {
  args: {
    recentDocuments: []
  }
}
