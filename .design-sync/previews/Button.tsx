import { Button } from '@xnetjs/ui'
import { Download, Plus, Trash2 } from 'lucide-react'

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Save changes</Button>
    <Button variant="secondary">Secondary</Button>
    <Button variant="outline">Outline</Button>
    <Button variant="ghost">Ghost</Button>
    <Button variant="destructive">Delete</Button>
    <Button variant="link">Link action</Button>
  </div>
)

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
    <Button size="icon" aria-label="Add">
      <Plus className="h-4 w-4" />
    </Button>
  </div>
)

export const WithIcons = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button leftIcon={<Plus className="h-4 w-4" />}>New page</Button>
    <Button variant="outline" rightIcon={<Download className="h-4 w-4" />}>
      Export
    </Button>
    <Button variant="destructive" leftIcon={<Trash2 className="h-4 w-4" />}>
      Remove
    </Button>
  </div>
)

export const States = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button loading>Publishing</Button>
    <Button variant="secondary" loading>
      Saving
    </Button>
    <Button disabled>Disabled</Button>
  </div>
)
