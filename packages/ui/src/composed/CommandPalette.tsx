/**
 * Command Palette
 *
 * A keyboard-driven command palette for searching and executing commands.
 * Opens with Cmd/Ctrl+Shift+P or via the CommandPaletteTrigger component.
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as icons from 'lucide-react'
import { cn } from '../utils'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut
} from '../primitives/Command'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Command definition for the palette
 */
export interface PaletteCommand {
  /** Unique command ID */
  id: string
  /** Display name */
  name: string
  /** Description shown below name */
  description?: string
  /** Icon name (Lucide) or custom ReactNode */
  icon?: string | ReactNode
  /** Keyboard shortcut display (e.g., "⌘K") */
  shortcut?: string
  /** Search keywords for fuzzy matching */
  keywords?: string[]
  /** Category/group for organization */
  group?: string
  /** Execute the command */
  execute: () => void | Promise<void>
  /** Whether command is currently enabled */
  when?: () => boolean
}

export interface CommandPaletteProps {
  /** Commands to display */
  commands: PaletteCommand[]
  /** Built-in commands (shown in separate group) */
  builtinCommands?: PaletteCommand[]
  /** Controlled open state */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Placeholder text for search input */
  placeholder?: string
  /** Empty state message */
  emptyMessage?: string
  /** Additional class name */
  className?: string
}

// ─── Icon Resolution ─────────────────────────────────────────────────────────

// Common icons for the command palette
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Search: icons.Search,
  Settings: icons.Settings,
  File: icons.File,
  FileText: icons.FileText,
  FilePlus: icons.FilePlus,
  Plus: icons.Plus,
  PlusCircle: icons.PlusCircle,
  Database: icons.Database,
  Command: icons.Command,
  Home: icons.Home,
  Inbox: icons.Inbox,
  Calendar: icons.Calendar,
  User: icons.User,
  Users: icons.Users,
  Mail: icons.Mail,
  MessageSquare: icons.MessageSquare,
  Bell: icons.Bell,
  Star: icons.Star,
  Heart: icons.Heart,
  Bookmark: icons.Bookmark,
  Tag: icons.Tag,
  Folder: icons.Folder,
  Archive: icons.Archive,
  Trash: icons.Trash,
  Trash2: icons.Trash2,
  Edit: icons.Edit,
  Edit2: icons.Edit2,
  Pencil: icons.Pencil,
  Copy: icons.Copy,
  Clipboard: icons.Clipboard,
  Download: icons.Download,
  Upload: icons.Upload,
  Share: icons.Share,
  Share2: icons.Share2,
  ExternalLink: icons.ExternalLink,
  Link: icons.Link,
  Unlink: icons.Unlink,
  Eye: icons.Eye,
  EyeOff: icons.EyeOff,
  Lock: icons.Lock,
  Unlock: icons.Unlock,
  Key: icons.Key,
  Shield: icons.Shield,
  Check: icons.Check,
  CheckCircle: icons.CheckCircle,
  X: icons.X,
  XCircle: icons.XCircle,
  AlertCircle: icons.AlertCircle,
  AlertTriangle: icons.AlertTriangle,
  Info: icons.Info,
  HelpCircle: icons.HelpCircle,
  Zap: icons.Zap,
  Activity: icons.Activity,
  BarChart: icons.BarChart,
  PieChart: icons.PieChart,
  TrendingUp: icons.TrendingUp,
  Layers: icons.Layers,
  Layout: icons.Layout,
  Grid: icons.Grid,
  List: icons.List,
  Table: icons.Table,
  Columns: icons.Columns,
  Rows: icons.Rows,
  Image: icons.Image,
  Video: icons.Video,
  Music: icons.Music,
  Code: icons.Code,
  Terminal: icons.Terminal,
  Puzzle: icons.Puzzle,
  Palette: icons.Palette,
  Globe: icons.Globe,
  Wifi: icons.Wifi,
  WifiOff: icons.WifiOff,
  Cloud: icons.Cloud,
  Sun: icons.Sun,
  Moon: icons.Moon,
  RefreshCw: icons.RefreshCw,
  RotateCw: icons.RotateCw,
  Play: icons.Play,
  Pause: icons.Pause,
  Square: icons.Square,
  Circle: icons.Circle,
  Triangle: icons.Triangle,
  ChevronDown: icons.ChevronDown,
  ChevronUp: icons.ChevronUp,
  ChevronLeft: icons.ChevronLeft,
  ChevronRight: icons.ChevronRight,
  ArrowDown: icons.ArrowDown,
  ArrowUp: icons.ArrowUp,
  ArrowLeft: icons.ArrowLeft,
  ArrowRight: icons.ArrowRight,
  MoreHorizontal: icons.MoreHorizontal,
  MoreVertical: icons.MoreVertical,
  Menu: icons.Menu,
  Filter: icons.Filter,
  SortAsc: icons.SortAsc,
  SortDesc: icons.SortDesc
}

