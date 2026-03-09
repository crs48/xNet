import type { Meta, StoryObj } from '@storybook/react-vite'
import type { AnyExtension, JSONContent } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import type { Schema } from '@xnetjs/data'
import type { TableRow, ViewConfig } from '@xnetjs/views'
import { getSchema } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import Typography from '@tiptap/extension-typography'
import StarterKit from '@tiptap/starter-kit'
import { prosemirrorJSONToYDoc } from '@tiptap/y-tiptap'
import { Badge, Button } from '@xnetjs/ui'
import {
  BoardView,
  CalendarView,
  GalleryView,
  ListView,
  TableView,
  TimelineView
} from '@xnetjs/views'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { RichTextEditor } from './components/RichTextEditor'
import {
  BlockquoteWithSyntax,
  CalloutExtension,
  CodeBlockWithSyntax,
  CommentMark,
  CommentPlugin,
  DEFAULT_TASK_VIEW_CONFIG,
  DatabaseEmbedExtension,
  DragHandleExtension,
  EmbedExtension,
  FileExtension,
  HeadingWithSyntax,
  ImageExtension,
  KeyboardShortcutsExtension,
  LivePreview,
  parseEmbedUrl,
  PageTaskItemExtension,
  SlashCommand,
  SmartReferenceExtension,
  TaskDueDateExtension,
  TaskMentionExtension,
  TaskViewEmbedExtension,
  ToggleExtension,
  Wikilink,
  type DatabaseViewType,
  type TaskMentionSuggestion,
  type TaskViewConfig,
  type TaskViewEmbedType
} from './extensions'
import { parseSmartReferenceUrl } from './extensions/smart-reference/providers'

