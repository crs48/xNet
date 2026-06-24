import { Input } from '@xnetjs/ui'
import { AtSign, FileText, Search, Sparkles } from 'lucide-react'

export const Default = () => (
  <div className="space-y-4">
    <Input defaultValue="Quarterly roadmap" />
    <Input placeholder="Search workspaces and documents..." />
  </div>
)

export const WithIcons = () => (
  <div className="space-y-4">
    <Input placeholder="Search commands..." leftElement={<Search className="h-4 w-4" />} />
    <Input
      defaultValue="Quarterly roadmap"
      leftElement={<FileText className="h-4 w-4" />}
      rightElement={<Sparkles className="h-4 w-4 text-primary" />}
    />
    <Input
      defaultValue="chris@xnet.app"
      leftElement={<AtSign className="h-4 w-4" />}
    />
  </div>
)

export const Error = () => (
  <div className="space-y-4">
    <Input
      defaultValue="not-an-email"
      leftElement={<AtSign className="h-4 w-4" />}
      error="Please provide a valid email address."
    />
    <Input placeholder="Workspace name" error="This field is required." />
  </div>
)

export const Disabled = () => (
  <div className="space-y-4">
    <Input defaultValue="Read-only workspace" disabled />
    <Input placeholder="Disabled input" disabled />
  </div>
)
