import { Skeleton } from '@xnetjs/ui'

// Base shimmer placeholder. Width/height accept px-number or string; rounded variants.
export const Variants = () => (
  <div className="max-w-md space-y-4">
    <div className="space-y-2">
      <Skeleton width="100%" height={20} rounded="md" />
      <Skeleton width="80%" height={20} rounded="md" />
      <Skeleton width="55%" height={20} rounded="md" />
    </div>
    <div className="flex items-center gap-3">
      <Skeleton width={48} height={48} circle />
      <Skeleton width={120} height={28} rounded="full" />
      <Skeleton width={64} height={64} rounded="lg" />
    </div>
  </div>
)

// A realistic media-block loading state: image + title + meta lines.
export const MediaBlock = () => (
  <div className="max-w-md space-y-3 rounded-lg border border-border bg-background p-3">
    <Skeleton width="100%" height={140} rounded="lg" />
    <Skeleton width="70%" height={18} />
    <Skeleton width="45%" height={14} />
  </div>
)
