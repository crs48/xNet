import { Badge, Button, ThemeProvider } from '@xnetjs/ui'

// ThemeProvider supplies the theme context (light / dark / system + variant)
// and applies `light`/`dark` classes to the document. A meaningful card renders
// it wrapping a `bg-background` swatch of themed DS content — buttons, badges,
// and token color chips — so the applied theme reads at a glance. Two cells show
// the same swatch under the light and dark themes.

const Swatch = () => (
  <div className="space-y-4 rounded-lg border border-border bg-background p-4 text-foreground">
    <div>
      <p className="text-sm font-medium">Themed surface</p>
      <p className="text-sm text-foreground-muted">
        Buttons, badges, and tokens inherit the active theme.
      </p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Primary</Button>
      <Button size="sm" variant="secondary">
        Secondary
      </Button>
      <Button size="sm" variant="outline">
        Outline
      </Button>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Badge>Live</Badge>
      <Badge variant="success">Synced</Badge>
      <Badge variant="warning">Review</Badge>
      <Badge variant="outline">Local</Badge>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <span className="h-8 w-8 rounded-md bg-primary" />
      <span className="h-8 w-8 rounded-md bg-secondary" />
      <span className="h-8 w-8 rounded-md bg-success" />
      <span className="h-8 w-8 rounded-md border border-border bg-background-subtle" />
    </div>
  </div>
)

export const Light = () => (
  <ThemeProvider defaultTheme="light">
    <div className="max-w-xl bg-background p-3">
      <Swatch />
    </div>
  </ThemeProvider>
)

export const Dark = () => (
  <ThemeProvider defaultTheme="dark">
    <div className="dark max-w-xl bg-background p-3">
      <Swatch />
    </div>
  </ThemeProvider>
)
