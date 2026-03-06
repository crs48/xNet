import { Node, mergeAttributes } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import Suggestion from '@tiptap/suggestion'
import tippy, { type Instance, type Props as TippyProps } from 'tippy.js'
import {
  TaskMentionMenu,
  type TaskMentionMenuRef,
  type TaskMentionSuggestion
} from '../../components/TaskMentionMenu'

const TaskMentionSuggestionPluginKey = new PluginKey('taskMentionSuggestion')

function truncateDid(value: string): string {
  return value.startsWith('did:') ? `${value.slice(0, 14)}...${value.slice(-6)}` : value
}

function getDisplayLabel(item: TaskMentionSuggestion): string {
  return item.label.trim() || truncateDid(item.id)
}

function filterSuggestions(items: TaskMentionSuggestion[], query: string): TaskMentionSuggestion[] {
  const search = query.toLowerCase().trim()
  if (!search) return items.slice(0, 8)

  return items
    .filter((item) => {
      return (
        item.id.toLowerCase().includes(search) ||
        item.label.toLowerCase().includes(search) ||
        item.subtitle?.toLowerCase().includes(search)
      )
    })
    .slice(0, 8)
}

export interface TaskMentionOptions {
  getSuggestions: () => TaskMentionSuggestion[]
  HTMLAttributes: Record<string, string>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    taskMention: {
      setTaskMention: (mention: TaskMentionSuggestion) => ReturnType
    }
  }
}

export const TaskMentionExtension = Node.create<TaskMentionOptions>({
  name: 'taskMention',

  inline: true,

  group: 'inline',

  atom: true,

  selectable: true,

  addOptions() {
    return {
      getSuggestions: () => [],
      HTMLAttributes: {}
    }
  },

  addAttributes() {
    return {
      id: { default: null },
      label: { default: null },
      subtitle: { default: null },
      color: { default: null }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-task-mention]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const label =
      typeof HTMLAttributes.label === 'string' && HTMLAttributes.label.length > 0
        ? HTMLAttributes.label
        : truncateDid(String(HTMLAttributes.id ?? ''))

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-task-mention': '',
        'data-mention-id': HTMLAttributes.id,
        class: 'task-mention'
      }),
      `@${label}`
    ]
  },

  addCommands() {
    return {
      setTaskMention:
        (mention: TaskMentionSuggestion) =>
        ({ commands }) => {
          return commands.insertContent([
            {
              type: 'taskMention',
              attrs: {
                id: mention.id,
                label: getDisplayLabel(mention),
                subtitle: mention.subtitle ?? null,
                color: mention.color ?? null
              }
            },
            {
              type: 'text',
              text: ' '
            }
          ])
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<TaskMentionSuggestion>({
        editor: this.editor,
        pluginKey: TaskMentionSuggestionPluginKey,
        char: '@',
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => filterSuggestions(this.options.getSuggestions(), query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).setTaskMention(props).run()
        },
        render: () => {
          let component: ReactRenderer<TaskMentionMenuRef> | null = null
          let popup: Instance<TippyProps>[] | null = null

          return {
            onStart: (props) => {
              component = new ReactRenderer(TaskMentionMenu, {
                props: {
                  items: props.items,
                  command: (item: TaskMentionSuggestion) => props.command(item)
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

            onUpdate(props) {
              if (!component) return

              component.updateProps({
                items: props.items,
                command: (item: TaskMentionSuggestion) => props.command(item)
              })

              if (props.clientRect && popup?.[0]) {
                popup[0].setProps({
                  getReferenceClientRect: props.clientRect as () => DOMRect
                })
              }
            },

            onKeyDown(props) {
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

export type { TaskMentionSuggestion }
