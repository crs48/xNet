import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Bell,
  Home,
  Inbox,
  Layers3,
  ListTodo,
  MessageSquare,
  Search,
  Settings2,
  Sparkles,
  UserCircle2
} from 'lucide-react'
import { useMemo, useState, type ReactElement } from 'react'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import {
  CatalogCard,
  CatalogGrid,
  CatalogPage,
  CatalogSection,
  InlinePreview
} from '../storybook/Catalog'
import { AccessibleButton, AccessibleIconButton } from './AccessibleButton'
import { AccessibleInput, AccessibleTextarea } from './AccessibleInput'
import { BottomNav, BottomNavSpacer } from './BottomNav'
import { ColorPicker } from './ColorPicker'
import { DatePicker } from './DatePicker'
import { DIDAvatar } from './DIDAvatar'
import { EmptyState } from './EmptyState'
import { MarkdownContent } from './MarkdownContent'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogRoot,
  ResponsiveDialogTitle
} from './ResponsiveDialog'
import {
  ResponsiveSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarNav,
  SidebarNavItem,
  SidebarSection
} from './ResponsiveSidebar'
import { ResponsiveTable, type ResponsiveTableColumn } from './ResponsiveTable'
import { SearchInput } from './SearchInput'
import { Skeleton, SkeletonAvatar, SkeletonButton, SkeletonCard, SkeletonText } from './Skeleton'
import { SkipLink, SkipLinks } from './SkipLink'
import { TagInput } from './TagInput'

