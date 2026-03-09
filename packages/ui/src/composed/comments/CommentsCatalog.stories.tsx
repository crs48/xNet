import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../primitives/Button'
import { CatalogCard, CatalogGrid, CatalogPage, CatalogSection } from '../../storybook/Catalog'
import { CommentBubble } from './CommentBubble'
import { CommentPopover, type CommentData, type CommentThreadData } from './CommentPopover'
import { CommentsSidebar } from './CommentsSidebar'
import { OrphanedThreadList, type OrphanedThread } from './OrphanedThreadList'
import { ThreadPicker, type ThreadPreview } from './ThreadPicker'

const meta = {
  title: 'UI/Comments/Catalog',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function createComment(
  id: string,
  authorDisplayName: string,
  content: string,
  offsetMinutes: number,
  extras: Partial<CommentData> = {}
): CommentData {
  return {
    id,
    author: `did:key:${id}`,
    authorDisplayName,
    content,
    createdAt: Date.now() - offsetMinutes * 60_000,
    ...extras
  }
}

function CommentsCatalogShowcase(): ReactElement {
  const [popoverMode, setPopoverMode] = useState<'preview' | 'full'>('preview')
  const [popoverOpen, setPopoverOpen] = useState(true)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>('thread-1')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [pickerDismissed, setPickerDismissed] = useState(false)

  const thread = useMemo<CommentThreadData>(
    () => ({
      root: createComment(
        'thread-1',
        'Chris',
        'We should expose Storybook directly in the shell so component work stays in the same flow.',
        14
      ),
      replies: [
        createComment(
          'reply-1',
          'Pat',
          'Agreed. Start with a dev-only surface and keep it embedded.',
          11,
          {
            replyToUser: 'Chris',
            replyToCommentId: 'thread-1'
          }
        ),
        createComment(
          'reply-2',
          'Morgan',
          'Once the catalog is broad enough, it becomes a reliable extraction tool for shared UI.',
          8,
          {
            replyToUser: 'Pat',
            replyToCommentId: 'reply-1'
          }
        )
      ],
      resolved: false
    }),
    []
  )

  const additionalThread = useMemo<CommentThreadData>(
    () => ({
      root: createComment(
        'thread-2',
        'Avery',
        'The performance panel should stay local-only and not become a CI merge gate.',
        35,
        { edited: true }
      ),
      replies: [],
      resolved: true
    }),
    []
  )

  const orphanedThreads = useMemo<OrphanedThread[]>(
    () => [
      {
        comment: {
          id: 'orphan-1',
          author: 'did:key:orphan-1',
          authorDisplayName: 'Jamie',
          content: 'This note was attached to a sidebar row that no longer exists.',
          createdAt: Date.now() - 2 * 60 * 60 * 1000,
          replyCount: 1
        },
        reason: 'row-deleted',
        context: 'Sidebar / Plugins / Bundled plugin installer'
      },
      {
        comment: {
          id: 'orphan-2',
          author: 'did:key:orphan-2',
          authorDisplayName: 'Riley',
          content: 'This inline mark lost its target after a refactor.',
          createdAt: Date.now() - 24 * 60 * 60 * 1000,
          replyCount: 0
        },
        reason: 'text-deleted',
        context: 'Storybook route description'
      }
    ],
    []
  )

  const threadPreviews = useMemo<ThreadPreview[]>(
    () => [
      {
        id: 'thread-1',
        author: thread.root.author,
        authorDisplayName: thread.root.authorDisplayName,
        contentPreview: thread.root.content,
        replyCount: thread.replies.length,
        resolved: thread.resolved,
        createdAt: thread.root.createdAt
      },
      {
        id: 'thread-2',
        author: additionalThread.root.author,
        authorDisplayName: additionalThread.root.authorDisplayName,
        contentPreview: additionalThread.root.content,
        replyCount: additionalThread.replies.length,
        resolved: additionalThread.resolved,
        createdAt: additionalThread.root.createdAt
      }
    ],
    [additionalThread, thread]
  )

  return (
    <CatalogPage
      title="Comments catalog"
      description="Thread previews, inline popovers, overlap pickers, and sidebar workflows. These stories make the comment system inspectable without booting the editor."
    >
      <CatalogSection
        title="Conversation surfaces"
        description="Individual comment bubbles, inline thread popovers, and the thread picker for overlapping marks."
      >
        <CatalogGrid>
          <CatalogCard
            title="Comment bubble and popover"
            description="Hover actions, edit affordances, preview mode, and full-thread mode in one story."
          >
            <div className="rounded-2xl border border-border bg-background-subtle p-4">
              <CommentBubble
                {...thread.root}
                onReplyTo={() => setPopoverMode('full')}
                onStartEdit={() => undefined}
                onDelete={() => undefined}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPopoverMode('preview')}>
                Preview mode
              </Button>
              <Button variant="outline" onClick={() => setPopoverMode('full')}>
                Full mode
              </Button>
              <Button variant="secondary" onClick={() => setPopoverOpen((value) => !value)}>
                {popoverOpen ? 'Hide' : 'Show'} popover
              </Button>
            </div>

            <div className="relative h-[360px] overflow-hidden rounded-2xl border border-border bg-background">
              <div className="p-5 text-sm text-foreground-muted">
                Click the controls above to switch between preview and full thread mode.
              </div>
              <CommentPopover
                thread={thread}
                anchor={{ x: 32, y: 72 }}
                mode={popoverMode}
                open={popoverOpen}
                onUpgradeToFull={() => setPopoverMode('full')}
                onDismiss={() => setPopoverOpen(false)}
                onReply={() => undefined}
                onResolve={() => undefined}
                onReopen={() => undefined}
                onDelete={() => undefined}
                onEdit={() => undefined}
              />
            </div>
          </CatalogCard>

          <CatalogCard
            title="Thread picker"
            description="Used when multiple comment threads overlap the same text range."
          >
            <div className="relative h-[360px] overflow-hidden rounded-2xl border border-border bg-background-subtle">
              <div className="p-5 text-sm text-foreground-muted">
                This picker is anchored by coordinates and dismisses on outside click or escape.
              </div>
              {!pickerDismissed ? (
                <ThreadPicker
                  anchor={{ x: 24, y: 96 }}
                  threads={threadPreviews}
                  onSelect={(id) => setSelectedThreadId(id)}
                  onDismiss={() => setPickerDismissed(true)}
                />
              ) : (
                <div className="p-5">
                  <Button variant="outline" onClick={() => setPickerDismissed(false)}>
                    Reopen picker
                  </Button>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border bg-background p-3 text-sm text-foreground-muted">
              Selected thread:{' '}
              <span className="font-medium text-foreground">{selectedThreadId}</span>
            </div>
          </CatalogCard>
        </CatalogGrid>
      </CatalogSection>

      <CatalogSection
        title="Sidebar and orphan handling"
        description="The full-document sidebar and detached-thread recovery UI are both represented here."
      >
        <CatalogGrid>
          <CatalogCard
            title="Comments sidebar"
            description="Lists unresolved and resolved threads, supports reply flows, and tracks selection."
          >
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSidebarOpen((value) => !value)}>
                {sidebarOpen ? 'Close' : 'Open'} sidebar
              </Button>
            </div>
            <div className="h-[520px] overflow-hidden rounded-2xl border border-border bg-background">
              <CommentsSidebar
                open={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                threads={[thread, additionalThread]}
                selectedThreadId={selectedThreadId}
                onSelectThread={setSelectedThreadId}
                onReply={() => undefined}
                onResolve={() => undefined}
                onReopen={() => undefined}
                onDelete={() => undefined}
                onEdit={() => undefined}
              />
            </div>
          </CatalogCard>

          <CatalogCard
            title="Orphaned thread list"
            description="Detached-thread recovery surface for deleted text, rows, and invalid anchors."
          >
            <OrphanedThreadList
              orphanedThreads={orphanedThreads}
              onReattach={() => undefined}
              onDismiss={() => undefined}
              onSelect={setSelectedThreadId}
            />
          </CatalogCard>
        </CatalogGrid>
      </CatalogSection>
    </CatalogPage>
  )
}

export const Overview: Story = {
  render: () => <CommentsCatalogShowcase />
}
