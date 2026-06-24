import { AccessibleInput } from '@xnetjs/ui'
import { AtSign, Search } from 'lucide-react'

// A11y-enhanced text input: a REQUIRED `label` is wired to the field, with
// optional `hint`, `error`, `required`, and left/right elements.

export const Default = () => (
  <div className="max-w-xl space-y-4">
    <AccessibleInput
      label="Workspace name"
      hint="This appears in previews, stories, and generated docs."
      defaultValue="OpenCode"
    />
    <AccessibleInput label="Search workspaces" placeholder="Search documents and channels..." />
  </div>
)

export const WithElements = () => (
  <div className="max-w-xl space-y-4">
    <AccessibleInput
      label="Email address"
      defaultValue="chris@xnet.app"
      leftElement={<AtSign className="h-4 w-4" />}
    />
    <AccessibleInput
      label="Find a command"
      placeholder="Search commands..."
      leftElement={<Search className="h-4 w-4" />}
    />
  </div>
)

export const Required = () => (
  <div className="max-w-xl space-y-4">
    <AccessibleInput
      label="Display name"
      required
      hint="Shown to collaborators in your workspace."
      defaultValue="Chris S."
    />
  </div>
)

export const Error = () => (
  <div className="max-w-xl space-y-4">
    <AccessibleInput
      label="Email address"
      required
      defaultValue="not-an-email"
      leftElement={<AtSign className="h-4 w-4" />}
      error="Please provide a valid email address."
    />
  </div>
)
