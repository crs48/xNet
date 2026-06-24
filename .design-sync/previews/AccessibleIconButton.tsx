import { AccessibleIconButton } from '@xnetjs/ui'
import { Bell, MoreHorizontal, Pencil, Settings, Star, Trash2 } from 'lucide-react'

// A11y-enhanced IconButton: icon-only control that REQUIRES a `label` for
// screen readers. Same variants/sizes as the primitive.

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <AccessibleIconButton
      variant="default"
      icon={<Settings className="h-4 w-4" />}
      label="Open settings"
    />
    <AccessibleIconButton
      variant="ghost"
      icon={<Star className="h-4 w-4" />}
      label="Add to favorites"
    />
    <AccessibleIconButton
      variant="outline"
      icon={<Pencil className="h-4 w-4" />}
      label="Edit document"
    />
    <AccessibleIconButton
      variant="destructive"
      icon={<Trash2 className="h-4 w-4" />}
      label="Delete document"
    />
  </div>
)

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <AccessibleIconButton
      size="sm"
      icon={<Pencil className="h-3.5 w-3.5" />}
      label="Edit"
    />
    <AccessibleIconButton
      size="default"
      icon={<Pencil className="h-4 w-4" />}
      label="Edit"
    />
    <AccessibleIconButton size="lg" icon={<Pencil className="h-5 w-5" />} label="Edit" />
  </div>
)

export const InToolbar = () => (
  <div className="flex items-center gap-1 rounded-lg border border-border bg-background-subtle p-1">
    <AccessibleIconButton variant="ghost" icon={<Bell className="h-4 w-4" />} label="Notifications" />
    <AccessibleIconButton variant="ghost" icon={<Star className="h-4 w-4" />} label="Star" />
    <AccessibleIconButton variant="ghost" icon={<Settings className="h-4 w-4" />} label="Settings" />
    <AccessibleIconButton
      variant="ghost"
      icon={<MoreHorizontal className="h-4 w-4" />}
      label="More actions"
    />
  </div>
)
