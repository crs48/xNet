import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { TaskMentionMenu, type TaskMentionSuggestion } from '../../components/TaskMentionMenu'
import { createSuggestionPopupRender } from '../suggestion-popup'

const TaskMentionSuggestionPluginKey = new PluginKey('taskMentionSuggestion')
const TaskMentionClickPluginKey = new PluginKey('taskMentionClick')

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
        item.handle?.toLowerCase().includes(search) ||
        item.subtitle?.toLowerCase().includes(search)
      )
    })
    .slice(0, 8)
}

export interface TaskMentionOptions {
  getSuggestions: () => TaskMentionSuggestion[]
  /** Clicking a mention pill navigates here (an `xnet://person/<did>` href). */
  onNavigate: (href: string) => void
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
      onNavigate: () => {},
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
        class: 'task-mention cursor-pointer'
      }),
      `@${label}`
    ]
  },

  // Pills degrade to plain `@label` text on markdown export; body text is
  // never parsed back into mentions (composer-declared invariant, 0168).
  renderMarkdown: (node) => {
    const label = typeof node.attrs?.label === 'string' ? node.attrs.label : ''
    return `@${label || truncateDid(String(node.attrs?.id ?? ''))}`
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
        render: createSuggestionPopupRender<TaskMentionSuggestion>(TaskMentionMenu)
      }),
      // Clicking a mention pill opens that person (0172).
      new Plugin({
        key: TaskMentionClickPluginKey,
        props: {
          handleClick: (_view, _pos, event) => {
            const el = (event.target as HTMLElement | null)?.closest?.('[data-task-mention]')
            const did = el?.getAttribute('data-mention-id')?.trim()
            if (!did) return false
            event.preventDefault()
            this.options.onNavigate(`xnet://person/${did}`)
            return true
          }
        }
      })
    ]
  }
})

export type { TaskMentionSuggestion }
