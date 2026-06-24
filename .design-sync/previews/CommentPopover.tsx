import { CommentPopover, type CommentThreadData } from '@xnetjs/ui'

// Inline thread popover. NOTE: renders with position:fixed at the anchor coords, so it
// positions relative to the viewport (not the card). Anchored near top-left and given a
// tall relative host so the open panel is visible. Likely needs config cardMode:single +
// viewport ~440x520 to contain the fixed-positioned surface cleanly.
const MIN = 60_000

const thread: CommentThreadData = {
  root: {
    id: 'thread-1',
    author: 'did:key:z6MkChris',
    authorDisplayName: 'Chris',
    content:
      'We should expose Storybook directly in the shell so component work stays in the same flow.',
    createdAt: Date.now() - 14 * MIN
  },
  replies: [
    {
      id: 'reply-1',
      author: 'did:key:z6MkPat',
      authorDisplayName: 'Pat',
      content: 'Agreed. Start with a dev-only surface and keep it embedded.',
      createdAt: Date.now() - 11 * MIN,
      replyToUser: 'Chris',
      replyToCommentId: 'thread-1'
    },
    {
      id: 'reply-2',
      author: 'did:key:z6MkMorgan',
      authorDisplayName: 'Morgan',
      content:
        'Once the catalog is broad enough, it becomes a reliable extraction tool for shared UI.',
      createdAt: Date.now() - 8 * MIN,
      replyToUser: 'Pat',
      replyToCommentId: 'reply-1'
    }
  ],
  resolved: false
}

const previewThread: CommentThreadData = {
  root: {
    id: 'thread-2',
    author: 'did:key:z6MkAvery',
    authorDisplayName: 'Avery',
    content: 'The performance panel should stay local-only and not become a CI merge gate.',
    createdAt: Date.now() - 35 * MIN
  },
  replies: [
    {
      id: 'reply-3',
      author: 'did:key:z6MkRiley',
      authorDisplayName: 'Riley',
      content: 'Makes sense — keep it opt-in.',
      createdAt: Date.now() - 30 * MIN
    }
  ],
  resolved: false
}

export const FullThread = () => (
  <div className="relative h-[460px] w-full overflow-hidden rounded-lg border border-border bg-background-subtle">
    <CommentPopover
      thread={thread}
      anchor={{ x: 16, y: 16 }}
      mode="full"
      open
      onUpgradeToFull={() => undefined}
      onDismiss={() => undefined}
      onReply={() => undefined}
      onResolve={() => undefined}
      onReopen={() => undefined}
      onDelete={() => undefined}
      onEdit={() => undefined}
    />
  </div>
)

export const PreviewMode = () => (
  <div className="relative h-[200px] w-full overflow-hidden rounded-lg border border-border bg-background-subtle">
    <CommentPopover
      thread={previewThread}
      anchor={{ x: 16, y: 16 }}
      mode="preview"
      open
      onUpgradeToFull={() => undefined}
      onDismiss={() => undefined}
    />
  </div>
)
