import { Button, EmptyState } from '@xnetjs/ui'
import { FolderOpen, Inbox, Search, Users } from 'lucide-react'

export const Default = () => (
  <div className="max-w-md rounded-lg border border-border bg-background-subtle p-3">
    <EmptyState
      icon={<FolderOpen className="h-8 w-8" />}
      title="No documents yet"
      description="Create your first document to start collaborating. Everything syncs across your devices automatically."
      action={<Button>New document</Button>}
    />
  </div>
)

export const NoResults = () => (
  <div className="max-w-md rounded-lg border border-border bg-background-subtle p-3">
    <EmptyState
      icon={<Search className="h-8 w-8" />}
      title="No results for “roadmap”"
      description="Try a different search term or clear filters to see everything in this workspace."
      action={<Button variant="outline">Clear filters</Button>}
    />
  </div>
)

export const EmptyInbox = () => (
  <div className="max-w-md rounded-lg border border-border bg-background-subtle p-3">
    <EmptyState
      icon={<Inbox className="h-8 w-8" />}
      title="You're all caught up"
      description="No new notifications. We'll let you know when something needs your attention."
    />
  </div>
)

export const InviteTeam = () => (
  <div className="max-w-md rounded-lg border border-border bg-background-subtle p-3">
    <EmptyState
      icon={<Users className="h-8 w-8" />}
      title="It's just you in here"
      description="Invite teammates to share documents, leave comments, and edit in real time."
      action={<Button>Invite people</Button>}
    />
  </div>
)
