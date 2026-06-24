import { AccessibleButton } from '@xnetjs/ui'
import { Download, Plus, Trash2 } from 'lucide-react'

// A11y-enhanced Button: same variants/sizes as the primitive, plus screen-reader
// announcements for loading/success/error states (loadingText/successText/errorText).

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <AccessibleButton>Save changes</AccessibleButton>
    <AccessibleButton variant="secondary">Secondary</AccessibleButton>
    <AccessibleButton variant="outline">Outline</AccessibleButton>
    <AccessibleButton variant="ghost">Ghost</AccessibleButton>
    <AccessibleButton variant="destructive">Delete</AccessibleButton>
    <AccessibleButton variant="link">Link action</AccessibleButton>
  </div>
)

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <AccessibleButton size="sm">Small</AccessibleButton>
    <AccessibleButton size="default">Default</AccessibleButton>
    <AccessibleButton size="lg">Large</AccessibleButton>
  </div>
)

export const WithIcons = () => (
  <div className="flex flex-wrap items-center gap-3">
    <AccessibleButton leftIcon={<Plus className="h-4 w-4" />}>New page</AccessibleButton>
    <AccessibleButton variant="outline" rightIcon={<Download className="h-4 w-4" />}>
      Export
    </AccessibleButton>
    <AccessibleButton variant="destructive" leftIcon={<Trash2 className="h-4 w-4" />}>
      Remove
    </AccessibleButton>
  </div>
)

export const States = () => (
  <div className="flex flex-wrap items-center gap-3">
    <AccessibleButton loading loadingText="Publishing changes">
      Publishing
    </AccessibleButton>
    <AccessibleButton variant="secondary" loading loadingText="Saving draft">
      Saving
    </AccessibleButton>
    <AccessibleButton disabled>Disabled</AccessibleButton>
  </div>
)
