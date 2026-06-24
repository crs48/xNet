import { CommentBubble } from '@xnetjs/ui'

// One comment in a thread: avatar, author, relative timestamp, markdown body, hover actions.
const HOUR = 60 * 60 * 1000

export const Default = () => (
  <div className="max-w-md rounded-lg border border-border bg-background p-3">
    <CommentBubble
      id="comment-1"
      author="did:key:z6MkChris"
      authorDisplayName="Chris"
      content="We should expose Storybook directly in the shell so component work stays in the same flow."
      createdAt={Date.now() - 14 * 60_000}
      onReplyTo={() => undefined}
      onStartEdit={() => undefined}
      onDelete={() => undefined}
    />
  </div>
)

export const Reply = () => (
  <div className="max-w-md rounded-lg border border-border bg-background p-3">
    <CommentBubble
      id="reply-1"
      author="did:key:z6MkPat"
      authorDisplayName="Pat"
      content="Agreed. Start with a dev-only surface and keep it embedded so we don't fork the build."
      createdAt={Date.now() - 11 * 60_000}
      replyToUser="Chris"
      replyToCommentId="comment-1"
      onReplyTo={() => undefined}
      onStartEdit={() => undefined}
      onDelete={() => undefined}
    />
  </div>
)

export const Edited = () => (
  <div className="max-w-md rounded-lg border border-border bg-background p-3">
    <CommentBubble
      id="comment-2"
      author="did:key:z6MkAvery"
      authorDisplayName="Avery"
      content="The performance panel should stay local-only and not become a CI merge gate."
      createdAt={Date.now() - 2 * HOUR}
      edited
      editedAt={Date.now() - 35 * 60_000}
      onReplyTo={() => undefined}
      onStartEdit={() => undefined}
      onDelete={() => undefined}
    />
  </div>
)
