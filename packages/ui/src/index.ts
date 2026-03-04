/**
 * @xnetjs/ui - Shared UI primitives and components
 *
 * shadcn-style component system with HSL design tokens,
 * class-variance-authority variants, and dark/light mode support.
 */

// ─── Utils ────────────────────────────────────────────────────────
export { cn, cva, type VariantProps } from './utils'

// ─── Primitives (existing, migrated to semantic tokens) ───────────
export { Button, buttonVariants, type ButtonProps } from './primitives/Button'
export { Input, type InputProps } from './primitives/Input'
export {
  Select,
  SelectRoot,
  SelectGroup,
  SelectValue,
  SelectIcon,
  SelectPortal,
  SelectPositioner,
  SelectList,
  SelectTrigger,
  SelectContent,
  SelectScrollUpButton,
  SelectScrollDownButton,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  type SelectProps,
  type SelectOption
} from './primitives/Select'
export { Checkbox, type CheckboxProps } from './primitives/Checkbox'
export { Badge, badgeVariants, type BadgeProps } from './primitives/Badge'
export { IconButton, type IconButtonProps } from './primitives/IconButton'
export {
  Popover,
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverPositioner,
  PopoverAnchor,
  PopoverClose,
  PopoverTitle,
  PopoverDescription,
  PopoverPopup,
  PopoverArrow,
  PopoverContent,
  type PopoverProps
} from './primitives/Popover'
export {
  Modal,
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogContent,
  ModalComponent,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
  ModalTrigger,
  ModalClose,
  type ModalProps
} from './primitives/Modal'
export {
  Menu,
  MenuItem,
  MenuSeparator,
  MenuLabel,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  type MenuProps,
  type MenuItemProps
} from './primitives/Menu'
export {
  Tooltip,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipPositioner,
  TooltipPopup,
  TooltipArrow,
  TooltipContent,
  type TooltipProps
} from './primitives/Tooltip'

// ─── Primitives (new) ─────────────────────────────────────────────
export { Tabs, TabsList, TabsTrigger, TabsContent } from './primitives/Tabs'
export {
  ScrollArea,
  ScrollBar,
  ScrollAreaRoot,
  ScrollAreaViewport,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaCorner
} from './primitives/ScrollArea'
export { Separator } from './primitives/Separator'
export { Switch } from './primitives/Switch'
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  type SheetContentProps
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
export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonButton,
  type SkeletonProps,
  type SkeletonTextProps,
  type SkeletonAvatarProps,
  type SkeletonCardProps,
  type SkeletonButtonProps
} from './components/Skeleton'
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
  type ThreadPreview,
  CommentsSidebar,
  type CommentsSidebarProps
} from './composed/comments'

// ─── Theme ────────────────────────────────────────────────────────
export { ThemeProvider, useTheme, type Theme } from './theme/ThemeProvider'

// ─── Responsive Components ─────────────────────────────────────────
export {
  ResponsiveSidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarNav,
  SidebarNavItem,
  SidebarSection,
  type ResponsiveSidebarProps,
  type SidebarHeaderProps,
  type SidebarContentProps,
  type SidebarFooterProps,
  type SidebarNavProps,
  type SidebarNavItemProps,
  type SidebarSectionProps
} from './components/ResponsiveSidebar'
export {
  BottomNav,
  BottomNavSpacer,
  type BottomNavProps,
  type BottomNavItem,
  type BottomNavSpacerProps
} from './components/BottomNav'
export {
  ResponsiveTable,
  type ResponsiveTableProps,
  type ResponsiveTableColumn
} from './components/ResponsiveTable'
export {
  ResponsiveDialog,
  ResponsiveDialogRoot,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  type ResponsiveDialogProps,
  type ResponsiveDialogRootProps,
  type ResponsiveDialogContentProps
} from './components/ResponsiveDialog'

// ─── Accessibility Components ──────────────────────────────────────
export { SkipLink, SkipLinks, type SkipLinkProps, type SkipLinksProps } from './components/SkipLink'
export {
  AccessibleButton,
  AccessibleIconButton,
  type AccessibleButtonProps,
  type AccessibleIconButtonProps
} from './components/AccessibleButton'
export {
  AccessibleInput,
  AccessibleTextarea,
  type AccessibleInputProps,
  type AccessibleTextareaProps
} from './components/AccessibleInput'

// ─── Hooks ────────────────────────────────────────────────────────
export { useClickOutside } from './hooks/useClickOutside'
export { useDebounce } from './hooks/useDebounce'
export { useKeyboardShortcut } from './hooks/useKeyboardShortcut'
export {
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  usePrefersReducedMotion,
  usePrefersDarkMode
} from './hooks/useMediaQuery'
export {
  useFocusTrap,
  getFocusableElements,
  getFirstFocusable,
  getLastFocusable,
  isFocusable,
  type UseFocusTrapOptions
} from './hooks/useFocusTrap'
export {
  useAnnounce,
  announce,
  clearAnnouncements,
  cleanupAnnouncers,
  type AnnouncePoliteness,
  type UseAnnounceOptions,
  type AnnounceFunction
} from './hooks/useAnnounce'

// ─── Accessibility Utils ───────────────────────────────────────────
export {
  getLuminance,
  getLuminanceFromRGB,
  getContrastRatio,
  analyzeContrast,
  meetsContrastRequirement,
  getMinimumContrastRatio,
  hexToRGB,
  rgbToHex,
  hslToRGB,
  parseColor,
  suggestAccessibleColor,
  type RGB,
  type HSL,
  type ContrastLevel,
  type ContrastResult
} from './utils/contrast'
