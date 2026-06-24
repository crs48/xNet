import { SkeletonCard } from '@xnetjs/ui'

// Full card placeholder: bordered container with avatar + heading + 3 text lines.
export const Default = () => (
  <div className="max-w-md">
    <SkeletonCard />
  </div>
)

// A loading grid/feed: several card placeholders stacked.
export const Feed = () => (
  <div className="max-w-md space-y-3">
    <SkeletonCard />
    <SkeletonCard />
  </div>
)
