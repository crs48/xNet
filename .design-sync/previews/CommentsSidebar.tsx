import { CommentsSidebar, type CommentThreadData } from '@xnetjs/ui'

// Full-document comments side panel: lists unresolved threads (resolved collapsible),
// with reply / resolve / edit / delete affordances and a selected thread.
const MIN = 60_000
const HOUR = 60 * MIN

const openThread: CommentThreadData = {
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

const secondThread: CommentThreadData = {
  root: {
    id: 'thread-3',
    author: 'did:key:z6MkRiley',
    authorDisplayName: 'Riley',
    content: 'Can we add keyboard navigation to the thread list before we ship this?',
    createdAt: Date.now() - 50 * MIN
  },
  replies: [],
  resolved: false
}

const resolvedThread: CommentThreadData = {
  root: {
    id: 'thread-2',
    author: 'did:key:z6MkAvery',
    authorDisplayName: 'Avery',
    content: 'The performance panel should stay local-only and not become a CI merge gate.',
    createdAt: Date.now() - 2 * HOUR,
    edited: true
  },
  replies: [],
  resolved: true
}

export const Default = () => (
  <div className="h-[560px] w-80 overflow-hidden rounded-lg border border-border bg-background">
    <CommentsSidebar
      open
      onClose={() => undefined}
      threads={[openThread, secondThread, resolvedThread]}
      selectedThreadId="thread-1"
      onSelectThread={() => undefined}
      onReply={() => undefined}
      onResolve={() => undefined}
      onReopen={() => undefined}
      onDelete={() => undefined}
      onEdit={() => undefined}
    />
  </div>
)
