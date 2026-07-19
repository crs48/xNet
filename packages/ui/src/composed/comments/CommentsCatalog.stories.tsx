import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../primitives/Button'
import { CatalogCard, CatalogGrid, CatalogPage, CatalogSection } from '../../storybook/Catalog'
import { CommentBubble } from './CommentBubble'
import { CommentIsland } from './CommentIsland'
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

// ─── CommentIsland per-state stories (0375) ────────────────────────────────────
//
// The island is position:fixed and portals to body, so each story renders a
// real anchor element and hands the island a ref to it. `key` on the harness
// forces a remount per story so state does not leak between them.

function IslandStage({
  label,
  side = 'right',
  children
}: {
  label: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: (anchor: HTMLElement | null) => ReactElement | null
}): ReactElement {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <div className="flex min-h-[28rem] items-center justify-center p-12">
      <span
        ref={setAnchor}
        className="rounded bg-comment/30 px-1 py-0.5 text-sm"
        data-side={side}
      >
        {label}
      </span>
      {children(anchor)}
    </div>
  )
}

function islandThread(replyCount: number, resolved = false): CommentThreadData {
  return {
    root: createComment(
      'island-root',
      'Chris',
      'The composer used to sit here permanently, which is what crowded the thread out of the box.',
      20
    ),
    replies: Array.from({ length: replyCount }, (_, i) =>
      createComment(`island-reply-${i}`, i % 2 ? 'Pat' : 'Morgan', `Reply number ${i + 1}.`, 18 - i)
    ),
    resolved
  }
}

export const IslandSingleComment: Story = {
  name: 'Island / single comment',
  render: () => (
    <IslandStage label="a commented passage">
      {(anchor) => <CommentIsland thread={islandThread(0)} anchor={anchor} mode="full" open />}
    </IslandStage>
  )
}

export const IslandLongThread: Story = {
  name: 'Island / long thread (20 replies)',
  render: () => (
    <IslandStage label="a much-discussed passage">
      {(anchor) => <CommentIsland thread={islandThread(20)} anchor={anchor} mode="full" open />}
    </IslandStage>
  )
}

export const IslandResolved: Story = {
  name: 'Island / resolved',
  render: () => (
    <IslandStage label="a settled passage">
      {(anchor) => (
        <CommentIsland thread={islandThread(2, true)} anchor={anchor} mode="full" open />
      )}
    </IslandStage>
  )
}

export const IslandPreview: Story = {
  name: 'Island / hover preview',
  render: () => (
    <IslandStage label="hover me">
      {(anchor) => <CommentIsland thread={islandThread(3)} anchor={anchor} mode="preview" open />}
    </IslandStage>
  )
}

export const IslandComposing: Story = {
  name: 'Island / composing (new comment)',
  render: () => (
    <IslandStage label="the selected text" side="bottom">
      {(anchor) => (
        <CommentIsland
          anchor={anchor}
          mode="composing"
          open
          side="bottom"
          quotedText="the selected text"
        />
      )}
    </IslandStage>
  )
}

export const IslandOverlappingThreads: Story = {
  name: 'Island / overlapping threads',
  render: () => (
    <IslandStage label="two threads overlap here">
      {(anchor) => (
        <CommentIsland
          thread={islandThread(1)}
          anchor={anchor}
          mode="full"
          open
          position={{ index: 0, total: 3, onPrev: () => {}, onNext: () => {} }}
        />
      )}
    </IslandStage>
  )
}

export const IslandViewportEdge: Story = {
  name: 'Island / near the viewport edge',
  render: () => (
    <div className="flex min-h-[28rem] justify-end p-2">
      <IslandStage label="anchored at the right edge">
        {(anchor) => <CommentIsland thread={islandThread(2)} anchor={anchor} mode="full" open />}
      </IslandStage>
    </div>
  )
}