const meta = {
  title: 'Core/Editor/RichTextEditor'
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

type EditorEvent = {
  id: number
  message: string
}

type Collaborator = {
  id: 'author' | 'reviewer' | 'designer'
  did: string
  name: string
  role: string
  color: string
}

type CollaborationSession = {
  docs: [Y.Doc, Y.Doc, Y.Doc]
  awarenesses: [Awareness, Awareness, Awareness]
}

type CommentThreadState = {
  id: string
  label: string
  state: 'active' | 'resolved' | 'orphaned'
}

const DOC_SYNC_ORIGIN = Symbol('storybook-doc-sync')
const AWARENESS_SYNC_ORIGIN = Symbol('storybook-awareness-sync')
const STORY_FIELD = 'content'

const collaborators: Collaborator[] = [
  {
    id: 'author',
    did: 'did:key:z6Mkstorybookauthor',
    name: 'Chris',
    role: 'Author',
    color: '#0ea5e9'
  },
  {
    id: 'reviewer',
    did: 'did:key:z6Mkstorybookreviewer',
    name: 'Pat',
    role: 'Reviewer',
    color: '#f97316'
  },
  {
    id: 'designer',
    did: 'did:key:z6Mkstorybookdesigner',
    name: 'Morgan',
    role: 'Design',
    color: '#22c55e'
  }
]

const mentionSuggestions: TaskMentionSuggestion[] = collaborators.map((collaborator) => ({
  id: collaborator.did,
  label: collaborator.name,
  subtitle: collaborator.role,
  color: collaborator.color
}))

const storyCommentThreads: CommentThreadState[] = [
  {
    id: 'comment-live-selection',
    label: 'Active design feedback on the launch section',
    state: 'active'
  },
  {
    id: 'comment-resolved-reference',
    label: 'Resolved GitHub smart-reference wording',
    state: 'resolved'
  },
  {
    id: 'comment-orphaned-import',
    label: 'Orphaned import note after content moved',
    state: 'orphaned'
  }
]

const databaseSchema: Schema = {
  '@id': 'xnet://storybook/EmbeddedFeatureDatabase' as const,
  '@type': 'xnet://xnet.fyi/Schema' as const,
  name: 'EmbeddedFeatureDatabase',
  namespace: 'xnet://storybook/' as const,
  version: '1.0.0',
  properties: [
    {
      '@id': 'xnet://storybook/EmbeddedFeatureDatabase#title',
      name: 'Title',
      type: 'text',
      required: false,
      config: {}
    },
    {
      '@id': 'xnet://storybook/EmbeddedFeatureDatabase#status',
      name: 'Status',
      type: 'select',
      required: false,
      config: {
        options: [
          { id: 'todo', name: 'To Do', color: 'gray' },
          { id: 'in-progress', name: 'In Progress', color: 'blue' },
          { id: 'review', name: 'In Review', color: 'yellow' },
          { id: 'done', name: 'Done', color: 'green' }
        ]
      }
    },
    {
      '@id': 'xnet://storybook/EmbeddedFeatureDatabase#priority',
      name: 'Priority',
      type: 'select',
      required: false,
      config: {
        options: [
          { id: 'low', name: 'Low', color: 'gray' },
          { id: 'medium', name: 'Medium', color: 'yellow' },
          { id: 'high', name: 'High', color: 'red' }
        ]
      }
    },
    {
      '@id': 'xnet://storybook/EmbeddedFeatureDatabase#estimate',
      name: 'Estimate',
      type: 'number',
      required: false,
      config: {}
    },
    {
      '@id': 'xnet://storybook/EmbeddedFeatureDatabase#shipped',
      name: 'Shipped',
      type: 'checkbox',
      required: false,
      config: {}
    },
    {
      '@id': 'xnet://storybook/EmbeddedFeatureDatabase#launchDate',
      name: 'Launch Date',
      type: 'date',
      required: false,
      config: {}
    },
    {
      '@id': 'xnet://storybook/EmbeddedFeatureDatabase#scheduleStart',
      name: 'Schedule Start',
      type: 'date',
      required: false,
      config: {}
    },
    {
      '@id': 'xnet://storybook/EmbeddedFeatureDatabase#scheduleEnd',
      name: 'Schedule End',
      type: 'date',
      required: false,
      config: {}
    },
    {
      '@id': 'xnet://storybook/EmbeddedFeatureDatabase#owner',
      name: 'Owner',
      type: 'text',
      required: false,
      config: {}
    },
    {
      '@id': 'xnet://storybook/EmbeddedFeatureDatabase#repository',
      name: 'Repository',
      type: 'url',
      required: false,
      config: {}
    },
    {
      '@id': 'xnet://storybook/EmbeddedFeatureDatabase#contact',
      name: 'Contact',
      type: 'email',
      required: false,
      config: {}
    },
    {
      '@id': 'xnet://storybook/EmbeddedFeatureDatabase#cover',
      name: 'Cover',
      type: 'file',
      required: false,
      config: {}
    }
  ]
}

const databaseRows: TableRow[] = [
  {
    id: 'row-1',
    title: 'Instrument collaboration cursors',
    status: 'in-progress',
    priority: 'high',
    estimate: 5,
    shipped: false,
    launchDate: '2026-03-14',
    scheduleStart: new Date('2026-03-10T09:00:00.000Z').getTime(),
    scheduleEnd: new Date('2026-03-16T18:00:00.000Z').getTime(),
    owner: 'Pat',
    repository: 'https://github.com/xnetjs/xNet/pull/312',
    contact: 'desktop@xnet.fyi',
    cover: {
      url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80'
    }
  },
  {
    id: 'row-2',
    title: 'Embed docs and external media',
    status: 'review',
    priority: 'medium',
    estimate: 3,
    shipped: false,
    launchDate: '2026-03-12',
    scheduleStart: new Date('2026-03-12T13:00:00.000Z').getTime(),
    scheduleEnd: new Date('2026-03-18T16:00:00.000Z').getTime(),
    owner: 'Morgan',
    repository: 'https://github.com/xnetjs/xNet/issues/289',
    contact: 'design@xnet.fyi',
    cover: {
      url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80'
    }
  },
  {
    id: 'row-3',
    title: 'Ship richer Storybook workbenches',
    status: 'done',
    priority: 'high',
    estimate: 8,
    shipped: true,
    launchDate: '2026-03-08',
    scheduleStart: new Date('2026-03-07T15:00:00.000Z').getTime(),
    scheduleEnd: new Date('2026-03-20T17:00:00.000Z').getTime(),
    owner: 'Chris',
    repository: 'https://github.com/xnetjs/xNet/issues/301',
    contact: 'product@xnet.fyi',
    cover: {
      url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=80'
    }
  },
  {
    id: 'row-4',
    title: 'Preview orphaned comment recovery',
    status: 'todo',
    priority: 'low',
    estimate: 2,
    shipped: false,
    launchDate: '2026-03-21',
    scheduleStart: new Date('2026-03-21T11:00:00.000Z').getTime(),
    scheduleEnd: new Date('2026-03-24T16:00:00.000Z').getTime(),
    owner: 'Alex',
    repository: 'https://github.com/xnetjs/xNet/issues/333',
    contact: 'comments@xnet.fyi',
    cover: {
      url: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=900&q=80'
    }
  }
]

const tableView: ViewConfig = {
  id: 'embedded-table',
  name: 'Embedded Table',
  type: 'table',
  visibleProperties: [
    'title',
    'status',
    'priority',
    'estimate',
    'shipped',
    'launchDate',
    'scheduleStart',
    'scheduleEnd',
    'owner',
    'repository',
    'contact'
  ],
  propertyWidths: {
    title: 260,
    status: 140,
    priority: 130,
    estimate: 100,
    shipped: 110,
    launchDate: 150,
    scheduleStart: 150,
    scheduleEnd: 150,
    owner: 120,
    repository: 240,
    contact: 220
  },
  sorts: []
}

const boardView: ViewConfig = {
  id: 'embedded-board',
  name: 'Embedded Board',
  type: 'board',
  visibleProperties: ['title', 'priority', 'estimate', 'owner'],
  sorts: [],
  groupByProperty: 'status'
}

const listView: ViewConfig = {
  id: 'embedded-list',
  name: 'Embedded List',
  type: 'list',
  visibleProperties: ['title', 'priority', 'owner', 'shipped'],
  sorts: []
}

const galleryView: ViewConfig = {
  id: 'embedded-gallery',
  name: 'Embedded Gallery',
  type: 'gallery',
  visibleProperties: ['title', 'status', 'priority', 'owner'],
  sorts: [],
  coverProperty: 'cover',
  galleryCardSize: 'small',
  galleryImageFit: 'cover',
  galleryShowTitle: true
}

const calendarView: ViewConfig = {
  id: 'embedded-calendar',
  name: 'Embedded Calendar',
  type: 'calendar',
  visibleProperties: ['title', 'status', 'owner'],
  sorts: [],
  dateProperty: 'scheduleStart',
  endDateProperty: 'scheduleEnd'
}

const timelineView: ViewConfig = {
  id: 'embedded-timeline',
  name: 'Embedded Timeline',
  type: 'timeline',
  visibleProperties: ['title', 'status', 'owner', 'priority'],
  sorts: [],
  dateProperty: 'scheduleStart',
  endDateProperty: 'scheduleEnd'
}

const storyCommentExtensions: AnyExtension[] = [
  CommentMark,
  CommentPlugin.configure({
    onClickComment: () => undefined,
    onHoverComment: () => undefined,
    onLeaveComment: () => undefined
  })
]

function createStorySeedExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: false,
      link: false,
      heading: false,
      codeBlock: false,
      blockquote: false,
      dropcursor: false
    }),
    HeadingWithSyntax.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    CodeBlockWithSyntax,
    BlockquoteWithSyntax,
    Typography,
    Placeholder.configure({
      placeholder: 'Start writing...',
      emptyEditorClass: 'is-editor-empty'
    }),
    TaskList,
    PageTaskItemExtension.configure({
      nested: true
    }),
    TaskMentionExtension.configure({
      getSuggestions: () => mentionSuggestions
    }),
    TaskDueDateExtension,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-primary hover:underline cursor-pointer'
      }
    }),
    Wikilink.configure({
      onNavigate: () => undefined
    }),
    LivePreview.configure({
      marks: ['bold', 'italic', 'strike', 'code'],
      links: true
    }),
    SlashCommand.configure({
      commands: undefined
    }),
    DragHandleExtension.configure({
      enableDragDrop: true,
      showDropIndicator: true
    }),
    KeyboardShortcutsExtension,
    ImageExtension.configure({
      onUpload: undefined
    }),
    CalloutExtension,
    ToggleExtension,
    FileExtension.configure({
      onUpload: undefined,
      onDownload: undefined
    }),
    SmartReferenceExtension,
    EmbedExtension,
    DatabaseEmbedExtension.configure({
      onSelectDatabase: async () => null,
      renderView: () => null,
      resolveDatabaseMeta: async () => null
    }),
    TaskViewEmbedExtension.configure({
      renderView: () => null
    }),
    CommentMark
  ]
}

