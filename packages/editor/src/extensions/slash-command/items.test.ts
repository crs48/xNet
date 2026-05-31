import type { Editor } from '@tiptap/core'
import { describe, it, expect, vi } from 'vitest'
import { filterCommands, getAllCommands, COMMAND_GROUPS } from './items'

type CommandRecorder = {
  editor: Editor
  calls: string[]
  payloads: Map<string, unknown[]>
  commands: {
    setDatabaseEmbed: ReturnType<typeof vi.fn>
    setPageEmbed: ReturnType<typeof vi.fn>
  }
  extensions: Array<{
    name: string
    options: Record<string, unknown>
  }>
}

function getCommand(title: string) {
  const command = getAllCommands().find((item) => item.title === title)
  if (!command) {
    throw new Error(`Missing slash command: ${title}`)
  }
  return command
}

function createCommandRecorder(): CommandRecorder {
  const calls: string[] = []
  const payloads = new Map<string, unknown[]>()
  const extensions: CommandRecorder['extensions'] = []
  const commands = {
    setDatabaseEmbed: vi.fn(),
    setPageEmbed: vi.fn()
  }

  const record = (name: string, ...args: unknown[]) => {
    calls.push(name)
    payloads.set(name, args)
    return chain
  }

  const chain = {
    focus: () => record('focus'),
    deleteRange: (...args: unknown[]) => record('deleteRange', ...args),
    toggleCodeBlock: (...args: unknown[]) => record('toggleCodeBlock', ...args),
    insertContent: (...args: unknown[]) => record('insertContent', ...args),
    setCallout: (...args: unknown[]) => record('setCallout', ...args),
    setToggle: (...args: unknown[]) => record('setToggle', ...args),
    setTaskViewEmbed: (...args: unknown[]) => record('setTaskViewEmbed', ...args),
    run: () => {
      calls.push('run')
      return true
    }
  }

  return {
    calls,
    commands,
    extensions,
    payloads,
    editor: {
      chain: () => chain,
      commands,
      extensionManager: { extensions }
    } as unknown as Editor
  }
}

describe('slash command items', () => {
  const range = { from: 1, to: 2 }

  describe('COMMAND_GROUPS', () => {
    it('should have at least one group', () => {
      expect(COMMAND_GROUPS.length).toBeGreaterThan(0)
    })

    it('should have items in each group', () => {
      for (const group of COMMAND_GROUPS) {
        expect(group.items.length).toBeGreaterThan(0)
      }
    })

    it('should have required properties on each item', () => {
      for (const group of COMMAND_GROUPS) {
        for (const item of group.items) {
          expect(item.title).toBeTruthy()
          expect(item.description).toBeTruthy()
          expect(item.icon).toBeTruthy()
          expect(typeof item.command).toBe('function')
        }
      }
    })

    it('should include a page embed command in the data group', () => {
      const dataGroup = COMMAND_GROUPS.find((group) => group.name === 'Data')

      expect(dataGroup?.items.some((item) => item.title === 'Page')).toBe(true)
    })

    it('should include the expected editor insert targets', () => {
      expect(getAllCommands().map((item) => item.title)).toEqual(
        expect.arrayContaining(['Page', 'Database', 'Embed', 'Info', 'Toggle', 'Code Block'])
      )
    })
  })

  describe('getAllCommands', () => {
    it('should return all commands as flat array', () => {
      const commands = getAllCommands()
      const totalItems = COMMAND_GROUPS.reduce((sum, g) => sum + g.items.length, 0)
      expect(commands.length).toBe(totalItems)
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
      expect(
        result.every(
          (item) =>
            item.title.toLowerCase().includes('heading') ||
            item.searchTerms?.some((t) => t.includes('heading')) ||
            item.description.toLowerCase().includes('heading')
        )
      ).toBe(true)
    })

    it('should filter by search terms', () => {
      const result = filterCommands('todo')
      expect(result.some((item) => item.title === 'Task List')).toBe(true)
    })

    it('should be case insensitive', () => {
      const result1 = filterCommands('CODE')
      const result2 = filterCommands('code')
      expect(result1).toEqual(result2)
    })

    it('should return empty array when no matches', () => {
      const result = filterCommands('xyznonexistent')
      expect(result.length).toBe(0)
    })

    it('should filter by description', () => {
      const result = filterCommands('separator')
      expect(result.some((item) => item.title === 'Divider')).toBe(true)
    })
  })

  describe('command handlers', () => {
    it('inserts media embeds, callouts, toggles, code blocks, and task views from slash commands', () => {
      const recorder = createCommandRecorder()

      getCommand('Embed').command({ editor: recorder.editor, range })
      expect(recorder.payloads.get('insertContent')?.[0]).toMatchObject({
        type: 'embed',
        attrs: { url: null, provider: null, embedId: null, embedUrl: null }
      })

      getCommand('Info').command({ editor: recorder.editor, range })
      expect(recorder.payloads.get('setCallout')).toEqual(['info'])

      getCommand('Toggle').command({ editor: recorder.editor, range })
      expect(recorder.calls).toContain('setToggle')

      getCommand('Code Block').command({ editor: recorder.editor, range })
      expect(recorder.calls).toContain('toggleCodeBlock')

      getCommand('Task View').command({ editor: recorder.editor, range })
      expect(recorder.calls).toContain('setTaskViewEmbed')
    })

    it('inserts a selected database from the database slash command', async () => {
      const recorder = createCommandRecorder()
      const onSelectDatabase = vi.fn().mockResolvedValue('db-selected')
      recorder.extensions.push({
        name: 'databaseEmbed',
        options: { onSelectDatabase }
      })

      getCommand('Database').command({ editor: recorder.editor, range })
      await Promise.resolve()

      expect(onSelectDatabase).toHaveBeenCalledTimes(1)
      expect(recorder.commands.setDatabaseEmbed).toHaveBeenCalledWith({
        databaseId: 'db-selected'
      })
    })

    it('inserts a prompted page from the page slash command', () => {
      const recorder = createCommandRecorder()
      const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Launch Plan')

      getCommand('Page').command({ editor: recorder.editor, range })

      expect(prompt).toHaveBeenCalledWith('Page title or ID:')
      expect(recorder.commands.setPageEmbed).toHaveBeenCalledWith({
        pageId: 'default/launch-plan',
        title: 'Launch Plan',
        subtitle: 'Embedded page'
      })

      prompt.mockRestore()
    })
  })
})