const meta = {
  title: 'UI/Components/Catalog',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

type TableRow = {
  id: string
  title: string
  owner: string
  status: string
  updated: string
}

const tableColumns: ResponsiveTableColumn<TableRow>[] = [
  { key: 'title', header: 'Surface', primary: true },
  { key: 'owner', header: 'Owner' },
  {
    key: 'status',
    header: 'Status',
    render: (value) => (
      <Badge variant={value === 'Live' ? 'success' : 'secondary'}>{String(value)}</Badge>
    )
  },
  { key: 'updated', header: 'Updated', align: 'right' }
]

const tableRows: TableRow[] = [
  { id: '1', title: 'Storybook manager', owner: 'UI Platform', status: 'Live', updated: '2m ago' },
  { id: '2', title: 'Preview workspace', owner: 'Codex', status: 'Draft', updated: '18m ago' },
  { id: '3', title: 'Electron menu', owner: 'Desktop', status: 'Live', updated: '1h ago' }
]

function ComponentCatalogShowcase(): ReactElement {
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date('2026-03-09T17:00:00Z'))
  const [accentColor, setAccentColor] = useState('#0ea5e9')
  const [tags, setTags] = useState(['storybook', 'electron', 'preview'])
  const [searchQuery, setSearchQuery] = useState('embedded stories')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [compoundDialogOpen, setCompoundDialogOpen] = useState(false)

  const markdownExample = useMemo(
    () =>
      [
        '### Story-driven rollout',
        '',
        '- Keep Storybook embedded in the app shell.',
        '- Use `@github-ui/storybook-addon-performance-panel` for local diagnostics.',
        '- Promote duplicate renderer components only after the story surface stabilizes.',
        '',
        '> Docs mode is useful, but canvas mode is where the performance panel is accurate.',
        '',
        '| Runtime | Status |',
        '| --- | --- |',
        '| Electron | Ready |',
        '| Web | Ready |'
      ].join('\n'),
    []
  )

  return (
    <CatalogPage
      title="Shared Component Catalog"
      description="Input surfaces, responsive shells, loading states, markdown, and accessibility helpers. This catalog is intentionally broad so the UI package can be exercised without booting a full app runtime."
    >
      <CatalogSection
        title="Inputs and authored content"
        description="These components are the day-to-day ergonomics layer above the primitives."
      >
        <CatalogGrid>
          <CatalogCard
            title="Date, color, tags, and search"
            description="Stateful authored-input components with Tailwind-driven spacing and borders."
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <DatePicker value={selectedDate} onChange={setSelectedDate} />
              <ColorPicker value={accentColor} onChange={setAccentColor} />
            </div>
            <TagInput value={tags} onChange={setTags} />
            <SearchInput
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              onClear={() => setSearchQuery('')}
            />
            <div className="rounded-xl border border-border bg-background-subtle p-3 text-sm text-foreground-muted">
              Current configuration: {accentColor} accent, {tags.length} tags,{' '}
              {selectedDate?.toLocaleDateString('en-US') ?? 'no date selected'}.
            </div>
          </CatalogCard>

          <CatalogCard
            title="Markdown and empty states"
            description="Compact content rendering, empty states, and skeletons for asynchronous surfaces."
          >
            <div className="rounded-xl border border-border bg-background p-4">
              <MarkdownContent content={markdownExample} />
            </div>

            <div className="rounded-xl border border-border bg-background p-4">
              <EmptyState
                icon={<Sparkles className="h-8 w-8" />}
                title="No active experiments"
                description="Create a story, compare it to the production UI, and track regressions from the same shell."
                action={<Button>Create a story</Button>}
              />
            </div>

            <InlinePreview className="items-center">
              <Skeleton width={140} height={16} />
              <SkeletonAvatar size={36} />
              <SkeletonButton />
            </InlinePreview>
            <SkeletonText lines={3} />
            <SkeletonCard />
          </CatalogCard>
        </CatalogGrid>
      </CatalogSection>

      <CatalogSection
        title="Identity, accessibility, and navigation"
        description="These are the pieces that make the shell feel product-grade rather than demo-grade."
      >
        <CatalogGrid>
          <CatalogCard
            title="Identity and accessible controls"
            description="Deterministic avatars plus enhanced ARIA affordances for loading and validation."
          >
            <InlinePreview className="items-center">
              <DIDAvatar did="did:key:z6Mkp5cs2f9TAzWQ7zA4CM6CwFo4wQ9Q9CX6JvB4a3Zr3r2B" />
              <DIDAvatar did="did:key:z6MksdbQ7j3ZVhQkQ7u4N8o6gPv6mP8Q3gW6hZ9pA2wR5d1C" />
              <DIDAvatar did="did:key:z6Mkf9Q6BzL7yXv2Y3c4R5q7P8s9T0u1V2w3X4y5Z6a7B8c9" />
            </InlinePreview>

            <div className="grid gap-4">
              <AccessibleInput
                label="Workspace name"
                hint="This appears in previews, stories, and generated docs."
                defaultValue="OpenCode"
              />
              <AccessibleInput
                label="Storybook URL"
                error="Use a reachable local URL while embedding Storybook in the web app."
                defaultValue="localhost:6006"
              />
              <AccessibleTextarea
                label="Release notes"
                hint="Visible in the changelog drawer."
                defaultValue="Embedded Storybook is now available from Electron and Web."
              />
            </div>

            <InlinePreview>
              <AccessibleButton loading>Saving preferences</AccessibleButton>
              <AccessibleButton variant="outline">Save preferences</AccessibleButton>
              <AccessibleIconButton
                icon={<Settings2 className="h-4 w-4" />}
                label="Open preferences"
              />
            </InlinePreview>
          </CatalogCard>

          <CatalogCard
            title="Skip links and responsive navigation"
            description="A small, focused shell preview that exercises the responsive sidebar, bottom nav, and skip navigation exports."
          >
            <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
              <SkipLink />
              <SkipLinks
                links={[
                  { href: '#shell-nav', label: 'Skip to navigation' },
                  { href: '#shell-main', label: 'Skip to content' }
                ]}
              />
              <div className="grid min-h-[360px] lg:grid-cols-[280px_minmax(0,1fr)]">
                <ResponsiveSidebar
                  collapsedContent={
                    <SidebarNav className="px-2 py-3">
                      <SidebarNavItem icon={<Home className="h-4 w-4" />}>
                        <span className="sr-only">Overview</span>
                      </SidebarNavItem>
                      <SidebarNavItem icon={<Inbox className="h-4 w-4" />} active>
                        <span className="sr-only">Inbox</span>
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
                      <div id="shell-nav">
                        <SidebarNav>
                          <SidebarNavItem icon={<Home className="h-4 w-4" />} active>
                            Overview
                          </SidebarNavItem>
                          <SidebarNavItem icon={<Layers3 className="h-4 w-4" />}>
                            Stories
                          </SidebarNavItem>
                          <SidebarNavItem icon={<ListTodo className="h-4 w-4" />}>
                            Tasks
                          </SidebarNavItem>
                          <SidebarNavItem icon={<Bell className="h-4 w-4" />}>
                            Activity
                          </SidebarNavItem>
                        </SidebarNav>
                      </div>
                    </SidebarSection>
                  </SidebarContent>
                  <SidebarFooter>
                    <div className="flex items-center gap-3 text-sm">
                      <UserCircle2 className="h-5 w-5" />
                      <span>Chris</span>
                    </div>
                  </SidebarFooter>
                </ResponsiveSidebar>

                <main id="shell-main" className="relative flex flex-col gap-4 bg-background p-5">
                  <div>
                    <p className="text-lg font-semibold">Responsive shell preview</p>
                    <p className="text-sm text-foreground-muted">
                      Sidebar, content, and mobile bottom navigation share one token system.
                    </p>
                  </div>
                  <ResponsiveTable data={tableRows} columns={tableColumns} keyField="id" striped />
                  <BottomNavSpacer />
                  <div className="relative h-24 overflow-hidden rounded-xl border border-dashed border-border bg-background-subtle">
                    <BottomNav
                      className="!absolute !left-0 !right-0 !bottom-0 md:!block"
                      items={[
                        { icon: <Home className="h-4 w-4" />, label: 'Home', active: true },
                        { icon: <Search className="h-4 w-4" />, label: 'Search' },
                        { icon: <MessageSquare className="h-4 w-4" />, label: 'Notes', badge: 3 },
                        { icon: <Settings2 className="h-4 w-4" />, label: 'Prefs' }
                      ]}
                    />
                  </div>
                </main>
              </div>
            </div>
          </CatalogCard>
        </CatalogGrid>
      </CatalogSection>

      <CatalogSection
        title="Responsive dialogs and data-heavy views"
        description="A single story should let you inspect layout changes without booting the web app or Electron."
      >
        <CatalogGrid>
          <CatalogCard
            title="Responsive dialog"
            description="The convenience wrapper and the lower-level root/content/header/footer exports are both exercised here."
          >
            <InlinePreview>
              <Button onClick={() => setDialogOpen(true)}>Open responsive dialog</Button>
              <Button variant="outline" onClick={() => setCompoundDialogOpen(true)}>
                Open compound dialog
              </Button>
            </InlinePreview>

            <ResponsiveDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              title="Promote duplicated component"
              description="Shared UI should absorb renderer duplication only after the stories prove the extraction path."
              footer={
                <>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setDialogOpen(false)}>Promote</Button>
                </>
              }
            >
              <div className="space-y-3 text-sm text-foreground-muted">
                <p>
                  Target package: <span className="font-medium text-foreground">@xnetjs/ui</span>
                </p>
                <p>Owner: Desktop + Web</p>
                <p>Validation: Storybook canvas, a11y, and local performance panel.</p>
              </div>
            </ResponsiveDialog>

            <ResponsiveDialogRoot open={compoundDialogOpen} onOpenChange={setCompoundDialogOpen}>
              <ResponsiveDialogContent className="bg-background">
                <ResponsiveDialogHeader>
                  <ResponsiveDialogTitle>Compound API preview</ResponsiveDialogTitle>
                  <ResponsiveDialogDescription>
                    This exercises the exported root and content primitives directly.
                  </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>
                <div className="py-4 text-sm text-foreground-muted">
                  Use the convenience wrapper for common dialogs and the compound exports for
                  shell-specific layouts.
                </div>
                <ResponsiveDialogFooter>
                  <Button variant="outline" onClick={() => setCompoundDialogOpen(false)}>
                    Close
                  </Button>
                  <Button onClick={() => setCompoundDialogOpen(false)}>Continue</Button>
                </ResponsiveDialogFooter>
              </ResponsiveDialogContent>
            </ResponsiveDialogRoot>
          </CatalogCard>

          <CatalogCard
            title="Responsive table"
            description="The same data surface can be inspected in story isolation before wiring it into a route."
          >
            <ResponsiveTable
              data={tableRows}
              columns={tableColumns}
              keyField="id"
              hoverable
              striped
            />
          </CatalogCard>
        </CatalogGrid>
      </CatalogSection>
    </CatalogPage>
  )
}

export const Overview: Story = {
  render: () => <ComponentCatalogShowcase />
}
