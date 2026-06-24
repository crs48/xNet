import { CommandPalette, type PaletteCommand } from '@xnetjs/ui'

const commands: PaletteCommand[] = [
  {
    id: 'new-document',
    name: 'New Document',
    description: 'Create a document in the current space.',
    icon: 'file-plus',
    shortcut: '⌘N',
    group: 'Workspace',
    execute: () => undefined
  },
  {
    id: 'new-channel',
    name: 'New Channel',
    description: 'Start a channel for a team or topic.',
    icon: 'message-square',
    shortcut: '⇧⌘C',
    group: 'Workspace',
    execute: () => undefined
  },
  {
    id: 'open-settings',
    name: 'Open Settings',
    description: 'Jump to the shared settings surface.',
    icon: 'settings',
    shortcut: '⌘,',
    group: 'Navigation',
    execute: () => undefined
  },
  {
    id: 'invite-people',
    name: 'Invite People',
    description: 'Add members to this workspace.',
    icon: 'users',
    group: 'Navigation',
    execute: () => undefined
  },
  {
    id: 'sync-status',
    name: 'View Sync Status',
    description: 'Inspect hub connection and pending changes.',
    icon: 'activity',
    group: 'Diagnostics',
    execute: () => undefined
  }
]

const builtinCommands: PaletteCommand[] = [
  {
    id: 'search-everywhere',
    name: 'Search Everywhere',
    description: 'Search across documents, channels, and people.',
    icon: 'search',
    shortcut: '⌘K',
    group: 'Built in',
    execute: () => undefined
  }
]

export const Open = () => (
  <CommandPalette
    commands={commands}
    builtinCommands={builtinCommands}
    open
    placeholder="Type a command or search…"
  />
)