const storySeedSchema = getSchema(createStorySeedExtensions())

function createCollaborationSession(initialContent: JSONContent): CollaborationSession {
  const docs: [Y.Doc, Y.Doc, Y.Doc] = [
    createSeededStoryDoc(initialContent),
    createSeededStoryDoc(initialContent),
    createSeededStoryDoc(initialContent)
  ]
  const awarenesses = docs.map((doc) => new Awareness(doc)) as [Awareness, Awareness, Awareness]

  return {
    docs,
    awarenesses
  }
}

function createFeatureIllustrationDataUri(title: string, accent: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1400" height="820" viewBox="0 0 1400 820">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#111827" />
        </linearGradient>
        <linearGradient id="panel" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.35" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.08" />
        </linearGradient>
      </defs>
      <rect width="1400" height="820" rx="36" fill="url(#bg)" />
      <rect x="72" y="72" width="1256" height="676" rx="28" fill="url(#panel)" stroke="#ffffff" stroke-opacity="0.18" />
      <rect x="124" y="140" width="400" height="160" rx="24" fill="#ffffff" fill-opacity="0.08" />
      <rect x="560" y="140" width="280" height="420" rx="24" fill="#ffffff" fill-opacity="0.06" />
      <rect x="878" y="140" width="360" height="210" rx="24" fill="#ffffff" fill-opacity="0.06" />
      <rect x="878" y="386" width="360" height="174" rx="24" fill="#ffffff" fill-opacity="0.06" />
      <rect x="124" y="340" width="400" height="220" rx="24" fill="#ffffff" fill-opacity="0.06" />
      <rect x="124" y="594" width="1114" height="96" rx="24" fill="#ffffff" fill-opacity="0.05" />
      <circle cx="170" cy="190" r="14" fill="${accent}" />
      <circle cx="210" cy="190" r="14" fill="#38bdf8" />
      <circle cx="250" cy="190" r="14" fill="#f59e0b" />
      <text x="124" y="118" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="36" font-weight="700">${title}</text>
      <text x="124" y="640" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="28">Images, embeds, smart references, database views, and collaboration overlays</text>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function createSeededStoryDoc(content: JSONContent): Y.Doc {
  return prosemirrorJSONToYDoc(storySeedSchema, content, STORY_FIELD)
}

function createText(text: string, marks?: JSONContent['marks']): JSONContent {
  return marks && marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text }
}

