import { SkipLink, SkipLinks } from '@xnetjs/ui'

// SkipLinks renders several `.skip-link` anchors that are visually hidden
// (position:absolute; top:-40px) until keyboard focus slides each to top:0.
// The component exposes no per-link className, so the only faithful way to show
// the focused/visible appearance of each target is to pin individual SkipLink
// elements (the same anchors SkipLinks renders) with `relative top-0`. The real
// SkipLinks group is also mounted below in its true a11y-hidden state.
export const Default = () => (
  <div className="max-w-md space-y-3 rounded-lg border border-border bg-background p-4">
    <p className="text-sm font-medium text-foreground">Focused appearance (per target)</p>
    <div className="flex flex-col items-start gap-2">
      <SkipLink href="#main-content" className="relative top-0">
        Skip to main content
      </SkipLink>
      <SkipLink href="#navigation" className="relative top-0">
        Skip to navigation
      </SkipLink>
      <SkipLink href="#search" className="relative top-0">
        Skip to search
      </SkipLink>
    </div>

    {/* The real SkipLinks group, mounted in its true a11y-hidden state.
        Clipped so its top:-40px anchors stay out of the static frame. */}
    <div className="relative h-0 overflow-hidden">
      <SkipLinks
        links={[
          { href: '#main-content', label: 'Skip to main content' },
          { href: '#navigation', label: 'Skip to navigation' },
          { href: '#search', label: 'Skip to search' }
        ]}
      />
    </div>
    <p className="text-sm text-foreground-muted">
      Multiple skip targets for a complex page, surfaced one after another on Tab.
    </p>
  </div>
)
