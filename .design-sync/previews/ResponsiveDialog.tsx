import { Button, ResponsiveDialog } from '@xnetjs/ui'

// Adaptive dialog: a centered modal on desktop, a bottom sheet on mobile.
// Pre-configured single-card mode (640x460) so it renders OPEN here.
// `open` is fixed true and `onOpenChange` is a no-op for a static preview.

const noop = () => {}

export const Default = () => (
  <ResponsiveDialog
    open
    onOpenChange={noop}
    title="Promote duplicated component"
    description="Shared UI should absorb renderer duplication only after the stories prove the extraction path."
    footer={
      <>
        <Button variant="outline">Cancel</Button>
        <Button>Promote</Button>
      </>
    }
  >
    <div className="space-y-3 text-sm text-foreground-muted">
      <p>
        Target package: <span className="font-medium text-foreground">@xnetjs/ui</span>
      </p>
      <p>Owner: Desktop + Web</p>
      <p>Validation: Storybook canvas, a11y audit, and the local performance panel.</p>
    </div>
  </ResponsiveDialog>
)