function createParagraph(content: JSONContent[]): JSONContent {
  return {
    type: 'paragraph',
    content
  }
}

function createHeading(level: number, content: JSONContent[]): JSONContent {
  return {
    type: 'heading',
    attrs: { level },
    content
  }
}

function createEmbedNode(url: string, width = 560): JSONContent {
  const parsed = parseEmbedUrl(url)
  if (!parsed) {
    throw new Error(`Unsupported embed URL: ${url}`)
  }

  return {
    type: 'embed',
    attrs: {
      url,
      provider: parsed.provider.name,
      embedId: parsed.id,
      embedUrl: parsed.embedUrl,
      width,
      alignment: 'center'
    }
  }
}

function createSmartReferenceNode(url: string): JSONContent {
  const parsed = parseSmartReferenceUrl(url)
  if (!parsed) {
    throw new Error(`Unsupported smart reference URL: ${url}`)
  }

  return {
    type: 'smartReference',
    attrs: {
      url: parsed.url,
      provider: parsed.provider,
      kind: parsed.kind,
      refId: parsed.refId,
      title: parsed.title,
      subtitle: parsed.subtitle ?? null,
      icon: parsed.icon,
      embedUrl: parsed.embedUrl ?? null,
      metadata: JSON.stringify(parsed.metadata)
    }
  }
}

function createTaskMentionNode(mention: TaskMentionSuggestion): JSONContent {
  return {
    type: 'taskMention',
    attrs: {
      id: mention.id,
      label: mention.label,
      subtitle: mention.subtitle ?? null,
      color: mention.color ?? null
    }
  }
}

