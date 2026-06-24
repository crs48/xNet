import {
  Button,
  Checkbox,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@xnetjs/ui'

// Overlay component — rendered open so the card shows the real slide-out panel.
// cfg.overrides.Sheet: { cardMode: "single", viewport } contains the portal.
export const Default = () => (
  <Sheet defaultOpen modal={false}>
    <SheetContent side="right">
      <SheetHeader>
        <SheetTitle>Filters</SheetTitle>
        <SheetDescription>Narrow results by branch, ownership, and runtime.</SheetDescription>
      </SheetHeader>
      <div className="space-y-3 py-4">
        <Checkbox checked label="Owned by me" description="Only show pages you authored." />
        <Checkbox checked label="Has snapshots" description="Pages with captured previews." />
        <Checkbox label="Needs performance review" description="Flagged by the GPU profiler." />
      </div>
      <SheetFooter>
        <Button variant="outline">Reset</Button>
        <Button>Apply filters</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
)
