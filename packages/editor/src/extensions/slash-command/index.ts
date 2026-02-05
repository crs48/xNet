import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import Suggestion from '@tiptap/suggestion'
import tippy, { type Instance, type Props as TippyProps } from 'tippy.js'
import { SlashMenu, type SlashMenuRef } from '../../components/SlashMenu'
import { filterCommands, type SlashCommandItem } from './items'

export const slashCommandPluginKey = new PluginKey('slashCommand')

export interface SlashCommandOptions {
  /** Custom suggestion trigger character */
  char?: string
  /**
   * Custom commands to use instead of built-in commands.
   * When provided, these commands replace the default `filterCommands` behavior.
   * Use this to pass merged built-in + plugin commands.
   */
  commands?: SlashCommandItem[]
}

/**
 * SlashCommand extension for Notion-style command palette.
 *
 * Triggered by typing `/` at the start of a line or after a space.
 * Shows a filterable menu of block types and commands.
 *
 * @example Default usage (built-in commands only)
 * ```tsx
 * SlashCommand.configure({ char: '/' })
 * ```
 *
 * @example With plugin commands
 * ```tsx
 * const allCommands = useSlashCommands({ getContributions: () => pluginCommands })
 * SlashCommand.configure({ commands: allCommands })
 * ```
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      char: '/',
      commands: undefined
    }
  },

  addProseMirrorPlugins() {
    const customCommands = this.options.commands

    // Filter function: uses custom commands if provided, else falls back to built-in
    const getFilteredCommands = (query: string): SlashCommandItem[] => {
      if (customCommands) {
        const search = query.toLowerCase().trim()
        if (!search) return customCommands

        return customCommands.filter((item) => {
          if (item.title.toLowerCase().includes(search)) return true
          if (item.searchTerms?.some((term) => term.includes(search))) return true
          if (item.description.toLowerCase().includes(search)) return true
          return false
        })
      }
      return filterCommands(query)
    }

    return [
      Suggestion({
        editor: this.editor,
        pluginKey: slashCommandPluginKey,
        char: this.options.char || '/',
        allowSpaces: false,
        startOfLine: false,

        items: ({ query }: { query: string }) => getFilteredCommands(query),

        command: ({ editor, range, props }: { editor: any; range: any; props: any }) => {
          props.command({ editor, range })
        },

        render: () => {
          let component: ReactRenderer<SlashMenuRef> | null = null
          let popup: Instance<TippyProps>[] | null = null

          return {
            onStart: (props: any) => {
              component = new ReactRenderer(SlashMenu, {
                props: {
                  items: props.items,
                  command: (item: SlashCommandItem) => props.command(item)
                },
                editor: props.editor
              })

              if (!props.clientRect) return

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                theme: 'slash-menu',
                maxWidth: 'none',
                popperOptions: {
                  modifiers: [
                    { name: 'flip', enabled: true },
                    { name: 'preventOverflow', enabled: true }
                  ]
                }
              })
            },

            onUpdate(props: any) {
              if (!component) return

              component.updateProps({
                items: props.items,
                command: (item: SlashCommandItem) => props.command(item)
              })

              if (props.clientRect && popup?.[0]) {
                popup[0].setProps({
                  getReferenceClientRect: props.clientRect as () => DOMRect
                })
              }
            },

            onKeyDown(props: any) {
              if (props.event.key === 'Escape') {
                popup?.[0]?.hide()
                return true
              }

              return component?.ref?.onKeyDown(props.event) ?? false
            },

            onExit() {
              popup?.[0]?.destroy()
              component?.destroy()
              popup = null
              component = null
            }
          }
        }
      })
    ]
  }
})

// Re-exports
export { COMMAND_GROUPS, getAllCommands, filterCommands } from './items'
export type { SlashCommandItem, SlashCommandGroup } from './items'
