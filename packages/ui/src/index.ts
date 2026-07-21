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
export { ISLAND_SURFACE, ISLAND_CHROME, ISLAND_OVERLAY } from './primitives/island'
export { POPUP_LAYER } from './primitives/layers'
export {
  CodeEditor,
  codeMirrorLanguage,
  type CodeEditorProps,
  type CodeEditorLanguage
} from './primitives/CodeEditor'
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
  ContextMenu,
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuPortal,
  ContextMenuPositioner,
  ContextMenuGroup,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  type ContextMenuProps,
  type ContextMenuItemProps
} from './primitives/ContextMenu'
export {
  ActionMenuList,
  ActionDropdownItems,
  ActionKebabMenu,
  visibleActions,
  ACTION_SEPARATOR,
  type Action
} from './composed/ActionMenu'
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
export { LinkifiedText, type LinkifiedTextProps } from './components/LinkifiedText'
export {
  SensitiveContent,
  labelText,
  type SensitiveContentProps,
  type SensitiveVisibility
} from './components/SensitiveContent'

// ─── DevTools Components ──────────────────────────────────────────
export { ThemeToggle } from './composed/ThemeToggle'
export { TreeView, type TreeViewProps, type TreeNode } from './composed/TreeView'
export { StatusDot, statusDotVariants, type StatusDotProps } from './composed/StatusDot'
export { LogEntry, type LogEntryProps } from './composed/LogEntry'
export { KeyValue, type KeyValueProps } from './composed/KeyValue'
export { CodeBlock, type CodeBlockProps } from './composed/CodeBlock'
export { DataTable, type DataTableProps, type Column } from './composed/DataTable'

// ─── Task Components ──────────────────────────────────────────────
export {
  TaskChip,
  TaskRow,
  TaskCard,
  TaskStatusIcon,
  TaskPriorityIcon,
  TaskStatusMenu,
  TaskDetailForm,
  MentionTextInput,
  findActiveMention,
  findActiveHashtag,
  filterTaskPeople,
  taskPersonLabel,
  TASK_STATUS_META,
  DUE_DATE_URGENCY_CLASS,
  getTaskStatusMeta,
  isCompletedStatus,
  formatDueDate,
  dueDateMsToIso,
  isoToDueDateMs,
  utcDayFromNow,
  dueDateInputValue,
  parseDueDate,
  detectTrailingDueDate,
  type DueDateParse,
  type TrailingDueDate,
  type TaskDetailFormProps,
  type TaskTagOption,
  type MentionTextInputProps,
  type MentionTagOption,
  type TaskPersonOption,
  type TaskChipProps,
  type TaskRowProps,
  type TaskRowDensity,
  type TaskCardProps,
  type TaskCardMode,
  type TaskStatusIconProps,
  type TaskPriorityIconProps,
  type TaskStatusMenuProps,
  type TaskDisplayData,
  type TaskDisplayStatus,
  type TaskDisplayPriority,
  type TaskIntentHandlers,
  type TaskStatusMeta,
  type DueDateUrgency,
  type DueDateInfo
} from './composed/tasks'

// ─── Command Palette ──────────────────────────────────────────────
export {
  CommandPalette,
  useCommandPalette,
  type PaletteCommand,
  type CommandPaletteProps
} from './composed/CommandPalette'

// ─── Settings View (deprecated — prefer the settings kit below) ───
export {
  SettingsView,
  SettingsSection,
  SettingsRow,
  type SettingsViewProps,
  type SettingsSection as SettingsSectionType,
  type SettingsPanelProps,
  type PluginSettingsPanel
} from './composed/SettingsView'

// ─── Settings kit (0179 — workbench-idiom controls) ───────────────
export { SettingsPanel, SettingsGroup, SettingRow, SettingToggle } from './composed/settings-kit'

// ─── Comment Components ───────────────────────────────────────────
export {
  CommentBubble,
  CommentIsland,
  CommentPopover,
  MentionTextArea,
  useCommentPopover,
  OrphanedThreadList,
  ThreadPicker,
  type CommentBubbleProps,
  type CommentIslandProps,
  type CommentIslandMode,
  type CommentPopoverProps,
  type MentionTextAreaProps,
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
export {
  ThemeProvider,
  useTheme,
  type Theme,
  type ThemeVariant,
  type Density
} from './theme/ThemeProvider'

// ─── Motion (exploration 0199) ─────────────────────────────────────
// The canonical motion vocabulary's React surface. CSS tokens/keyframes
// live in ./theme/motion.css; see docs/MOTION.md for the style guide.
export { Presence, type PresenceProps, type PresenceMotion } from './motion/Presence'
export {
  useAnchoredPosition,
  placeAnchored,
  pointAnchor,
  toAnchorLike,
  type AnchorLike,
  type AnchorSide,
  type AnchoredPosition,
  type VirtualAnchor
} from './motion/useAnchoredPosition'
export {
  useViewTransition,
  startViewTransition,
  supportsViewTransitions
} from './motion/useViewTransition'

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
export {
  useListboxNavigation,
  type ListboxKeyEvent,
  type ListboxNavigation,
  type ListboxNavigationOptions
} from './hooks/useListboxNavigation'

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

// ─── Link enrichment (0171) + up-res (0295) ───────────────────────
export {
  findLinkTokens,
  mergeLinkTokens,
  segmentText,
  safeHref,
  type LinkToken,
  type LinkTokenType,
  type TextSegment
} from './utils/linkify'
export {
  LinkUpresProvider,
  useLinkUpres,
  type LinkUpresRenderer,
  type UpresLink
} from './components/LinkUpres'
export { LinkPreviewCard, type LinkPreviewCardProps } from './components/LinkPreviewCard'

// ─── Drag & Drop (0166 unified node transfer) ─────────────────────
export {
  XNET_NODE_MIME,
  setNodeTransfer,
  getNodeTransfer,
  hasNodeTransfer,
  type NodeTransfer,
  type NodeTransferSource
} from './dnd/node-transfer'
