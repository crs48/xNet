import { OrphanedThreadList, type OrphanedThread } from '@xnetjs/ui'

// Detached-thread recovery surface: comments whose anchors can no longer be resolved
// (deleted text/rows/objects), each with reattach / dismiss actions.
const HOUR = 60 * 60 * 1000

const orphanedThreads: OrphanedThread[] = [
  {
    comment: {
      id: 'orphan-1',
      author: 'did:key:z6MkJamie',
      authorDisplayName: 'Jamie',
      content: 'This note was attached to a sidebar row that no longer exists.',
      createdAt: Date.now() - 2 * HOUR,
      replyCount: 1
    },
    reason: 'row-deleted',
    context: 'Sidebar / Plugins / Bundled plugin installer'
  },
  {
    comment: {
      id: 'orphan-2',
      author: 'did:key:z6MkRiley',
      authorDisplayName: 'Riley',
      content: 'This inline mark lost its target after a refactor.',
      createdAt: Date.now() - 24 * HOUR,
      replyCount: 0
    },
    reason: 'text-deleted',
    context: 'Storybook route description'
  },
  {
    comment: {
      id: 'orphan-3',
      author: 'did:key:z6MkAvery',
      authorDisplayName: 'Avery',
      content: 'Was this object removed intentionally? It still had open questions.',
      createdAt: Date.now() - 3 * 24 * HOUR,
      replyCount: 2
    },
    reason: 'object-deleted',
    context: 'Canvas / Diagram node'
  }
]

export const Default = () => (
  <div className="max-w-md">
    <OrphanedThreadList
      orphanedThreads={orphanedThreads}
      onReattach={() => undefined}
      onDismiss={() => undefined}
      onSelect={() => undefined}
    />
  </div>
)
