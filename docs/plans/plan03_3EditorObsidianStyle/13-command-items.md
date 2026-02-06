# 13: Command Items

> Definition of all slash commands and their implementations

**Duration:** 0.5 days  
**Dependencies:** [11-slash-extension.md](./11-slash-extension.md), [12-command-menu.md](./12-command-menu.md)

## Overview

This document defines all the slash commands available in the editor. Commands are organized into groups and each includes an icon, description, search terms, and the action to perform.

## Implementation

### 1. Command Types

```typescript
// packages/editor/src/extensions/slash-command/types.ts

import type { Editor } from '@tiptap/core'
import type { Range } from '@tiptap/pm/model'

/**
 * A single slash command
 */
export interface SlashCommandItem {
  /** Unique identifier */
  id: string
  /** Display title */
  title: string
  /** Short description */
  description: string
  /** Icon (emoji, text, or React component) */
  icon: string | React.ComponentType<{ className?: string }>
  /** Alternative search terms */
  searchTerms?: string[]
  /** Keyboard shortcut hint */
  shortcut?: string
  /** Command to execute */
  command: (props: CommandProps) => void
}

/**
 * Props passed to command handlers
 */
export interface CommandProps {
  editor: Editor
  range: Range
}

/**
 * A group of related commands
 */
export interface SlashCommandGroup {
  /** Group name (displayed as header) */
  name: string
  /** Commands in this group */
  items: SlashCommandItem[]
}
```

### 2. Command Definitions

````typescript
// packages/editor/src/extensions/slash-command/items.ts

import type { SlashCommandItem, SlashCommandGroup, CommandProps } from './types'

/**
 * All slash commands organized by category
 */
export const COMMAND_GROUPS: SlashCommandGroup[] = [
  // ========================================
  // Basic Blocks
  // ========================================
  {
    name: 'Basic',
    items: [
      {
        id: 'text',
        title: 'Text',
        description: 'Plain text paragraph',
        icon: 'Aa',
        searchTerms: ['paragraph', 'p', 'plain', 'normal'],
        command: ({ editor, range }: CommandProps) => {
          editor.chain().focus().deleteRange(range).setParagraph().run()
        }
      },
      {
        id: 'heading-1',
        title: 'Heading 1',
        description: 'Large section heading',
        icon: 'H1',
        searchTerms: ['h1', 'title', 'large', 'header', '#'],
        shortcut: 'Cmd+Alt+1',
        command: ({ editor, range }: CommandProps) => {
          editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
        }
      },
      {
        id: 'heading-2',
        title: 'Heading 2',
        description: 'Medium section heading',
        icon: 'H2',
        searchTerms: ['h2', 'subtitle', 'medium', 'header', '##'],
        shortcut: 'Cmd+Alt+2',
        command: ({ editor, range }: CommandProps) => {
          editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
        }
      },
      {
        id: 'heading-3',
        title: 'Heading 3',
        description: 'Small section heading',
        icon: 'H3',
        searchTerms: ['h3', 'subheading', 'small', 'header', '###'],
        shortcut: 'Cmd+Alt+3',
        command: ({ editor, range }: CommandProps) => {
          editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
        }
      }
    ]
  },

  // ========================================
  // Lists
  // ========================================
  {
    name: 'Lists',
    items: [
      {
        id: 'bullet-list',
        title: 'Bullet List',
        description: 'Unordered list with bullets',
        icon: '•',
        searchTerms: ['ul', 'unordered', 'bullets', 'points', '-'],
        shortcut: 'Cmd+Shift+8',
        command: ({ editor, range }: CommandProps) => {
          editor.chain().focus().deleteRange(range).toggleBulletList().run()
        }
      },
      {
        id: 'numbered-list',
        title: 'Numbered List',
        description: 'Ordered list with numbers',
        icon: '1.',
        searchTerms: ['ol', 'ordered', 'numbers', 'sequence', '1.'],
        shortcut: 'Cmd+Shift+7',
        command: ({ editor, range }: CommandProps) => {
          editor.chain().focus().deleteRange(range).toggleOrderedList().run()
        }
      },
      {
        id: 'task-list',
        title: 'Task List',
        description: 'Checklist with checkboxes',
        icon: '[]',
        searchTerms: ['todo', 'checkbox', 'tasks', 'checklist', '[ ]'],
        command: ({ editor, range }: CommandProps) => {
          editor.chain().focus().deleteRange(range).toggleTaskList().run()
        }
      }
    ]
  },

  // ========================================
  // Blocks
  // ========================================
  {
    name: 'Blocks',
    items: [
      {
        id: 'quote',
        title: 'Quote',
        description: 'Blockquote for citations',
        icon: '"',
        searchTerms: ['blockquote', 'citation', 'pullquote', '>'],
        shortcut: 'Cmd+Shift+B',
        command: ({ editor, range }: CommandProps) => {
          editor.chain().focus().deleteRange(range).toggleBlockquote().run()
        }
      },
      {
        id: 'code-block',
        title: 'Code Block',
        description: 'Code with syntax highlighting',
        icon: '</>',
        searchTerms: ['code', 'pre', 'snippet', 'programming', '```'],
        shortcut: 'Cmd+Alt+C',
        command: ({ editor, range }: CommandProps) => {
          editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
        }
      },
      {
        id: 'divider',
        title: 'Divider',
        description: 'Horizontal line separator',
        icon: '—',
        searchTerms: ['hr', 'horizontal', 'rule', 'line', 'separator', '---'],
        command: ({ editor, range }: CommandProps) => {
          editor.chain().focus().deleteRange(range).setHorizontalRule().run()
        }
      }
    ]
  },

  // ========================================
  // Media (Future)
  // ========================================
  {
    name: 'Media',
    items: [
      {
        id: 'image',
        title: 'Image',
        description: 'Upload or embed an image',
        icon: '🖼️',
        searchTerms: ['img', 'picture', 'photo', 'upload'],
        command: ({ editor, range }: CommandProps) => {
          editor.chain().focus().deleteRange(range).run()

          // TODO: Open image upload dialog
          // For now, insert placeholder
          console.log('Image upload not yet implemented')
        }
      }
    ]
  }
]

