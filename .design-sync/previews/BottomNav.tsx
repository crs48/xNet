import { BottomNav } from '@xnetjs/ui'
import { Bell, Home, MessageSquare, Search, User } from 'lucide-react'

// Mobile bottom navigation bar. It is `position:fixed` + `md:hidden` by design;
// for a self-contained card we pin it inside a relative phone-frame and force it
// visible at desktop widths via the same `!absolute … md:!block` overrides the
// component catalog uses. Items are icon + label, one active, optional badge.
export const Default = () => (
  <div className="relative mx-auto h-40 w-full max-w-sm overflow-hidden rounded-xl border border-border bg-background">
    <div className="space-y-2 p-4">
      <div className="h-3 w-2/3 rounded bg-background-muted" />
      <div className="h-3 w-1/2 rounded bg-background-muted" />
      <div className="h-3 w-3/5 rounded bg-background-muted" />
    </div>
    <BottomNav
      className="!absolute !bottom-0 !left-0 !right-0 md:!block"
      items={[
        { icon: <Home className="h-5 w-5" />, label: 'Home', active: true },
        { icon: <Search className="h-5 w-5" />, label: 'Search' },
        { icon: <MessageSquare className="h-5 w-5" />, label: 'Inbox', badge: 3 },
        { icon: <Bell className="h-5 w-5" />, label: 'Alerts', badge: 128 },
        { icon: <User className="h-5 w-5" />, label: 'Profile' }
      ]}
    />
  </div>
)

// A compact four-item bar (no badges) in a content shell, showing the active tint.
export const InShell = () => (
  <div className="relative mx-auto h-40 w-full max-w-sm overflow-hidden rounded-xl border border-border bg-background-subtle">
    <div className="space-y-2 p-4">
      <div className="h-3 w-2/3 rounded bg-background-muted" />
      <div className="h-3 w-1/2 rounded bg-background-muted" />
      <div className="h-3 w-3/4 rounded bg-background-muted" />
    </div>
    <BottomNav
      className="!absolute !bottom-0 !left-0 !right-0 md:!block"
      items={[
        { icon: <Home className="h-5 w-5" />, label: 'Home' },
        { icon: <Search className="h-5 w-5" />, label: 'Explore', active: true },
        { icon: <MessageSquare className="h-5 w-5" />, label: 'Chats' },
        { icon: <User className="h-5 w-5" />, label: 'You' }
      ]}
    />
  </div>
)
