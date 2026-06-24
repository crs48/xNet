import { IconButton } from '@xnetjs/ui'
import { Bell, MoreHorizontal, Pencil, Settings, Star, Trash2 } from 'lucide-react'

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <IconButton variant="default" icon={<Settings className="h-4 w-4" />} label="Open settings" />
    <IconButton variant="ghost" icon={<Star className="h-4 w-4" />} label="Add to favorites" />
    <IconButton
      variant="destructive"
      icon={<Trash2 className="h-4 w-4" />}
      label="Delete document"
    />
  </div>
)

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <IconButton variant="default" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} label="Edit" />
    <IconButton variant="default" size="default" icon={<Pencil className="h-4 w-4" />} label="Edit" />
    <IconButton variant="default" size="lg" icon={<Pencil className="h-5 w-5" />} label="Edit" />
  </div>
)

export const InToolbar = () => (
  <div className="flex items-center gap-1 rounded-lg border border-border bg-background-subtle p-1">
    <IconButton variant="ghost" icon={<Bell className="h-4 w-4" />} label="Notifications" />
    <IconButton variant="ghost" icon={<Star className="h-4 w-4" />} label="Star" />
    <IconButton variant="ghost" icon={<Settings className="h-4 w-4" />} label="Settings" />
    <IconButton variant="ghost" icon={<MoreHorizontal className="h-4 w-4" />} label="More" />
  </div>
)
