import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Bell,
  ChevronDown,
  Command as CommandIcon,
  FileText,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2
} from 'lucide-react'
import { useState, type ReactElement } from 'react'
import {
  CatalogCard,
  CatalogGrid,
  CatalogPage,
  CatalogSection,
  InlinePreview
} from '../storybook/Catalog'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './Accordion'
import { Badge } from './Badge'
import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './Collapsible'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from './Command'
import { IconButton } from './IconButton'
import { Input } from './Input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './Menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from './Modal'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger
} from './Popover'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ResizablePanel'
import { ScrollArea } from './ScrollArea'
import {
  Select,
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue
} from './Select'
import { Separator } from './Separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from './Sheet'
import { Switch } from './Switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs'
import { Tooltip } from './Tooltip'

const meta = {
  title: 'UI/Primitives/Catalog',
  component: Button,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function PrimitiveCatalogShowcase(): ReactElement {
  const [selectedOption, setSelectedOption] = useState('backlog')
  const [compoundOption, setCompoundOption] = useState('weekly')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [filtersEnabled, setFiltersEnabled] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [collapsibleOpen, setCollapsibleOpen] = useState(true)
  const [sortOrder, setSortOrder] = useState('recent')

  return (
    <CatalogPage
      title="Primitive UI Catalog"
      description="All shared primitive building blocks wired into the Storybook canvas with live Tailwind styling. This is the baseline surface for controls, overlays, layout primitives, and command interfaces."
    >
      <CatalogSection
        title="Actions and status"
        description="Buttons, badges, icon affordances, and high-frequency status treatments."
      >
        <CatalogGrid>
          <CatalogCard
            title="Buttons and badges"
            description="Variant, icon, loading, and removable-tag coverage in one place."
          >
            <InlinePreview>
              <Button>Save changes</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline" leftIcon={<Plus className="h-4 w-4" />}>
                New page
              </Button>
              <Button variant="destructive" rightIcon={<Trash2 className="h-4 w-4" />}>
                Delete
              </Button>
              <Button loading>Publishing</Button>
            </InlinePreview>
            <InlinePreview>
              <Badge>Live</Badge>
              <Badge variant="secondary" dot>
                Draft
              </Badge>
              <Badge variant="success">Synced</Badge>
              <Badge variant="warning">Needs review</Badge>
              <Badge variant="outline" removable onRemove={() => undefined}>
                local-only
              </Badge>
            </InlinePreview>
            <InlinePreview>
              <IconButton icon={<Settings className="h-4 w-4" />} label="Open settings" />
              <IconButton
                variant="default"
                icon={<Bell className="h-4 w-4" />}
                label="Notification center"
              />
              <IconButton
                variant="destructive"
                icon={<Trash2 className="h-4 w-4" />}
                label="Clear results"
              />
            </InlinePreview>
          </CatalogCard>

          <CatalogCard
            title="Form inputs"
            description="Text, select, checkbox, and switch primitives with realistic control states."
          >
            <div className="space-y-4">
              <Input
                defaultValue="Quarterly roadmap"
                leftElement={<FileText className="h-4 w-4" />}
                rightElement={<Sparkles className="h-4 w-4 text-primary" />}
              />
              <Input placeholder="Needs a validation state" error="Please provide a valid title." />
              <Select
                options={[
                  { value: 'backlog', label: 'Backlog' },
                  { value: 'planned', label: 'Planned' },
                  { value: 'shipped', label: 'Shipped' }
                ]}
                value={selectedOption}
                onValueChange={setSelectedOption}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <Checkbox
                  checked={notificationsEnabled}
                  onCheckedChange={(value) => setNotificationsEnabled(Boolean(value))}
                  label="Daily summary"
                  description="Send a rollout recap every morning."
                />
                <div className="flex items-center justify-between rounded-lg border border-border bg-background-subtle px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Experimental filters</p>
                    <p className="text-xs text-foreground-muted">
                      Enable fuzzy ranking and tag weight.
                    </p>
                  </div>
                  <Switch checked={filtersEnabled} onCheckedChange={setFiltersEnabled} />
                </div>
              </div>
            </div>
          </CatalogCard>
        </CatalogGrid>
      </CatalogSection>

      <CatalogSection
        title="Selection and disclosure"
        description="Compound examples matter here because these exports are reused directly in renderer code."
      >
        <CatalogGrid>
          <CatalogCard
            title="Tabs, accordion, and collapsible"
            description="Disclosure primitives with stateful content and token-aware spacing."
          >
            <Tabs defaultValue="activity">
              <TabsList>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <TabsContent value="activity">
                <p className="text-sm text-foreground-muted">
                  Recent mutations, sync pings, and command events.
                </p>
              </TabsContent>
              <TabsContent value="notes">
                <p className="text-sm text-foreground-muted">
                  Narrative context for the selected node.
                </p>
              </TabsContent>
              <TabsContent value="history">
                <p className="text-sm text-foreground-muted">
                  Timeline snapshots with author and timestamp metadata.
                </p>
              </TabsContent>
            </Tabs>

            <Separator />

            <Accordion type="multiple" defaultValue={['keyboard-shortcuts']}>
              <AccordionItem value="keyboard-shortcuts">
                <AccordionTrigger>Keyboard shortcuts</AccordionTrigger>
                <AccordionContent>
                  Use <code className="rounded bg-muted px-1 py-0.5 text-xs">cmd+k</code> to jump
                  directly into search and command execution.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="sharing">
                <AccordionTrigger>Share settings</AccordionTrigger>
                <AccordionContent>
                  Invitations can be revoked from the sidebar or the document header menu.
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <Collapsible open={collapsibleOpen} onOpenChange={setCollapsibleOpen}>
              <div className="rounded-lg border border-border">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium">
                  Renderer diagnostics
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${collapsibleOpen ? 'rotate-180' : ''}`}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3">
                  <p className="text-sm text-foreground-muted">
                    GPU layer count, route activity, and workspace preview health.
                  </p>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </CatalogCard>

          <CatalogCard
            title="Select compound API"
            description="The direct Base UI-style API used when a renderer needs more control than the simple wrapper."
          >
            <SelectRoot
              value={compoundOption}
              onValueChange={(value) => setCompoundOption(String(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a cadence" />
                <SelectIcon>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </SelectIcon>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily standup</SelectItem>
                <SelectItem value="weekly">Weekly review</SelectItem>
                <SelectItem value="monthly">Monthly retro</SelectItem>
              </SelectContent>
            </SelectRoot>

            <div className="rounded-lg border border-dashed border-border/70 p-3 text-sm text-foreground-muted">
              Current selection:{' '}
              <span className="font-medium text-foreground">{compoundOption}</span>
            </div>
          </CatalogCard>
        </CatalogGrid>
      </CatalogSection>

      <CatalogSection
        title="Overlays and commands"
        description="Interactive overlay primitives stay closed by default in the catalog, but all exported entry points are exercised here."
      >
        <CatalogGrid>
          <CatalogCard
            title="Popover, tooltip, dialog, and sheet"
            description="The same building blocks used by settings, comments, plugin install, and command surfaces."
          >
            <InlinePreview>
              <Tooltip content="Open the shared workspace">
                <Button variant="outline">Hover for tooltip</Button>
              </Tooltip>

              <Popover trigger={<Button variant="outline">Simple popover</Button>} align="end">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Live preview target</p>
                  <p className="text-xs text-foreground-muted">
                    Switch between the editor canvas and Storybook manager.
                  </p>
                </div>
              </Popover>

              <PopoverRoot>
                <PopoverTrigger render={<Button variant="ghost">Compound popover</Button>} />
                <PopoverContent align="end">
                  <PopoverTitle>Compound API</PopoverTitle>
                  <PopoverDescription>
                    Use the low-level exports when the renderer needs custom layout or focus
                    choreography.
                  </PopoverDescription>
                </PopoverContent>
              </PopoverRoot>
            </InlinePreview>

            <InlinePreview>
              <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogTrigger render={<Button>Open dialog</Button>} />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Promote component to shared UI</DialogTitle>
                    <DialogDescription>
                      Move duplicate renderer code into `@xnetjs/ui` and preserve app-specific logic
                      behind props.
                    </DialogDescription>
                  </DialogHeader>
                  <p className="text-sm text-foreground-muted">
                    This demo covers the compound modal export path.
                  </p>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={() => setModalOpen(false)}>Promote</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger render={<Button variant="secondary">Open sheet</Button>} />
                <SheetContent side="right">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>
                      Narrow by branch, ownership, and preview runtime.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="space-y-3 py-4">
                    <Checkbox checked label="Owned by me" />
                    <Checkbox checked label="Has snapshots" />
                    <Checkbox label="Needs performance review" />
                  </div>
                  <SheetFooter>
                    <Button variant="outline" onClick={() => setSheetOpen(false)}>
                      Reset
                    </Button>
                    <Button onClick={() => setSheetOpen(false)}>Apply</Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </InlinePreview>
          </CatalogCard>

          <CatalogCard
            title="Menus, scroll area, resizable panels, and command menu"
            description="Layout and high-density primitives rendered together because they typically appear in devtools-style shells."
          >
            <InlinePreview>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline">Menu demo</Button>} />
                <DropdownMenuPortal>
                  <DropdownMenuPositioner align="start">
                    <DropdownMenuContent>
                      <DropdownMenuLabel>View mode</DropdownMenuLabel>
                      <DropdownMenuItem>
                        <Search className="h-4 w-4" />
                        Search
                      </DropdownMenuItem>
                      <DropdownMenuCheckboxItem checked>Show hidden files</DropdownMenuCheckboxItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuRadioGroup value={sortOrder} onValueChange={setSortOrder}>
                        <DropdownMenuRadioItem value="recent">Most recent</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="alpha">Alphabetical</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenuPositioner>
                </DropdownMenuPortal>
              </DropdownMenu>
            </InlinePreview>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="h-64 overflow-hidden rounded-xl border border-border">
                <ResizablePanelGroup orientation="horizontal">
                  <ResizablePanel defaultSize={38} minSize={24}>
                    <ScrollArea className="h-full">
                      <div className="space-y-2 p-3">
                        {Array.from({ length: 18 }, (_, index) => (
                          <div
                            key={index}
                            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                          >
                            Story module {String(index + 1).padStart(2, '0')}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={62}>
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between border-b border-border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">Preview shell</p>
                          <p className="text-xs text-foreground-muted">
                            Drag the handle to validate density and spacing.
                          </p>
                        </div>
                        <IconButton
                          icon={<MoreHorizontal className="h-4 w-4" />}
                          label="More actions"
                        />
                      </div>
                      <div className="flex-1 p-3 text-sm text-foreground-muted">
                        Shared component development, embedded inside the IDE shell.
                      </div>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>

              <Command className="h-64 border border-border shadow-sm">
                <CommandInput placeholder="Search commands and panels..." />
                <CommandList>
                  <CommandEmpty>No commands found.</CommandEmpty>
                  <CommandGroup heading="Navigation">
                    <CommandItem>
                      <CommandIcon className="h-4 w-4" />
                      Open command palette
                      <CommandShortcut>⇧⌘P</CommandShortcut>
                    </CommandItem>
                    <CommandItem>
                      <Search className="h-4 w-4" />
                      Global search
                      <CommandShortcut>⌘K</CommandShortcut>
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                  <CommandGroup heading="Workspace">
                    <CommandItem>
                      <Filter className="h-4 w-4" />
                      Toggle filters
                    </CommandItem>
                    <CommandItem>
                      <Settings className="h-4 w-4" />
                      Open settings
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>
          </CatalogCard>
        </CatalogGrid>
      </CatalogSection>
    </CatalogPage>
  )
}

export const Overview: Story = {
  render: () => <PrimitiveCatalogShowcase />
}
