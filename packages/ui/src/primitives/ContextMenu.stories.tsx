import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowRight, Copy, FolderInput, Pencil, Trash2 } from 'lucide-react'
import { ActionMenuList, type Action } from '../composed/ActionMenu'
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from './ContextMenu'

const meta = {
  title: 'UI/Primitives/ContextMenu',
  component: ContextMenu,
  args: {
    children: null,
    menu: null
  }
} satisfies Meta<typeof ContextMenu>

export default meta

type Story = StoryObj<typeof meta>

const Target = ({ label }: { label: string }) => (
  <div className="flex h-24 w-64 items-center justify-center rounded-md border border-dashed border-border bg-surface-1 text-sm text-ink-2">
    {label}
  </div>
)

/** Raw primitive: hand-assembled items. */
export const Primitive: Story = {
  render: () => (
    <ContextMenu
      menu={
        <>
          <ContextMenuItem>
            <Pencil />
            <span className="flex-1">Rename…</span>
          </ContextMenuItem>
          <ContextMenuItem>
            <Copy />
            <span className="flex-1">Duplicate</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem danger>
            <Trash2 />
            <span className="flex-1">Delete</span>
          </ContextMenuItem>
        </>
      }
    >
      <Target label="Right-click me" />
    </ContextMenu>
  )
}

/** Descriptor-driven: the same list a kebab would render, via ActionMenuList. */
export const FromDescriptors: Story = {
  render: () => {
    const actions: Action[] = [
      { id: 'rename', label: 'Rename…', icon: <Pencil />, shortcut: 'F2' },
      {
        id: 'move',
        label: 'Move to',
        icon: <FolderInput />,
        children: [
          { id: 'move-personal', label: 'Personal', icon: <ArrowRight /> },
          { id: 'move-team', label: 'Team', icon: <ArrowRight /> }
        ]
      },
      { id: '---', label: '' },
      { id: 'delete', label: 'Delete', icon: <Trash2 />, danger: true }
    ]
    return (
      <ContextMenu menu={<ActionMenuList actions={actions} />}>
        <Target label="Right-click for actions" />
      </ContextMenu>
    )
  }
}
