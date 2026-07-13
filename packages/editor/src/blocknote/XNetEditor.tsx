/**
 * XNetEditor — the BlockNote-based collaborative editor (exploration 0312).
 *
 * Replaces the TipTap RichTextEditor. The persistence path is unchanged:
 * the host hands us the node's Y.Doc (via useNode) and we bind BlockNote's
 * Yjs collaboration to the `content-v4` fragment. Toolbar, slash menu,
 * side menu/drag handle, emoji picker and file panel are BlockNote
 * built-ins; xNet specifics (mentions, hashtags, wikilinks, embeds,
 * callouts, mermaid, math) are custom specs in ./specs.
 */
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import { BlockNoteView } from '@blocknote/mantine'
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem
} from '@blocknote/react'
import type { MessageLinkPreview } from '@xnetjs/data'
import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import '../styles/editor.css'
import { cn } from '../utils'
import {
  extractTagIds,
  getPageTasksSnapshot,
  type BlockLike,
  type PageTaskSnapshot
} from './doc-utils'
import {
  XNetEditorHostProvider,
  type DatabaseViewType,
  type TaskViewConfig,
  type TaskViewEmbedType,
  type XNetEditorHost
} from './host-context'
import {
  legacyFragmentToMarkdown,
  markLegacyImportDone,
  shouldImportLegacyContent
} from './legacy-import'
import { generateCursorColor, truncateDidLabel } from './presence'
import {
  EDITOR_DOCUMENT_FRAGMENT_FIELD,
  LEGACY_DOCUMENT_FRAGMENT_FIELD,
  createXNetSchema,
  type XNetEditorInstance
} from './schema'
import {
  filterHashtagSuggestions,
  CREATE_HASHTAG_ID,
  type HashtagSuggestion
} from './specs/hashtag'
import {
  filterMentionSuggestions,
  getMentionDisplayLabel,
  type TaskMentionSuggestion
} from './specs/mention'
import {
  matchWikilinkTargets,
  parseWikilinkQuery,
  CREATE_WIKILINK_ID,
  type WikilinkTarget
} from './specs/wikilink'

export interface XNetEditorProps {
  /** The node's Y.Doc (persistence + sync handled by useNode). */
  ydoc: Y.Doc
  /** Y.XmlFragment field for the v4 document (default 'content-v4'). */
  field?: string
  /** Legacy v3 fragment lazily imported when the v4 field is empty. */
  legacyField?: string
  placeholder?: string
  className?: string
  editorLabel?: string
  readOnly?: boolean
  /** Yjs Awareness for cursor presence. */
  awareness?: Awareness
  /** Local user's DID (cursor label/color). */
  did?: string
  /** Display name for the collaboration cursor (0298 profile label). */
  userLabel?: string
  onNavigate?: (href: string) => void
  /** Image upload → stored src URL (CID-backed). */
  onImageUpload?: (file: File) => Promise<{ src: string; width?: number; height?: number; cid?: string }>
  /** File upload → stored file metadata. */
  onFileUpload?: (file: File) => Promise<{ cid: string; name: string; mimeType: string; size: number }>
  /** Resolve stored file metadata to a downloadable URL. */
  onFileDownload?: (attrs: { cid: string; name: string; mimeType: string; size: number }) => Promise<string>
  /** Link preview resolver (0295), pasting peer only. */
  resolveLinkPreview?: (url: string) => Promise<MessageLinkPreview | null>
  renderDatabaseView?: (props: {
    databaseId: string
    viewType: DatabaseViewType
    viewConfig: Record<string, unknown>
  }) => React.ReactNode
  renderTaskView?: (props: {
    viewType: TaskViewEmbedType
    viewConfig: TaskViewConfig
    currentPageId: string | null
  }) => React.ReactNode
  taskViewPageId?: string | null
  onSelectDatabase?: () => Promise<string | null>
  resolveDatabaseMeta?: (databaseId: string) => Promise<{ title: string; icon?: string } | null>
  /** People offered by the `@` picker. */
  mentionSuggestions?: TaskMentionSuggestion[]
  /** Workspace tags offered by the `#` picker (0169). */
  hashtagSuggestions?: HashtagSuggestion[]
  onCreateHashtag?: (name: string) => Promise<HashtagSuggestion | null>
  normalizeHashtagName?: (raw: string) => string
  /** Linkable nodes offered by the `[[` typeahead (0170). */
  linkTargets?: WikilinkTarget[]
  onCreateLinkTarget?: (title: string) => Promise<WikilinkTarget | null>
  /** Structured tags write-through (0169). */
  onTagsChange?: (tagIds: string[]) => void
  /** Page-backed checklist snapshot (0103/0161, block-id keyed). */
  onPageTasksChange?: (tasks: PageTaskSnapshot[]) => void
  /** The editor instance, once created. */
  onEditorReady?: (editor: XNetEditorInstance) => void
  /** Backspace in an empty first block (return focus to the title). */
  onBackspaceAtStart?: () => boolean | void
  /** Force light/dark; defaults to detecting a `.dark` ancestor. */
  theme?: 'light' | 'dark'
}

