import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@xnetjs/ui'

// Overlay component — rendered open so the card shows the real dialog surface.
// cfg.overrides.Dialog: { cardMode: "single", viewport } contains the portal.
export const Default = () => (
  <Dialog defaultOpen modal={false}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Promote component to shared UI</DialogTitle>
        <DialogDescription>
          Move duplicate renderer code into @xnetjs/ui and preserve app-specific logic behind
          props.
        </DialogDescription>
      </DialogHeader>
      <p className="text-sm text-foreground-muted">
        Dialogs anchor focus, dim the background, and dismiss on escape or outside click.
      </p>
      <DialogFooter>
        <Button variant="outline">Cancel</Button>
        <Button>Promote</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
