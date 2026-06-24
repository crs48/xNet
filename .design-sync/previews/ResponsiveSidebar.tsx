import {
  ResponsiveSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarNav,
  SidebarNavItem,
  SidebarSection
} from '@xnetjs/ui'
import { Bell, Home, Inbox, Layers3, ListTodo, Settings2, UserCircle2 } from 'lucide-react'

// Adaptive sidebar: full nav on desktop (lg+), icons-only on tablet (md), a
// hamburger-triggered Sheet on mobile. The default 900px capture viewport
// renders the tablet collapsed (icons-only) variant; the full nav is provided
// via children and the icon rail via collapsedContent.

export const Default = () => (
  <div className="flex h-[420px] overflow-hidden rounded-lg border border-border bg-background">
    <ResponsiveSidebar
      collapsedContent={
        <SidebarNav className="px-2 py-3">
          <SidebarNavItem icon={<Home className="h-4 w-4" />}>
            <span className="sr-only">Overview</span>
          </SidebarNavItem>
          <SidebarNavItem icon={<Inbox className="h-4 w-4" />} active>
            <span className="sr-only">Inbox</span>
          </SidebarNavItem>
          <SidebarNavItem icon={<ListTodo className="h-4 w-4" />}>
            <span className="sr-only">Tasks</span>
          </SidebarNavItem>
          <SidebarNavItem icon={<Settings2 className="h-4 w-4" />}>
            <span className="sr-only">Settings</span>
          </SidebarNavItem>
        </SidebarNav>
      }
    >
      <SidebarHeader>
        <div>
          <p className="text-sm font-semibold">OpenCode</p>
          <p className="text-xs text-sidebar-foreground/70">Component workspace</p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarSection title="Workbench">
          <SidebarNav>
            <SidebarNavItem icon={<Home className="h-4 w-4" />} active>
              Overview
            </SidebarNavItem>
            <SidebarNavItem icon={<Layers3 className="h-4 w-4" />}>Stories</SidebarNavItem>
            <SidebarNavItem icon={<ListTodo className="h-4 w-4" />}>Tasks</SidebarNavItem>
            <SidebarNavItem icon={<Bell className="h-4 w-4" />}>Activity</SidebarNavItem>
          </SidebarNav>
        </SidebarSection>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-3 text-sm">
          <UserCircle2 className="h-5 w-5" />
          <span>Chris</span>
        </div>
      </SidebarFooter>
    </ResponsiveSidebar>

    <main className="flex flex-1 flex-col gap-2 p-5">
      <p className="text-lg font-semibold">Responsive shell</p>
      <p className="text-sm text-foreground-muted">
        The sidebar collapses to an icon rail on tablet and a hamburger-triggered sheet on mobile,
        all sharing one token system.
      </p>
    </main>
  </div>
)