function createFeatureDocument(imageSrc: string): JSONContent {
  const detailImage = createFeatureIllustrationDataUri('Embedded Media Matrix', '#22c55e')
  const wideImage = createFeatureIllustrationDataUri('Database And Canvas Linkages', '#f97316')

  return {
    type: 'doc',
    content: [
      createHeading(1, [createText('Storybook Editor Feature Lab')]),
      createParagraph([
        createText('This document is intentionally dense. It includes '),
        createText('bold', [{ type: 'bold' }]),
        createText(', '),
        createText('italic', [{ type: 'italic' }]),
        createText(', '),
        createText('strike', [{ type: 'strike' }]),
        createText(', '),
        createText('inline code', [{ type: 'code' }]),
        createText(', regular '),
        createText('links', [{ type: 'link', attrs: { href: 'https://docs.xnet.fyi' } }]),
        createText(', and '),
        createText('wikilinks', [
          { type: 'wikilink', attrs: { href: 'editor-lab', title: 'Editor Lab' } }
        ]),
        createText(' alongside collaborative cursor and selection overlays.')
      ]),
      {
        type: 'callout',
        attrs: {
          type: 'info',
          title: 'What to test first',
          collapsed: false
        },
        content: [
          createParagraph([
            createText(
              'Type in the main editor, move the remote collaborators, inspect embeds, and flip database views from table to board directly inside the document.'
            )
          ])
        ]
      },
      createHeading(2, [createText('Rich Links And Structured References')]),
      createParagraph([
        createText('GitHub issue chips: '),
        createSmartReferenceNode('https://github.com/xnetjs/xNet/issues/301'),
        createText(' '),
        createSmartReferenceNode('https://github.com/xnetjs/xNet/pull/312'),
        createText(' '),
        createSmartReferenceNode('https://www.figma.com/file/abc123def/storybook-rich-editor-spec'),
        createText(' plus a normal docs link to '),
        createText('Storybook 10 docs', [
          { type: 'link', attrs: { href: 'https://storybook.js.org/docs' } }
        ]),
        createText('.')
      ]),
      createHeading(2, [createText('Media And External Embeds')]),
      createParagraph([
        createText(
          'Block embeds are seeded below for YouTube and X/Twitter. Paste additional provider URLs to exercise the embed extension further.'
        )
      ]),
      createEmbedNode('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 640),
      createEmbedNode('https://x.com/storybookjs/status/1606321052308658177', 520),
      createEmbedNode('https://vimeo.com/123456789', 640),
      createEmbedNode('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', 640),
      createEmbedNode('https://www.figma.com/file/abc123def/storybook-rich-editor-spec', 700),
      createEmbedNode('https://codesandbox.io/s/my-sandbox-abc123', 700),
      createEmbedNode('https://www.loom.com/share/abc123def456', 640),
      createHeading(2, [createText('Images And Attachments')]),
      {
        type: 'image',
        attrs: {
          src: imageSrc,
          alt: 'Feature map illustration',
          title: 'Feature map',
          width: 860,
          height: 503,
          alignment: 'center',
          cid: 'cid:feature-map'
        }
      },
      createParagraph([
        createText(
          'The story also includes left-aligned, right-aligned, and full-width images so resizing and alignment controls can be exercised immediately.'
        )
      ]),
      {
        type: 'image',
        attrs: {
          src: detailImage,
          alt: 'Detail matrix illustration',
          title: 'Detail matrix',
          width: 360,
          height: 211,
          alignment: 'left',
          cid: 'cid:detail-matrix'
        }
      },
      {
        type: 'image',
        attrs: {
          src: detailImage,
          alt: 'Right-aligned detail matrix illustration',
          title: 'Right matrix',
          width: 360,
          height: 211,
          alignment: 'right',
          cid: 'cid:right-matrix'
        }
      },
      {
        type: 'image',
        attrs: {
          src: wideImage,
          alt: 'Wide integration illustration',
          title: 'Wide integration map',
          width: 1180,
          height: 692,
          alignment: 'full',
          cid: 'cid:wide-map'
        }
      },
      {
        type: 'file',
        attrs: {
          cid: 'cid:storybook-editor-brief',
          name: 'editor-feature-brief.pdf',
          mimeType: 'application/pdf',
          size: 428391,
          uploadProgress: null
        }
      },
      createHeading(2, [createText('Database Embeds')]),
      createParagraph([
        createText(
          'The editor can host inline database surfaces. The first embed focuses on high-density property types, and the second shows board grouping.'
        )
      ]),
      {
        type: 'databaseEmbed',
        attrs: {
          databaseId: 'roadmap-db',
          viewType: 'table',
          viewConfig: {
            ...tableView
          }
        }
      },
      {
        type: 'databaseEmbed',
        attrs: {
          databaseId: 'roadmap-db',
          viewType: 'board',
          viewConfig: {
            ...boardView
          }
        }
      },
      {
        type: 'databaseEmbed',
        attrs: {
          databaseId: 'roadmap-db',
          viewType: 'list',
          viewConfig: {
            ...listView
          }
        }
      },
      {
        type: 'databaseEmbed',
        attrs: {
          databaseId: 'roadmap-db',
          viewType: 'gallery',
          viewConfig: {
            ...galleryView
          }
        }
      },
      {
        type: 'databaseEmbed',
        attrs: {
          databaseId: 'roadmap-db',
          viewType: 'calendar',
          viewConfig: {
            ...calendarView
          }
        }
      },
      {
        type: 'databaseEmbed',
        attrs: {
          databaseId: 'roadmap-db',
          viewType: 'timeline',
          viewConfig: {
            ...timelineView
          }
        }
      },
      createHeading(2, [createText('Task Views And Workflow Blocks')]),
      {
        type: 'taskViewEmbed',
        attrs: {
          viewType: 'list',
          viewConfig: {
            ...DEFAULT_TASK_VIEW_CONFIG,
            scope: 'current-page',
            dueDate: 'next-7-days',
            showHierarchy: true
          }
        }
      },
      createHeading(2, [createText('Nested Toggles And Callouts')]),
      {
        type: 'toggle',
        attrs: {
          summary: 'Expandable implementation notes',
          open: true
        },
        content: [
          createParagraph([
            createText(
              'The toggle block is useful for hiding verbose implementation context while keeping it close to the document. Try collapsing it, then drag it elsewhere.'
            )
          ]),
          {
            type: 'callout',
            attrs: {
              type: 'warning',
              title: 'Nested note',
              collapsed: false
            },
            content: [
              createParagraph([
                createText(
                  'This nested callout previews stacked block compositions inside a toggle.'
                )
              ])
            ]
          },
          {
            type: 'toggle',
            attrs: {
              summary: 'Nested toggle',
              open: true
            },
            content: [
              createParagraph([
                createText(
                  'Nested toggles let the story exercise deeper block tree editing states.'
                )
              ])
            ]
          }
        ]
      },
      createHeading(2, [createText('Comment Anchor States')]),
      createParagraph([
        createText('This sentence contains an '),
        createText('active comment anchor', [
          { type: 'comment', attrs: { commentId: 'comment-live-selection', resolved: false } }
        ]),
        createText(' plus a '),
        createText('resolved comment anchor', [
          { type: 'comment', attrs: { commentId: 'comment-resolved-reference', resolved: true } }
        ]),
        createText(
          '. The orphaned comment state is surfaced in the sidebar because it no longer maps to text.'
        )
      ]),
      {
        type: 'blockquote',
        content: [
          createParagraph([
            createText(
              'A feature-rich editor story should demonstrate the shapes of real work, not just empty formatting commands.'
            )
          ])
        ]
      },
      {
        type: 'codeBlock',
        attrs: {
          language: 'typescript'
        },
        content: [
          createText(
            "editor.chain().focus().setEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ').run()"
          )
        ]
      },
      createHeading(2, [createText('Checklist With Mentions And Due Dates')]),
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: {
              checked: false
            },
            content: [
              createParagraph([
                createText('Validate remote cursor rendering with '),
                createTaskMentionNode(mentionSuggestions[1]),
                createText(' and '),
                {
                  type: 'taskDueDate',
                  attrs: {
                    date: '2026-03-12'
                  }
                }
              ])
            ]
          },
          {
            type: 'taskItem',
            attrs: {
              checked: true
            },
            content: [
              createParagraph([
                createText('Review the GitHub issue reference '),
                createSmartReferenceNode('https://github.com/xnetjs/xNet/issues/289')
              ])
            ]
          }
        ]
      },
      {
        type: 'horizontalRule'
      },
      createParagraph([
        createText(
          'Use the linked collaborator panes on the right to move cursors, create text selections, and verify that the main editor visualizes them correctly.'
        )
      ])
    ]
  }
}

