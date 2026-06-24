import { ThemeProvider, ThemeToggle } from '@xnetjs/ui'

export const Default = () => (
  <ThemeProvider defaultTheme="light">
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 text-sm text-foreground-muted">
      <ThemeToggle />
      <span>Toggle light / dark theme</span>
    </div>
  </ThemeProvider>
)
