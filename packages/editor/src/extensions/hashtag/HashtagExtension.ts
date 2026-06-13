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
import { Plugin, PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { TaskMentionMenu, type TaskMentionSuggestion } from '../../components/TaskMentionMenu'
import { createSuggestionPopupRender } from '../suggestion-popup'

export { updateSuggestionPopup as updateHashtagPopup } from '../suggestion-popup'

const HashtagSuggestionPluginKey = new PluginKey('hashtagSuggestion')
const HashtagClickPluginKey = new PluginKey('hashtagClick')

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
  /** Clicking a hashtag pill navigates here (an `xnet://tag/<id>` href). */
  onNavigate: (href: string) => void
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
      onNavigate: () => {},
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
        class: 'hashtag cursor-pointer'
      }),
      `#${String(HTMLAttributes.name ?? '')}`
    ]
  },

  // Pills degrade to plain `#name` text on markdown export; raw '#' text is
  // never parsed back into tags (structured-tags invariant, 0169).
  renderMarkdown: (node) => `#${String(node.attrs?.name ?? '')}`,

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
        render: createSuggestionPopupRender<TaskMentionSuggestion>(TaskMentionMenu)
      }),
      // Clicking a hashtag pill opens that tag's page (0172).
      new Plugin({
        key: HashtagClickPluginKey,
        props: {
          handleClick: (_view, _pos, event) => {
            const el = (event.target as HTMLElement | null)?.closest?.('[data-hashtag]')
            const tagId = el?.getAttribute('data-tag-id')?.trim()
            if (!tagId) return false
            event.preventDefault()
            this.options.onNavigate(`xnet://tag/${tagId}`)
            return true
          }
        }
      })
    ]
  }
})
