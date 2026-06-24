import { SkeletonAvatar, SkeletonText } from '@xnetjs/ui'

// Circular avatar placeholder. `size` (px) drives both width and height.
export const Sizes = () => (
  <div className="flex items-center gap-4">
    <SkeletonAvatar size={24} />
    <SkeletonAvatar size={36} />
    <SkeletonAvatar size={48} />
    <SkeletonAvatar size={64} />
  </div>
)

// List-row loading placeholder: avatar + two text lines, repeated.
export const ListRows = () => (
  <div className="max-w-md space-y-3 rounded-lg border border-border bg-background p-3">
    {[0, 1, 2].map((i) => (
      <div key={i} className="flex items-center gap-3">
        <SkeletonAvatar size={40} />
        <div className="flex-1">
          <SkeletonText lines={2} />
        </div>
      </div>
    ))}
  </div>
)