/**
 * Resolve an icon name to a Lucide component
 */
function resolveIcon(icon: string | ReactNode | undefined): ReactNode {
  if (!icon) return null
  if (typeof icon !== 'string') return icon

  // Convert to PascalCase for Lucide icon lookup
  const iconName = icon
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

  const IconComponent = iconMap[iconName]
  if (IconComponent) {
    return <IconComponent className="h-4 w-4" />
  }

  return null
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Command Palette component
 *
 * @example
 * ```tsx
 * const commands = [
 *   { id: 'new-page', name: 'New Page', icon: 'file-plus', execute: () => createPage() },
 *   { id: 'search', name: 'Search', icon: 'search', shortcut: '⌘K', execute: () => openSearch() }
 * ]
 *
 * <CommandPalette
 *   commands={commands}
 *   open={open}
 *   onOpenChange={setOpen}
 * />
 * ```
 */
export function CommandPalette({
  commands,
  builtinCommands = [],
  open: controlledOpen,
  onOpenChange,
  placeholder = 'Type a command or search...',
  emptyMessage = 'No commands found.',
  className
}: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  // Global keyboard shortcut (Cmd+Shift+P or Ctrl+Shift+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setOpen(true)
      }

      // Also allow Escape to close
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, setOpen])

  // Filter commands by enabled state
  const filterEnabled = useCallback((cmd: PaletteCommand) => !cmd.when || cmd.when(), [])

  const enabledBuiltin = builtinCommands.filter(filterEnabled)
  const enabledPlugin = commands.filter(filterEnabled)

  // Group plugin commands by group
  const groupedCommands = enabledPlugin.reduce(
    (acc, cmd) => {
      const group = cmd.group ?? 'Commands'
      if (!acc[group]) acc[group] = []
      acc[group].push(cmd)
      return acc
    },
    {} as Record<string, PaletteCommand[]>
  )

  // Execute command and close palette
  const handleSelect = useCallback(
    (cmd: PaletteCommand) => {
      setOpen(false)
      // Execute async without blocking
      Promise.resolve(cmd.execute()).catch((err) => {
        console.error(`[CommandPalette] Command '${cmd.id}' failed:`, err)
      })
    },
    [setOpen]
  )

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/50',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%]',
            'border bg-popover shadow-lg rounded-lg overflow-hidden',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
            className
          )}
        >
          <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
          <Dialog.Description className="sr-only">Search and execute commands</Dialog.Description>

          <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
            <CommandInput placeholder={placeholder} />
            <CommandList className="max-h-[400px]">
              <CommandEmpty>{emptyMessage}</CommandEmpty>

              {/* Built-in commands */}
              {enabledBuiltin.length > 0 && (
                <CommandGroup heading="Actions">
                  {enabledBuiltin.map((cmd) => (
                    <CommandItem
                      key={cmd.id}
                      value={`${cmd.name} ${cmd.keywords?.join(' ') ?? ''}`}
                      onSelect={() => handleSelect(cmd)}
                    >
                      {resolveIcon(cmd.icon)}
                      <div className="flex flex-col flex-1">
                        <span>{cmd.name}</span>
                        {cmd.description && (
                          <span className="text-xs text-muted-foreground">{cmd.description}</span>
                        )}
                      </div>
                      {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {/* Plugin commands grouped */}
              {Object.entries(groupedCommands).map(([group, cmds]) => (
                <CommandGroup key={group} heading={group}>
                  {cmds.map((cmd) => (
                    <CommandItem
                      key={cmd.id}
                      value={`${cmd.name} ${cmd.keywords?.join(' ') ?? ''}`}
                      onSelect={() => handleSelect(cmd)}
                    >
                      {resolveIcon(cmd.icon)}
                      <div className="flex flex-col flex-1">
                        <span>{cmd.name}</span>
                        {cmd.description && (
                          <span className="text-xs text-muted-foreground">{cmd.description}</span>
                        )}
                      </div>
                      {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Hook to manage command palette state
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  const toggle = useCallback(() => setOpen((prev) => !prev), [])
  const show = useCallback(() => setOpen(true), [])
  const hide = useCallback(() => setOpen(false), [])

  return {
    open,
    setOpen,
    toggle,
    show,
    hide
  }
}
