/**
 * Inline #hashtag pills (exploration 0169).
 *
 * Mirrors TaskMentionExtension: typing '#' opens a suggestion popup
 * listing existing tags (autocomplete-first — the cheapest anti-sprawl
 * mechanism) with a trailing "create" entry when the query is a usable
 * new name. A picked tag becomes an atomic inline pill whose `id` attr
 * is the Tag node id — body text is never parsed for '#' (the
 * structured-mentions invariant from 0168 applied to tags). Rename a
 * Tag node and every pill rendering follows the node, since extraction
 * is by id.
 */
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

const HashtagSuggestionPluginKey = new PluginKey('hashtagSuggestion')

/** Sentinel id for the trailing "create new tag" menu entry. */
export const CREATE_HASHTAG_ID = '__create-hashtag__'

export interface HashtagSuggestion {
  /** Tag node id */
  id: string
  /** Normalized tag name (no leading '#') */
  name: string
}

export interface HashtagOptions {
  getSuggestions: () => HashtagSuggestion[]
  /** Create a Tag node for a new name; resolve null to abort the insert */
  createTag?: (name: string) => Promise<HashtagSuggestion | null>
  /** Normalize a raw query into a usable tag name ('' = unusable) */
  normalizeName: (raw: string) => string
  HTMLAttributes: Record<string, string>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    hashtag: {
      setHashtag: (tag: HashtagSuggestion) => ReturnType
    }
  }
}

export function filterHashtagSuggestions(
  items: HashtagSuggestion[],
  query: string,
  normalizeName: (raw: string) => string
): TaskMentionSuggestion[] {
  const normalized = normalizeName(query)
  const matches: TaskMentionSuggestion[] = (
    normalized ? items.filter((item) => item.name.includes(normalized)) : items
  )
    .slice(0, 8)
    .map((item) => ({ id: item.id, label: `#${item.name}` }))

  const exact = items.some((item) => item.name === normalized)
  if (normalized && !exact) {
    matches.push({ id: CREATE_HASHTAG_ID, label: `#${normalized}`, subtitle: 'Create new tag' })
  }
  return matches
}

/** Map a picked menu entry back to a HashtagSuggestion. */
export function hashtagFromMenuItem(item: TaskMentionSuggestion): HashtagSuggestion {
  return { id: item.id, name: item.label.replace(/^#/, '') }
}

type SuggestionRenderProps = {
  items: TaskMentionSuggestion[]
  command: (item: TaskMentionSuggestion) => void
  clientRect?: (() => DOMRect | null) | null
}

interface PopupComponentLike {
  updateProps(props: Record<string, unknown>): void
}

interface PopupInstanceLike {
  setProps(props: Record<string, unknown>): void
}

/** Suggestion-popup update step, shared by onUpdate (exported for tests). */
export function updateHashtagPopup(
  component: PopupComponentLike | null,
  popup: PopupInstanceLike[] | null,
  props: SuggestionRenderProps
): void {
  if (!component) return
  component.updateProps({
    items: props.items,
    command: (item: TaskMentionSuggestion) => props.command(item)
  })
  if (props.clientRect && popup?.[0]) {
    popup[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect })
  }
}

export const HashtagExtension = Node.create<HashtagOptions>({
  name: 'hashtag',

  inline: true,

  group: 'inline',

  atom: true,

  selectable: true,

  addOptions() {
    return {
      getSuggestions: () => [],
      createTag: undefined,
      normalizeName: (raw: string) => raw.trim().toLowerCase(),
      HTMLAttributes: {}
    }
  },

  addAttributes() {
    return {
      id: { default: null },
      name: { default: null }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-hashtag]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-hashtag': '',
        'data-tag-id': HTMLAttributes.id,
        class: 'hashtag'
      }),
      `#${String(HTMLAttributes.name ?? '')}`
    ]
  },

  addCommands() {
    return {
      setHashtag:
        (tag: HashtagSuggestion) =>
        ({ commands }) => {
          return commands.insertContent([
            { type: 'hashtag', attrs: { id: tag.id, name: tag.name } },
            { type: 'text', text: ' ' }
          ])
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<TaskMentionSuggestion>({
        editor: this.editor,
        pluginKey: HashtagSuggestionPluginKey,
        char: '#',
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) =>
          filterHashtagSuggestions(
            this.options.getSuggestions(),
            query,
            this.options.normalizeName
          ),
        command: ({ editor, range, props }) => {
          if (props.id !== CREATE_HASHTAG_ID) {
            editor.chain().focus().deleteRange(range).setHashtag(hashtagFromMenuItem(props)).run()
            return
          }
          const name = hashtagFromMenuItem(props).name
          editor.chain().focus().deleteRange(range).run()
          void this.options.createTag?.(name).then((tag) => {
            if (tag) editor.chain().focus().setHashtag(tag).run()
          })
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
              updateHashtagPopup(component, popup, props)
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
