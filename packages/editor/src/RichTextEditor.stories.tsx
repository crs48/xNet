import type { TaskMentionSuggestion } from './components/TaskMentionMenu'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge, Button } from '@xnetjs/ui'
import { useState, type ReactElement } from 'react'
import * as Y from 'yjs'
import { RichTextEditor } from './components/RichTextEditor'

const meta = {
  title: 'Core/Editor/RichTextEditor'
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>
type EditorEvent = {
  id: number
  message: string
}

const mentionSuggestions: TaskMentionSuggestion[] = [
  {
    id: 'did:key:z6Mkstorychris',
    label: 'Chris',
    subtitle: 'Product direction',
    color: '#0ea5e9'
  },
  {
    id: 'did:key:z6Mkstorypat',
    label: 'Pat',
    subtitle: 'Desktop implementation',
    color: '#f97316'
  },
  {
    id: 'did:key:z6Mkstorymorgan',
    label: 'Morgan',
    subtitle: 'Design systems',
    color: '#22c55e'
  }
]

function createParagraph(text: string): Y.XmlElement {
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(text)])
  return paragraph
}

function createHeading(text: string, level: number): Y.XmlElement {
  const heading = new Y.XmlElement('heading')
  heading.setAttribute('level', String(level))
  heading.insert(0, [new Y.XmlText(text)])
  return heading
}

function createEditorDoc(): Y.Doc {
  const doc = new Y.Doc({ gc: false })
  const content = doc.getXmlFragment('content')

  content.insert(0, [
    createHeading('Storybook editor workbench', 1),
    createParagraph(
      'Use this surface to test typing, slash commands, formatting, inline mentions, comments, and embedded placeholders without launching the full app.'
    ),
    createHeading('Quick checks', 2),
    createParagraph(
      'Type slash to open commands, use double brackets for wikilinks, and highlight text to create a comment from the toolbar.'
    )
  ])

  return doc
}

function RichTextEditorPlayground(): ReactElement {
  const [doc] = useState<Y.Doc>(() => createEditorDoc())
  const [events, setEvents] = useState<EditorEvent[]>([
    {
      id: 1,
      message: 'Editor playground ready. Try typing, formatting, mentions, and comments.'
    }
  ])
  const [nextEventId, setNextEventId] = useState(2)
  const [readOnly, setReadOnly] = useState(false)

  const appendEvent = (message: string): void => {
    setEvents((current) => [{ id: nextEventId, message }, ...current].slice(0, 8))
    setNextEventId((current) => current + 1)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-[28px] border border-border bg-background shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-background-subtle px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Document editor</p>
            <p className="text-xs text-foreground-muted">
              Shared `@xnetjs/editor` surface with a real Yjs document.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={readOnly ? 'secondary' : 'success'}>
              {readOnly ? 'Read only' : 'Editable'}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setReadOnly((value) => !value)}>
              Toggle mode
            </Button>
          </div>
        </div>

        <div className="min-h-[720px] bg-background">
          <RichTextEditor
            ydoc={doc}
            field="content"
            placeholder="Start writing..."
            toolbarMode="desktop"
            did="did:key:z6Mkstorybook"
            readOnly={readOnly}
            mentionSuggestions={mentionSuggestions}
            onNavigate={(docId) => appendEvent(`Navigate to ${docId}`)}
            onSelectDatabase={async () => {
              appendEvent('Selected embedded database: roadmap-db')
              return 'roadmap-db'
            }}
            resolveDatabaseMeta={async (databaseId) => ({
              title: databaseId === 'roadmap-db' ? 'Roadmap Tracker' : 'Embedded Database',
              icon: 'table'
            })}
            renderDatabaseView={({ databaseId, viewType }) => (
              <div className="rounded-xl border border-dashed border-border bg-background-subtle p-4 text-sm text-foreground-muted">
                Embedded database placeholder: <strong>{databaseId}</strong> in{' '}
                <strong>{viewType}</strong> mode.
              </div>
            )}
            renderTaskView={({ viewType, viewConfig }) => (
              <div className="rounded-xl border border-dashed border-border bg-background-subtle p-4 text-sm text-foreground-muted">
                Task view placeholder: <strong>{viewType}</strong> scoped to{' '}
                <strong>{String(viewConfig.scope)}</strong>.
              </div>
            )}
            taskViewPageId="storybook-page"
            onImageUpload={async (file) => {
              appendEvent(`Image upload simulated for ${file.name}`)
              return {
                src: URL.createObjectURL(file),
                width: 1200,
                height: 800
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
            onEditorReady={() => appendEvent('Editor mounted and ready')}
          />
        </div>
      </div>

      <aside className="space-y-4 rounded-[28px] border border-border bg-background-subtle p-5">
        <div>
          <p className="text-sm font-semibold text-foreground">What to test here</p>
          <p className="mt-1 text-sm text-foreground-muted">
            Formatting, slash commands, mention suggestions, comment creation, file handlers, and
            embed placeholders.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-background p-4">
          <div className="text-sm font-medium text-foreground">Suggested checks</div>
          <ul className="mt-3 space-y-2 text-sm text-foreground-muted">
            <li>Type `/` to open the command menu.</li>
            <li>Type `@` to open mention suggestions.</li>
            <li>Select text and create a comment from the toolbar.</li>
            <li>
              Paste content to inspect editor mount and update timings in the Performance tab.
            </li>
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
          'Isolated rich text editor surface for typing, slash commands, mentions, comments, and embed placeholders.'
      }
    }
  },
  render: () => <RichTextEditorPlayground />
}