/**
 * Get all commands as a flat array
 */
export function getAllCommands(): SlashCommandItem[] {
  return COMMAND_GROUPS.flatMap((group) => group.items)
}

/**
 * Filter commands by search query
 */
export function filterCommands(query: string): SlashCommandItem[] {
  const search = query.toLowerCase().trim()

  if (!search) {
    return getAllCommands()
  }

  return getAllCommands().filter((item) => {
    // Match title
    if (item.title.toLowerCase().includes(search)) return true

    // Match search terms
    if (item.searchTerms?.some((term) => term.toLowerCase().includes(search))) {
      return true
    }

    // Match description
    if (item.description.toLowerCase().includes(search)) return true

    return false
  })
}

/**
 * Filter command groups by search query
 */
export function filterCommandGroups(query: string): SlashCommandGroup[] {
  const search = query.toLowerCase().trim()

  if (!search) {
    return COMMAND_GROUPS
  }

  return COMMAND_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.title.toLowerCase().includes(search)) return true
      if (item.searchTerms?.some((term) => term.toLowerCase().includes(search))) {
        return true
      }
      if (item.description.toLowerCase().includes(search)) return true
      return false
    })
  })).filter((group) => group.items.length > 0)
}

/**
 * Get a command by ID
 */
export function getCommandById(id: string): SlashCommandItem | undefined {
  return getAllCommands().find((item) => item.id === id)
}
````

### 3. Custom Command Registration

Allow apps to register custom commands:

```typescript
// packages/editor/src/extensions/slash-command/registry.ts

import type { SlashCommandItem, SlashCommandGroup } from './types'
import { COMMAND_GROUPS } from './items'

class CommandRegistry {
  private customGroups: SlashCommandGroup[] = []
  private customItems: SlashCommandItem[] = []

  /**
   * Register a custom command
   */
  registerCommand(item: SlashCommandItem, groupName?: string): void {
    if (groupName) {
      // Add to existing or new group
      const group = this.customGroups.find((g) => g.name === groupName)
      if (group) {
        group.items.push(item)
      } else {
        this.customGroups.push({ name: groupName, items: [item] })
      }
    } else {
      this.customItems.push(item)
    }
  }

  /**
   * Register a custom group
   */
  registerGroup(group: SlashCommandGroup): void {
    this.customGroups.push(group)
  }

  /**
   * Get all groups including custom ones
   */
  getAllGroups(): SlashCommandGroup[] {
    const groups = [...COMMAND_GROUPS, ...this.customGroups]

    // Add ungrouped custom items to a "Custom" group
    if (this.customItems.length > 0) {
      groups.push({ name: 'Custom', items: this.customItems })
    }

    return groups
  }

  /**
   * Clear all custom registrations
   */
  clear(): void {
    this.customGroups = []
    this.customItems = []
  }
}

export const commandRegistry = new CommandRegistry()
```

