import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from '@xnetjs/ui'
import { ArrowRight, FilePlus, Search, Settings, Sparkles, Users } from 'lucide-react'

// Inline command palette — rendered in a fixed-height bordered box like the catalog.
export const Default = () => (
  <Command className="h-72 border border-border shadow-sm">
    <CommandInput placeholder="Search commands and pages..." />
    <CommandList>
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandGroup heading="Navigation">
        <CommandItem>
          <ArrowRight className="h-4 w-4" />
          Go to dashboard
          <CommandShortcut>G D</CommandShortcut>
        </CommandItem>
        <CommandItem>
          <Search className="h-4 w-4" />
          Global search
          <CommandShortcut>⌘K</CommandShortcut>
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="Actions">
        <CommandItem>
          <FilePlus className="h-4 w-4" />
          Create new page
          <CommandShortcut>⌘N</CommandShortcut>
        </CommandItem>
        <CommandItem>
          <Sparkles className="h-4 w-4" />
          Ask the assistant
        </CommandItem>
        <CommandItem>
          <Users className="h-4 w-4" />
          Invite teammate
        </CommandItem>
        <CommandItem>
          <Settings className="h-4 w-4" />
          Open settings
          <CommandShortcut>⌘,</CommandShortcut>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
)
