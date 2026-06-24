import { SearchInput } from '@xnetjs/ui'

// SearchInput renders the clear button only when it is controlled with a non-empty `value`.
// A no-op onChange keeps the preview static while showing the filled + clearable state.
const noop = () => undefined

export const Default = () => (
  <div className="max-w-md space-y-4">
    <SearchInput placeholder="Search documents, people, and channels..." />
  </div>
)

export const WithValue = () => (
  <div className="max-w-md space-y-4">
    <SearchInput value="quarterly roadmap" onChange={noop} onClear={noop} />
  </div>
)

export const Loading = () => (
  <div className="max-w-md space-y-4">
    <SearchInput value="indexing workspace" onChange={noop} loading />
  </div>
)

export const InContext = () => (
  <div className="max-w-md space-y-4 rounded-lg border border-border bg-background-subtle p-3">
    <p className="text-sm font-medium text-foreground">Workspace search</p>
    <SearchInput placeholder="Filter by title or owner..." />
    <p className="text-sm text-foreground-muted">
      Search runs locally first, then merges results from the hub.
    </p>
  </div>
)
