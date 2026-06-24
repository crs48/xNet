import { ThreadPicker, type ThreadPreview } from '@xnetjs/ui'

// Picker shown when several comment threads overlap the same text range. NOTE: renders with
// position:fixed at the anchor coords (viewport-relative, not card-relative). Anchored near
// top-left inside a tall relative host. Likely needs config cardMode:single + viewport
// ~340x360 to contain the fixed-positioned panel cleanly.
const MIN = 60_000

const threads: ThreadPreview[] = [
  {
    id: 'thread-1',
    author: 'did:key:z6MkChris',
    authorDisplayName: 'Chris',
    contentPreview:
      'We should expose Storybook directly in the shell so component work stays in the same flow.',
    replyCount: 2,
    resolved: false,
    createdAt: Date.now() - 14 * MIN
  },
  {
    id: 'thread-2',
    author: 'did:key:z6MkAvery',
    authorDisplayName: 'Avery',
    contentPreview: 'The performance panel should stay local-only and not become a CI merge gate.',
    replyCount: 0,
    resolved: true,
    createdAt: Date.now() - 35 * MIN
  },
  {
    id: 'thread-3',
    author: 'did:key:z6MkRiley',
    authorDisplayName: 'Riley',
    contentPreview: 'Can we add keyboard navigation to the thread list before we ship this?',
    replyCount: 1,
    resolved: false,
    createdAt: Date.now() - 50 * MIN
  }
]

export const Default = () => (
  <div className="relative h-[340px] w-full overflow-hidden rounded-lg border border-border bg-background-subtle">
    <ThreadPicker
      anchor={{ x: 16, y: 16 }}
      threads={threads}
      onSelect={() => undefined}
      onDismiss={() => undefined}
    />
  </div>
)
