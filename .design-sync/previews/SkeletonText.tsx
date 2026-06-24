import { SkeletonText } from '@xnetjs/ui'

// Multi-line text placeholder. `lines` controls count; last line is auto-shortened to 60%.
export const LineCounts = () => (
  <div className="max-w-md space-y-5">
    <SkeletonText lines={2} />
    <SkeletonText lines={3} />
    <SkeletonText lines={5} />
  </div>
)

// A paragraph + heading loading block in a realistic article context.
export const ArticleBody = () => (
  <div className="max-w-md space-y-4 rounded-lg border border-border bg-background p-4">
    <SkeletonText lines={1} className="space-y-2" />
    <SkeletonText lines={4} />
  </div>
)
