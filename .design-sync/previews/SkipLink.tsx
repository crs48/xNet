import { SkipLink } from '@xnetjs/ui'

// SkipLink is visually hidden (position:absolute; top:-40px) until keyboard focus,
// when `.skip-link:focus` slides it to top:0. This cell forces the FOCUSED/visible
// appearance with `relative top-0` utilities (same real element + .skip-link
// styling, just pinned in view) so the card shows what a keyboard user sees on Tab.
export const Focused = () => (
  <div className="relative max-w-md rounded-lg border border-border bg-background p-4">
    <SkipLink className="relative top-0" />
    <p className="mt-3 text-sm text-foreground-muted">
      Press Tab on a page and this link appears first, jumping focus to{' '}
      <code>#main-content</code>.
    </p>
  </div>
)

// Custom target + label, also forced visible.
export const CustomTarget = () => (
  <div className="relative max-w-md rounded-lg border border-border bg-background p-4">
    <SkipLink href="#article-content" className="relative top-0">
      Skip to article
    </SkipLink>
  </div>
)