### 4. Usage Example

```typescript
// In your app's setup
import { commandRegistry } from '@xnet/editor/extensions/slash-command'

// Register a custom command
commandRegistry.registerCommand(
  {
    id: 'custom-callout',
    title: 'Callout',
    description: 'Highlighted info box',
    icon: '💡',
    searchTerms: ['callout', 'info', 'warning', 'note'],
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'callout',
          content: [{ type: 'paragraph' }]
        })
        .run()
    }
  },
  'Custom Blocks'
)
```

## Tests

```typescript
// packages/editor/src/extensions/slash-command/items.test.ts

import { describe, it, expect } from 'vitest'
import {
  COMMAND_GROUPS,
  getAllCommands,
  filterCommands,
  filterCommandGroups,
  getCommandById
} from './items'

describe('slash command items', () => {
  describe('COMMAND_GROUPS', () => {
    it('should have at least one group', () => {
      expect(COMMAND_GROUPS.length).toBeGreaterThan(0)
    })

    it('should have items in each group', () => {
      COMMAND_GROUPS.forEach((group) => {
        expect(group.items.length).toBeGreaterThan(0)
      })
    })

    it('should have unique IDs', () => {
      const ids = getAllCommands().map((item) => item.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('should have required properties on each item', () => {
      getAllCommands().forEach((item) => {
        expect(item.id).toBeTruthy()
        expect(item.title).toBeTruthy()
        expect(item.description).toBeTruthy()
        expect(item.icon).toBeTruthy()
        expect(typeof item.command).toBe('function')
      })
    })
  })

  describe('getAllCommands', () => {
    it('should return flat array of all commands', () => {
      const commands = getAllCommands()
      const expectedCount = COMMAND_GROUPS.reduce((sum, group) => sum + group.items.length, 0)
      expect(commands.length).toBe(expectedCount)
    })
  })

  describe('filterCommands', () => {
    it('should return all commands when query is empty', () => {
      const result = filterCommands('')
      expect(result.length).toBe(getAllCommands().length)
    })

    it('should filter by title', () => {
      const result = filterCommands('heading')
      expect(result.length).toBeGreaterThan(0)
      expect(result.every((item) => item.title.toLowerCase().includes('heading'))).toBe(true)
    })

    it('should filter by search terms', () => {
      const result = filterCommands('todo')
      expect(result.some((item) => item.id === 'task-list')).toBe(true)
    })

    it('should filter by description', () => {
      const result = filterCommands('syntax')
      expect(result.some((item) => item.description.toLowerCase().includes('syntax'))).toBe(true)
    })

    it('should be case insensitive', () => {
      const lower = filterCommands('heading')
      const upper = filterCommands('HEADING')
      expect(lower).toEqual(upper)
    })

    it('should return empty array when no matches', () => {
      const result = filterCommands('xyznonexistent123')
      expect(result.length).toBe(0)
    })
  })

  describe('filterCommandGroups', () => {
    it('should return all groups when query is empty', () => {
      const result = filterCommandGroups('')
      expect(result.length).toBe(COMMAND_GROUPS.length)
    })

    it('should filter out empty groups', () => {
      const result = filterCommandGroups('heading')
      expect(result.every((group) => group.items.length > 0)).toBe(true)
    })

    it('should maintain group structure', () => {
      const result = filterCommandGroups('list')
      const listsGroup = result.find((g) => g.name === 'Lists')
      expect(listsGroup).toBeDefined()
      expect(listsGroup?.items.length).toBeGreaterThan(0)
    })
  })

  describe('getCommandById', () => {
    it('should return command by ID', () => {
      const command = getCommandById('heading-1')
      expect(command).toBeDefined()
      expect(command?.title).toBe('Heading 1')
    })

    it('should return undefined for unknown ID', () => {
      const command = getCommandById('nonexistent')
      expect(command).toBeUndefined()
    })
  })
})
```

## Checklist

- [ ] Define command types
- [ ] Create all command definitions
- [ ] Organize into groups
- [ ] Add search terms for each command
- [ ] Add keyboard shortcut hints
- [ ] Implement filterCommands
- [ ] Implement filterCommandGroups
- [ ] Create command registry for custom commands
- [ ] Write tests
- [ ] Tests pass

---

[Back to README](./README.md) | [Previous: Command Menu](./12-command-menu.md) | [Next: Drag Handle](./14-drag-handle.md)