function defaultNormalizeHashtagName(raw: string): string {
  return raw.trim().toLowerCase()
}

function useDetectedTheme(forced?: 'light' | 'dark'): {
  theme: 'light' | 'dark'
  containerRef: React.MutableRefObject<HTMLDivElement | null>
} {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [detected, setDetected] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    if (forced) return
    const el = containerRef.current
    if (!el) return
    const compute = () => setDetected(el.closest('.dark') ? 'dark' : 'light')
    compute()
    const observer = new MutationObserver(compute)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true
    })
    return () => observer.disconnect()
  }, [forced])

  return { theme: forced ?? detected, containerRef }
}

export function XNetEditor({
  ydoc,
  field = EDITOR_DOCUMENT_FRAGMENT_FIELD,
  legacyField = LEGACY_DOCUMENT_FRAGMENT_FIELD,
  placeholder = 'Start writing...',
  className,
  editorLabel = 'Rich text editor',
  readOnly = false,
  awareness,
  did,
  userLabel,
  onNavigate,
  onImageUpload,
  onFileUpload,
  onFileDownload,
  resolveLinkPreview,
  renderDatabaseView,
  renderTaskView,
  taskViewPageId = null,
  onSelectDatabase,
  resolveDatabaseMeta,
  mentionSuggestions = [],
  hashtagSuggestions = [],
  onCreateHashtag,
  normalizeHashtagName = defaultNormalizeHashtagName,
  linkTargets = [],
  onCreateLinkTarget,
  onTagsChange,
  onPageTasksChange,
  onEditorReady,
  onBackspaceAtStart,
  theme: forcedTheme
}: XNetEditorProps): JSX.Element {
  const { theme, containerRef } = useDetectedTheme(forcedTheme)

  // Latest-value refs so suggestion getters never go stale.
  const mentionRef = useRef(mentionSuggestions)
  const hashtagRef = useRef(hashtagSuggestions)
  const linkTargetsRef = useRef(linkTargets)
  const tagsSignatureRef = useRef('')
  const pageTaskSignatureRef = useRef('')
  useEffect(() => {
    mentionRef.current = mentionSuggestions
    hashtagRef.current = hashtagSuggestions
    linkTargetsRef.current = linkTargets
  })

  // Lazy legacy import (0312): convert the old TipTap fragment to markdown
  // once, before the editor binds, so initial render shows the content.
  const legacyMarkdown = useMemo(() => {
    if (!shouldImportLegacyContent(ydoc, field, legacyField)) return null
    return legacyFragmentToMarkdown(ydoc.getXmlFragment(legacyField))
  }, [ydoc, field, legacyField])

  const fragment = useMemo(() => ydoc.getXmlFragment(field), [ydoc, field])

  const uploadFile = useCallback(
    async (file: File): Promise<string | Record<string, unknown>> => {
      if (file.type.startsWith('image/') && onImageUpload) {
        const result = await onImageUpload(file)
        return result.src
      }
      if (onFileUpload) {
        const meta = await onFileUpload(file)
        return {
          props: {
            url: `xnet-blob://${meta.cid}?name=${encodeURIComponent(meta.name)}&type=${encodeURIComponent(meta.mimeType)}&size=${meta.size}`,
            name: meta.name
          }
        }
      }
      throw new Error('File uploads are not available on this surface')
    },
    [onImageUpload, onFileUpload]
  )

  const resolveFileUrl = useCallback(
    async (url: string): Promise<string> => {
      if (!url.startsWith('xnet-blob://') || !onFileDownload) return url
      const parsed = new URL(url.replace('xnet-blob://', 'https://cid.invalid/'))
      const cid = parsed.hostname === 'cid.invalid' ? parsed.pathname.slice(1) : parsed.hostname
      return onFileDownload({
        cid: cid || url.slice('xnet-blob://'.length).split('?')[0],
        name: parsed.searchParams.get('name') ?? 'file',
        mimeType: parsed.searchParams.get('type') ?? 'application/octet-stream',
        size: Number(parsed.searchParams.get('size') ?? 0)
      })
    },
    [onFileDownload]
  )

  const schema = useMemo(() => createXNetSchema(), [])

  const editor = useCreateBlockNote(
    {
      schema,
      collaboration: {
        fragment,
        user: {
          name: userLabel || (did ? truncateDidLabel(did) : 'Anonymous'),
          color: generateCursorColor(did ?? 'anonymous')
        },
        ...(awareness ? { provider: { awareness } } : {}),
        showCursorLabels: 'activity'
      },
      uploadFile,
      resolveFileUrl,
      dictionary: undefined,
      placeholders: { emptyDocument: placeholder, default: placeholder },
      tables: { splitCells: true, headers: true },
      // Sender-side paste interception (0295): a lone pasted URL becomes a
      // media embed (known provider) or a rich-link card (preview resolved
      // once, stored on the block).
      pasteHandler: ({ event, editor: pasteEditor, defaultPasteHandler }) => {
        const text = event.clipboardData?.getData('text/plain')?.trim()
        const html = event.clipboardData?.getData('text/html')
        if (!text || html || /\s/.test(text) || !/^https?:\/\//i.test(text)) {
          return defaultPasteHandler()
        }
        void import('@xnetjs/data').then(({ parseEmbedUrl }) => {
          const cursorBlock = pasteEditor.getTextCursorPosition().block
          if (parseEmbedUrl(text)) {
            pasteEditor.insertBlocks(
              [{ type: 'embed', props: { url: text } } as never],
              cursorBlock,
              'after'
            )
            return
          }
          if (resolveLinkPreview) {
            const inserted = pasteEditor.insertBlocks(
              [{ type: 'richLink', props: { url: text, preview: '' } } as never],
              cursorBlock,
              'after'
            )
            void resolveLinkPreview(text).then((preview) => {
              if (!preview) return
              const block = inserted[0]
              if (!block) return
              pasteEditor.updateBlock(block, {
                props: { preview: JSON.stringify(preview) }
              } as never)
            })
            return
          }
          // No preview resolver: fall back to a plain link paragraph.
          pasteEditor.insertBlocks(
            [
              {
                type: 'paragraph',
                content: [{ type: 'link', href: text, content: text }]
              } as never
            ],
            cursorBlock,
            'after'
          )
        })
        return true
      }
    },
    [schema, fragment, awareness, uploadFile, resolveFileUrl]
  )

  // One-time legacy import, after the editor exists (parse needs the schema).
  useEffect(() => {
    if (!legacyMarkdown || readOnly) return
    if (!shouldImportLegacyContent(ydoc, field, legacyField)) return
    void (async () => {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(legacyMarkdown)
        if (blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks)
        }
      } finally {
        markLegacyImportDone(ydoc)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  useEffect(() => {
    onEditorReady?.(editor as unknown as XNetEditorInstance)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  useEffect(() => {
    editor.isEditable = !readOnly
  }, [editor, readOnly])

  const host = useMemo<XNetEditorHost>(
    () => ({
      onNavigate,
      onFileDownload,
      renderDatabaseView,
      renderTaskView,
      taskViewPageId,
      onSelectDatabase,
      resolveDatabaseMeta,
      readOnly
    }),
    [
      onNavigate,
      onFileDownload,
      renderDatabaseView,
      renderTaskView,
      taskViewPageId,
      onSelectDatabase,
      resolveDatabaseMeta,
      readOnly
    ]
  )

  const handleChange = useCallback(() => {
    const blocks = editor.document as unknown as BlockLike[]
    if (onTagsChange) {
      const tagIds = extractTagIds(blocks)
      const signature = tagIds.join(' ')
      if (signature !== tagsSignatureRef.current) {
        tagsSignatureRef.current = signature
        onTagsChange(tagIds)
      }
    }
    if (onPageTasksChange) {
      const tasks = getPageTasksSnapshot(blocks, taskViewPageId ?? '')
      const signature = JSON.stringify(tasks)
      if (signature !== pageTaskSignatureRef.current) {
        pageTaskSignatureRef.current = signature
        onPageTasksChange(tasks)
      }
    }
  }, [editor, onTagsChange, onPageTasksChange, taskViewPageId])

  // --- Suggestion menus ---

  const getSlashItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const items: DefaultReactSuggestionItem[] = [
        ...getDefaultReactSlashMenuItems(editor),
        {
          title: 'Callout',
          subtext: 'Highlighted note (info, tip, warning…)',
          aliases: ['callout', 'info', 'warning', 'tip', 'note'],
          group: 'Basic blocks',
          onItemClick: () => {
            insertOrUpdateBlockForSlashMenu(editor, { type: 'callout' } as never)
          }
        },
        {
          title: 'Mermaid diagram',
          subtext: 'Flowcharts, sequence diagrams, …',
          aliases: ['mermaid', 'diagram', 'flowchart'],
          group: 'Advanced',
          onItemClick: () => {
            insertOrUpdateBlockForSlashMenu(editor, { type: 'mermaid' } as never)
          }
        },
        {
          title: 'Inline math',
          subtext: 'KaTeX expression',
          aliases: ['math', 'katex', 'latex', 'equation'],
          group: 'Advanced',
          onItemClick: () => {
            const latex = window.prompt('LaTeX expression')
            if (!latex) return
            editor.insertInlineContent([
              { type: 'inlineMath', props: { latex } } as never,
              ' '
            ])
          }
        },
        {
          title: 'Media embed',
          subtext: 'YouTube, Spotify, Vimeo… from a URL',
          aliases: ['embed', 'youtube', 'video', 'spotify'],
          group: 'Media',
          onItemClick: () => {
            const url = window.prompt('Paste a media URL')
            if (!url) return
            insertOrUpdateBlockForSlashMenu(editor, {
              type: 'embed',
              props: { url }
            } as never)
          }
        },
        {
          title: 'Task view',
          subtext: 'Embedded checklist of this page’s tasks',
          aliases: ['tasks', 'taskview', 'todo'],
          group: 'Advanced',
          onItemClick: () => {
            insertOrUpdateBlockForSlashMenu(editor, {
              type: 'taskViewEmbed',
              props: { viewType: 'list', config: JSON.stringify({ scope: 'page' }) }
            } as never)
          }
        }
      ]
      if (onSelectDatabase) {
        items.push({
          title: 'Database view',
          subtext: 'Inline table of a workspace database',
          aliases: ['database', 'table', 'board'],
          group: 'Advanced',
          onItemClick: () => {
            void onSelectDatabase().then((databaseId) => {
              if (!databaseId) return
              insertOrUpdateBlockForSlashMenu(editor, {
                type: 'databaseEmbed',
                props: { databaseId, viewType: 'table', viewConfig: '' }
              } as never)
            })
          }
        })
      }
      return filterSuggestionItems(items, query)
    },
    [editor, onSelectDatabase]
  )

  const getMentionItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> =>
      filterMentionSuggestions(mentionRef.current, query).map((person) => ({
        title: getMentionDisplayLabel(person),
        subtext: person.subtitle ?? person.handle,
        onItemClick: () => {
          editor.insertInlineContent([
            {
              type: 'mention',
              props: {
                id: person.id,
                label: getMentionDisplayLabel(person),
                subtitle: person.subtitle ?? '',
                color: person.color ?? ''
              }
            } as never,
            ' '
          ])
        }
      })),
    [editor]
  )

  const getHashtagItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const normalized = normalizeHashtagName(query)
      const matches = filterHashtagSuggestions(hashtagRef.current, normalized)
      const items: DefaultReactSuggestionItem[] = matches.map((tag) => ({
        title: `#${tag.name}`,
        onItemClick: () => {
          editor.insertInlineContent([
            { type: 'hashtag', props: { id: tag.id, name: tag.name } } as never,
            ' '
          ])
        }
      }))
      const exact = matches.some((tag) => tag.name === normalized)
      if (onCreateHashtag && normalized && !exact) {
        items.push({
          title: `Create #${normalized}`,
          badge: CREATE_HASHTAG_ID,
          onItemClick: () => {
            void onCreateHashtag(normalized).then((tag) => {
              if (!tag) return
              editor.insertInlineContent([
                { type: 'hashtag', props: { id: tag.id, name: tag.name } } as never,
                ' '
              ])
            })
          }
        })
      }
      return items
    },
    [editor, normalizeHashtagName, onCreateHashtag]
  )

  const getWikilinkItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const { search, alias } = parseWikilinkQuery(query)
      const insert = (target: WikilinkTarget) => {
        editor.insertInlineContent([
          {
            type: 'wikilink',
            props: { href: target.href, title: alias ?? target.title }
          } as never,
          ' '
        ])
      }
      const items: DefaultReactSuggestionItem[] = matchWikilinkTargets(
        linkTargetsRef.current,
        search
      ).map((target) => ({
        title: target.title,
        subtext: target.kind,
        onItemClick: () => insert(target)
      }))
      const exact = linkTargetsRef.current.some(
        (t) => t.title.toLowerCase() === search.toLowerCase()
      )
      if (onCreateLinkTarget && search && !exact) {
        items.push({
          title: `Create page “${search}”`,
          badge: CREATE_WIKILINK_ID,
          onItemClick: () => {
            void onCreateLinkTarget(search).then((target) => {
              if (target) insert(target)
            })
          }
        })
      }
      return items
    },
    [editor, onCreateLinkTarget]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        !onBackspaceAtStart ||
        event.key !== 'Backspace' ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return
      }
      const blocks = editor.document
      const first = blocks[0]
      const cursor = editor.getTextCursorPosition()
      const firstEmpty =
        Array.isArray(first?.content) && (first.content as unknown[]).length === 0
      if (blocks.length === 1 && cursor.block.id === first?.id && firstEmpty) {
        if (onBackspaceAtStart() === true) {
          event.preventDefault()
        }
      }
    },
    [editor, onBackspaceAtStart]
  )

  return (
    <XNetEditorHostProvider value={host}>
      <div
        ref={containerRef}
        className={cn('xnet-editor h-full', className)}
        onKeyDownCapture={handleKeyDown}
      >
        <BlockNoteView
          editor={editor}
          theme={theme}
          editable={!readOnly}
          onChange={handleChange}
          slashMenu={false}
          aria-label={editorLabel}
        >
          <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems} />
          <SuggestionMenuController triggerCharacter="@" getItems={getMentionItems} />
          <SuggestionMenuController triggerCharacter="#" getItems={getHashtagItems} />
          <SuggestionMenuController triggerCharacter="[[" getItems={getWikilinkItems} />
        </BlockNoteView>
      </div>
    </XNetEditorHostProvider>
  )
}