function EmbeddedDatabasePreview({
  databaseId,
  viewType
}: {
  databaseId: string
  viewType: DatabaseViewType
}): ReactElement {
  const [rows, setRows] = useState<TableRow[]>(databaseRows)

  const updateRow = (rowId: string, propertyId: string, value: unknown): void => {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [propertyId]: value } : row))
    )
  }

  if (viewType === 'table') {
    return (
      <div className="h-[320px] overflow-hidden rounded-2xl border border-border bg-background">
        <TableView
          schema={databaseSchema}
          view={tableView}
          data={rows}
          onUpdateRow={updateRow}
          onAddRow={() => undefined}
          onDeleteRow={() => undefined}
        />
      </div>
    )
  }

  if (viewType === 'board') {
    return (
      <div className="h-[320px] overflow-hidden rounded-2xl border border-border bg-background">
        <BoardView
          schema={databaseSchema}
          view={boardView}
          data={rows}
          onUpdateRow={updateRow}
          onAddCard={() => undefined}
          onCardClick={() => undefined}
          onReorderCards={() => undefined}
        />
      </div>
    )
  }

  if (viewType === 'list') {
    return (
      <div className="h-[320px] overflow-hidden rounded-2xl border border-border bg-background">
        <ListView
          schema={databaseSchema}
          view={listView}
          data={rows}
          onUpdateRow={updateRow}
          onAddItem={() => undefined}
          onItemClick={() => undefined}
          onDeleteItem={() => undefined}
        />
      </div>
    )
  }

  if (viewType === 'gallery') {
    return (
      <div className="h-[320px] overflow-hidden rounded-2xl border border-border bg-background">
        <GalleryView
          schema={databaseSchema}
          view={galleryView}
          data={rows}
          onAddCard={() => undefined}
          onCardClick={() => undefined}
        />
      </div>
    )
  }

  if (viewType === 'calendar') {
    return (
      <div className="h-[320px] overflow-hidden rounded-2xl border border-border bg-background">
        <CalendarView
          schema={databaseSchema}
          view={calendarView}
          data={rows}
          onUpdateRow={updateRow}
          onEventClick={() => undefined}
          onDateClick={() => undefined}
        />
      </div>
    )
  }

  if (viewType === 'timeline') {
    return (
      <div className="h-[320px] overflow-hidden rounded-2xl border border-border bg-background">
        <TimelineView
          schema={databaseSchema}
          view={timelineView}
          data={rows}
          onUpdateRow={updateRow}
          onItemClick={() => undefined}
        />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-dashed border-border bg-background-subtle p-4 text-sm text-foreground-muted">
      <p className="font-medium text-foreground">
        {databaseId} in {viewType} mode
      </p>
      <p className="mt-2">
        This story renders the heavy interactive database modes inline and keeps the remaining modes
        available as a switch target so the node-view controls can still be exercised.
      </p>
    </div>
  )
}

