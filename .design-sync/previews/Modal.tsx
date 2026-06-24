import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@xnetjs/ui'

// Overlay component — rendered open so the card shows the real modal surface.
// cfg.overrides.Modal: { cardMode: "single", viewport } contains the portal.
// Modal.tsx exports the compound Dialog* parts; compose them open here.
export const Default = () => (
  <Dialog defaultOpen modal={false}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete workspace?</DialogTitle>
        <DialogDescription>
          This permanently removes “Q3 Roadmap” and all of its pages. This action cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <p className="text-sm text-foreground-muted">
        Members will lose access immediately. Exported snapshots are unaffected.
      </p>
      <DialogFooter>
        <Button variant="outline">Cancel</Button>
        <Button variant="destructive">Delete workspace</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
