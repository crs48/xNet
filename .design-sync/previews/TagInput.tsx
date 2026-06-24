import { TagInput } from '@xnetjs/ui'

// TagInput is controlled; a no-op onChange keeps the preview static while rendering real tags.
const noop = () => undefined

export const Default = () => (
  <div className="max-w-md space-y-4">
    <TagInput value={['design-system', 'storybook', 'electron']} onChange={noop} />
  </div>
)

export const Empty = () => (
  <div className="max-w-md space-y-4">
    <TagInput value={[]} onChange={noop} placeholder="Add a label..." />
  </div>
)

export const WithLabel = () => (
  <div className="max-w-md space-y-4">
    <label className="block text-sm font-medium text-foreground">Topics</label>
    <TagInput
      value={['roadmap', 'q3-planning', 'priority', 'sync']}
      onChange={noop}
      placeholder="Add topic..."
    />
    <p className="text-sm text-foreground-muted">
      Press Enter or comma to add. Backspace removes the last tag.
    </p>
  </div>
)