function EmbeddedTaskViewPreview({
  viewType,
  viewConfig
}: {
  viewType: TaskViewEmbedType
  viewConfig: TaskViewConfig
}): ReactElement {
  const tasks = [
    'Instrument collaborative cursor overlays',
    'Embed richer external media',
    'Stress test database embeds'
  ]

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{viewType} view</Badge>
        <Badge variant="outline">{viewConfig.scope}</Badge>
        <Badge variant="outline">{viewConfig.dueDate}</Badge>
        <Badge variant="outline">{viewConfig.status}</Badge>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-foreground-muted">
        {tasks.map((task) => (
          <li key={task} className="rounded-lg bg-background-subtle px-3 py-2">
            {task}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CollaboratorPane({
  collaborator,
  doc,
  awareness,
  onEditorReady
}: {
  collaborator: Collaborator
  doc: Y.Doc
  awareness: Awareness
  onEditorReady: (editor: Editor) => void
}): ReactElement {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border bg-background-subtle px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{collaborator.name}</p>
          <p className="text-xs text-foreground-muted">{collaborator.role} collaborator</p>
        </div>
        <span
          className="inline-flex h-3 w-3 rounded-full"
          style={{ backgroundColor: collaborator.color }}
        />
      </div>
      <div className="h-[220px]">
        <RichTextEditor
          ydoc={doc}
          field={STORY_FIELD}
          awareness={awareness}
          did={collaborator.did}
          showToolbar={false}
          placeholder={`${collaborator.name} can move the cursor here...`}
          extensions={storyCommentExtensions}
          onEditorReady={onEditorReady}
        />
      </div>
    </div>
  )
}

function RichTextEditorWorkbench(): ReactElement {
  const featureImage = useRef(createFeatureIllustrationDataUri('Editor Story Surface', '#8b5cf6'))
  const [session] = useState(() =>
    createCollaborationSession(createFeatureDocument(featureImage.current))
  )
  const [events, setEvents] = useState<EditorEvent[]>([])
  const [readOnly, setReadOnly] = useState(false)
  const [pageTasks, setPageTasks] = useState<string[]>([])
  const [activeDatabaseId, setActiveDatabaseId] = useState<'roadmap-db' | 'issues-db'>('roadmap-db')
  const nextEventIdRef = useRef(1)
  const seededRef = useRef(false)
  const primedRef = useRef(false)
  const remoteEditorsRef = useRef<{ reviewer: Editor | null; designer: Editor | null }>({
    reviewer: null,
    designer: null
  })

  const appendEvent = (message: string): void => {
    setEvents((current) => [{ id: nextEventIdRef.current++, message }, ...current].slice(0, 12))
  }

  useEffect(() => {
    const removeDocListeners = session.docs.map((sourceDoc, sourceIndex) => {
      const handleUpdate = (update: Uint8Array, origin: unknown): void => {
        if (origin === DOC_SYNC_ORIGIN) return

        session.docs.forEach((targetDoc, targetIndex) => {
          if (targetIndex === sourceIndex) return
          Y.applyUpdate(targetDoc, update, DOC_SYNC_ORIGIN)
        })
      }

      sourceDoc.on('update', handleUpdate)
      return () => sourceDoc.off('update', handleUpdate)
    })

    const removeAwarenessListeners = session.awarenesses.map((sourceAwareness, sourceIndex) => {
      const handleUpdate = (
        payload: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
      ): void => {
        if (origin === AWARENESS_SYNC_ORIGIN) return

        const changed = [...payload.added, ...payload.updated, ...payload.removed]
        if (changed.length === 0) return

        const update = encodeAwarenessUpdate(sourceAwareness, changed)
        session.awarenesses.forEach((targetAwareness, targetIndex) => {
          if (targetIndex === sourceIndex) return
          applyAwarenessUpdate(targetAwareness, update, AWARENESS_SYNC_ORIGIN)
        })
      }

      sourceAwareness.on('update', handleUpdate)
      return () => sourceAwareness.off('update', handleUpdate)
    })

    collaborators.forEach((collaborator, index) => {
      session.awarenesses[index].setLocalStateField('user', {
        did: collaborator.did,
        name: collaborator.name,
        color: collaborator.color
      })
    })

    return () => {
      removeDocListeners.forEach((cleanup) => cleanup())
      removeAwarenessListeners.forEach((cleanup) => cleanup())
      session.awarenesses.forEach((awareness) => awareness.destroy())
      session.docs.forEach((doc) => doc.destroy())
    }
  }, [session])

  const primeRemoteCollaborators = (): void => {
    if (primedRef.current) return
    if (!remoteEditorsRef.current.reviewer || !remoteEditorsRef.current.designer) return

    primedRef.current = true

    window.setTimeout(() => {
      const reviewer = remoteEditorsRef.current.reviewer
      const designer = remoteEditorsRef.current.designer

      if (!reviewer || !designer || reviewer.isEmpty || designer.isEmpty) {
        primedRef.current = false
        return
      }

      reviewer.commands.setTextSelection(60)
      designer.commands.setTextSelection({ from: 350, to: 470 })
      appendEvent('Primed reviewer cursor and designer range selection')
    }, 350)
  }

  const handleMainEditorReady = (_editor: Editor): void => {
    if (!seededRef.current) {
      seededRef.current = true
      appendEvent(
        'Loaded seeded collaboration document with embeds, comments, files, and databases'
      )
    }

    appendEvent('Main editor mounted and collaboration is ready')
    primeRemoteCollaborators()
  }

  const handleRemoteEditorReady =
    (key: 'reviewer' | 'designer', name: string) =>
    (editor: Editor): void => {
      remoteEditorsRef.current[key] = editor
      appendEvent(`${name} collaborator editor mounted`)
      primeRemoteCollaborators()
    }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="overflow-hidden rounded-[28px] border border-border bg-background shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background-subtle px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Editor feature workbench</p>
            <p className="text-xs text-foreground-muted">
              Rich marks, uploads, media embeds, database embeds, task views, comments, and live
              collaboration markers in one story.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={readOnly ? 'secondary' : 'success'}>
              {readOnly ? 'Read only' : 'Editable'}
            </Badge>
            <Badge variant="outline">{collaborators.length - 1} remote peers</Badge>
            <Badge variant="outline">{pageTasks.length} tracked tasks</Badge>
            <Button variant="outline" size="sm" onClick={() => setReadOnly((value) => !value)}>
              Toggle mode
            </Button>
          </div>
        </div>

        <div className="min-h-[880px] bg-background">
          <RichTextEditor
            ydoc={session.docs[0]}
            field={STORY_FIELD}
            placeholder="Start writing..."
            toolbarMode="desktop"
            awareness={session.awarenesses[0]}
            did={collaborators[0].did}
            readOnly={readOnly}
            extensions={storyCommentExtensions}
            mentionSuggestions={mentionSuggestions}
            onNavigate={(docId) => appendEvent(`Navigate to ${docId}`)}
            onSelectDatabase={async () => {
              const nextId = activeDatabaseId === 'roadmap-db' ? 'issues-db' : 'roadmap-db'
              setActiveDatabaseId(nextId)
              appendEvent(`Selected embedded database: ${nextId}`)
              return nextId
            }}
            resolveDatabaseMeta={async (databaseId) => ({
              title: databaseId === 'issues-db' ? 'GitHub Issue Mirror' : 'Roadmap Tracker',
              icon: databaseId === 'issues-db' ? 'github' : 'table'
            })}
            renderDatabaseView={({ databaseId, viewType }) => (
              <EmbeddedDatabasePreview databaseId={databaseId} viewType={viewType} />
            )}
            renderTaskView={({ viewType, viewConfig }) => (
              <EmbeddedTaskViewPreview viewType={viewType} viewConfig={viewConfig} />
            )}
            taskViewPageId="storybook-page"
            onImageUpload={async (file) => {
              appendEvent(`Image upload simulated for ${file.name}`)
              return {
                src: URL.createObjectURL(file),
                width: 1200,
                height: 800,
                cid: `cid:${file.name}`
              }
            }}
            onFileUpload={async (file) => {
              appendEvent(`File upload simulated for ${file.name}`)
              return {
                cid: `cid:${file.name}`,
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                size: file.size
              }
            }}
            onFileDownload={async (attrs) => {
              appendEvent(`Download requested for ${attrs.name}`)
              return 'about:blank'
            }}
            onCreateComment={async () => {
              const commentId = `comment-${Date.now()}`
              appendEvent(`Created comment ${commentId}`)
              return commentId
            }}
            onPageTasksChange={(tasks) => {
              setPageTasks(tasks.map((task) => task.title))
            }}
            onEditorReady={handleMainEditorReady}
          />
        </div>
      </div>

      <aside className="space-y-4 rounded-[28px] border border-border bg-background-subtle p-5">
        <div>
          <p className="text-sm font-semibold text-foreground">Included capabilities</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              'marks',
              'wikilinks',
              'comments',
              'images',
              'files',
              'YouTube',
              'Vimeo',
              'Spotify',
              'Figma',
              'CodeSandbox',
              'Loom',
              'tweets',
              'GitHub refs',
              'database embeds',
              'task views',
              'comment anchors',
              'cursors',
              'range selection'
            ].map((capability) => (
              <Badge key={capability} variant="outline">
                {capability}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-sm font-medium text-foreground">Remote collaborators</p>
          <p className="mt-1 text-sm text-foreground-muted">
            Move the caret or select text in the panes below to validate live cursor and selection
            overlays in the main editor.
          </p>
          <div className="mt-4 space-y-4">
            <CollaboratorPane
              collaborator={collaborators[1]}
              doc={session.docs[1]}
              awareness={session.awarenesses[1]}
              onEditorReady={handleRemoteEditorReady('reviewer', collaborators[1].name)}
            />
            <CollaboratorPane
              collaborator={collaborators[2]}
              doc={session.docs[2]}
              awareness={session.awarenesses[2]}
              onEditorReady={handleRemoteEditorReady('designer', collaborators[2].name)}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-sm font-medium text-foreground">Comment anchor states</p>
          <div className="mt-3 space-y-2">
            {storyCommentThreads.map((thread) => (
              <div
                key={thread.id}
                className="rounded-lg border border-border bg-background-subtle px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-foreground">{thread.label}</span>
                  <Badge
                    variant={
                      thread.state === 'resolved'
                        ? 'secondary'
                        : thread.state === 'orphaned'
                          ? 'outline'
                          : 'success'
                    }
                  >
                    {thread.state}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-sm font-medium text-foreground">Tracked task titles</p>
          <ul className="mt-3 space-y-2 text-sm text-foreground-muted">
            {pageTasks.map((task) => (
              <li key={task} className="rounded-lg bg-background-subtle px-3 py-2">
                {task}
              </li>
            ))}
            {pageTasks.length === 0 ? (
              <li className="rounded-lg bg-background-subtle px-3 py-2">
                Task snapshots will appear after the editor seeds.
              </li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-sm font-medium text-foreground">Interaction log</p>
          <div className="mt-3 space-y-2">
            {events.map((event) => (
              <div
                key={event.id}
                className="rounded-lg border border-border bg-background-subtle px-3 py-2 text-sm text-foreground-muted"
              >
                {event.message}
              </div>
            ))}
            {events.length === 0 ? (
              <div className="rounded-lg border border-border bg-background-subtle px-3 py-2 text-sm text-foreground-muted">
                Storybook is preparing the editor session.
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  )
}

export const Playground: Story = {
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story:
          'Feature-rich editor workbench with seeded embeds, uploads, inline databases, task views, GitHub references, and real collaboration cursors driven by linked auxiliary editors.'
      }
    }
  },
  render: () => <RichTextEditorWorkbench />
}
