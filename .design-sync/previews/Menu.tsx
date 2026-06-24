import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@xnetjs/ui'
import { Copy, Pencil, Share2, Trash2 } from 'lucide-react'

// Overlay component — rendered open so the card shows the real menu surface.
// cfg.overrides.Menu: { cardMode: "single", viewport } contains the portal.
// The simple <Menu> wrapper doesn't forward `defaultOpen` to its Base UI root,
// so the open card uses the compound DropdownMenu* parts (same Menu module).
export const Default = () => (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger render={<Button variant="outline">Page actions</Button>} />
    <DropdownMenuPortal>
      <DropdownMenuPositioner align="start">
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Page actions</DropdownMenuLabel>
            <DropdownMenuItem>
              <Pencil className="h-4 w-4" />
              Rename
              <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy className="h-4 w-4" />
              Duplicate
              <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Share2 className="h-4 w-4" />
              Share link
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive">
            <Trash2 className="h-4 w-4" />
            Delete page
            <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPositioner>
    </DropdownMenuPortal>
  </DropdownMenu>
)
