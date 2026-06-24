import {
  Button,
  PopoverRoot,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription
} from '@xnetjs/ui'

// Overlay component — rendered open via defaultOpen so the card shows the real popover surface.
// cfg.overrides.Popover: { cardMode: "single", viewport } contains the portal.
export const Default = () => (
  <PopoverRoot defaultOpen>
    <PopoverTrigger render={<Button variant="outline">Workspace settings</Button>} />
    <PopoverContent side="bottom" align="start">
      <PopoverTitle>Dimensions</PopoverTitle>
      <PopoverDescription>
        Set the width and height for the selected layer. Changes apply to every synced viewport.
      </PopoverDescription>
    </PopoverContent>
  </PopoverRoot>
)

export const RichContent = () => (
  <PopoverRoot defaultOpen>
    <PopoverTrigger render={<Button variant="outline">Share document</Button>} />
    <PopoverContent side="bottom" align="start">
      <PopoverTitle>Invite collaborators</PopoverTitle>
      <PopoverDescription>
        Anyone with the link can view this document.
      </PopoverDescription>
      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          value="xnet.app/d/quarterly-roadmap"
          className="flex-1 rounded-md border border-border bg-background-subtle px-2 py-1 text-xs text-foreground-muted"
        />
        <Button size="sm">Copy</Button>
      </div>
    </PopoverContent>
  </PopoverRoot>
)
