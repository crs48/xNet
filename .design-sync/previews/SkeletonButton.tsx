import { SkeletonButton } from '@xnetjs/ui'

// Button-shaped placeholder. `size` = 'sm' | 'default' | 'lg' drives fixed dimensions.
export const Sizes = () => (
  <div className="flex items-center gap-3">
    <SkeletonButton size="sm" />
    <SkeletonButton size="default" />
    <SkeletonButton size="lg" />
  </div>
)

// Realistic toolbar / form-footer loading state.
export const ActionRow = () => (
  <div className="flex max-w-md items-center justify-end gap-3 rounded-lg border border-border bg-background p-3">
    <SkeletonButton size="default" />
    <SkeletonButton size="default" />
  </div>
)
