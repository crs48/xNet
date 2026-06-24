import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@xnetjs/ui'
import { Search } from 'lucide-react'

// Overlay component — rendered open so the card shows the real menu surface.
// cfg.overrides.DropdownMenu: { cardMode: "single", viewport } contains the portal.
export const Default = () => (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger render={<Button variant="outline">View</Button>} />
    <DropdownMenuPortal>
      <DropdownMenuPositioner align="start">
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>View options</DropdownMenuLabel>
            <DropdownMenuItem>
              <Search className="h-4 w-4" />
              Search files
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem checked>Show hidden files</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem>Preview pane</DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-xs font-medium text-foreground-muted">Sort by</div>
          <DropdownMenuRadioGroup value="recent">
            <DropdownMenuRadioItem value="recent">Most recent</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="alpha">Alphabetical</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="size">File size</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenuPositioner>
    </DropdownMenuPortal>
  </DropdownMenu>
)
