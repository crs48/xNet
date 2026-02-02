/**
 * @xnet/ui - Shared UI primitives and components
 *
 * shadcn-style component system with HSL design tokens,
 * class-variance-authority variants, and dark/light mode support.
 */

// ─── Utils ────────────────────────────────────────────────────────
export { cn, cva, type VariantProps } from './utils'

// ─── Primitives (existing, migrated to semantic tokens) ───────────
export { Button, buttonVariants, type ButtonProps } from './primitives/Button'
export { Input, type InputProps } from './primitives/Input'
export { Select, type SelectProps, type SelectOption } from './primitives/Select'
export { Checkbox, type CheckboxProps } from './primitives/Checkbox'
export { Badge, badgeVariants, type BadgeProps } from './primitives/Badge'
export { IconButton, type IconButtonProps } from './primitives/IconButton'
export { Popover, type PopoverProps } from './primitives/Popover'
export { Modal, type ModalProps } from './primitives/Modal'
export { Menu, MenuItem, type MenuProps, type MenuItemProps } from './primitives/Menu'
export { Tooltip, type TooltipProps } from './primitives/Tooltip'

// ─── Primitives (new) ─────────────────────────────────────────────
export { Tabs, TabsList, TabsTrigger, TabsContent } from './primitives/Tabs'
export { ScrollArea, ScrollBar } from './primitives/ScrollArea'
export { Separator } from './primitives/Separator'
export { Switch } from './primitives/Switch'
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription
} from './primitives/Sheet'
export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent
} from './primitives/Accordion'
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from './primitives/Collapsible'
export { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './primitives/ResizablePanel'
export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut
} from './primitives/Command'

// ─── Presence Components ──────────────────────────────────────────
export { DIDAvatar, getColorForDID } from './components/DIDAvatar'

// ─── Composed Components ──────────────────────────────────────────
export { DatePicker, type DatePickerProps } from './components/DatePicker'
export { ColorPicker, type ColorPickerProps } from './components/ColorPicker'
export { TagInput, type TagInputProps } from './components/TagInput'
export { SearchInput, type SearchInputProps } from './components/SearchInput'
export { EmptyState, type EmptyStateProps } from './components/EmptyState'
export { Skeleton, type SkeletonProps } from './components/Skeleton'
export { MarkdownContent, type MarkdownContentProps } from './components/MarkdownContent'

// ─── DevTools Components ──────────────────────────────────────────
export { ThemeToggle } from './composed/ThemeToggle'
export { TreeView, type TreeViewProps, type TreeNode } from './composed/TreeView'
export { StatusDot, statusDotVariants, type StatusDotProps } from './composed/StatusDot'
export { LogEntry, type LogEntryProps } from './composed/LogEntry'
export { KeyValue, type KeyValueProps } from './composed/KeyValue'
export { CodeBlock, type CodeBlockProps } from './composed/CodeBlock'
export { DataTable, type DataTableProps, type Column } from './composed/DataTable'

// ─── Command Palette ──────────────────────────────────────────────
export {
  CommandPalette,
  useCommandPalette,
  type PaletteCommand,
  type CommandPaletteProps
} from './composed/CommandPalette'

// ─── Settings View ────────────────────────────────────────────────
export {
  SettingsView,
  SettingsSection,
  SettingsRow,
  type SettingsViewProps,
  type SettingsSection as SettingsSectionType,
  type SettingsPanelProps,
  type PluginSettingsPanel
} from './composed/SettingsView'

// ─── Comment Components ───────────────────────────────────────────
export {
  CommentBubble,
  CommentPopover,
  useCommentPopover,
  OrphanedThreadList,
  ThreadPicker,
  type CommentBubbleProps,
  type CommentPopoverProps,
  type CommentData,
  type CommentThreadData,
  type PopoverState,
  type UseCommentPopoverResult,
  type OrphanedThreadListProps,
  type OrphanedThread,
  type OrphanedCommentData,
  type OrphanReason,
  type ThreadPickerProps,
  type ThreadPreview
} from './composed/comments'

// ─── Theme ────────────────────────────────────────────────────────
export { ThemeProvider, useTheme, type Theme } from './theme/ThemeProvider'

// ─── Hooks ────────────────────────────────────────────────────────
export { useClickOutside } from './hooks/useClickOutside'
export { useDebounce } from './hooks/useDebounce'
export { useKeyboardShortcut } from './hooks/useKeyboardShortcut'
