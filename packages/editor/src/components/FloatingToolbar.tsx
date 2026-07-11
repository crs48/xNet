/**
 * FloatingToolbar - Obsidian-style floating toolbar for the editor
 *
 * Desktop: Bubble menu that floats near cursor/selection
 * Mobile: Fixed at bottom, above keyboard, horizontally scrollable
 */
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { TooltipProvider } from '@xnetjs/ui'
import {
  AtSign,
  Bold,
  BookOpen,
  Braces,
  CalendarDays,
  Check,
  Clapperboard,
  Code2,
  Database,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Indent,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListTodo,
  MessageSquare,
  Minus,
  Outdent,
  Strikethrough,
  TextQuote,
  Unlink,
  X
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type KeyboardEvent
} from 'react'
import { captureTextAnchor } from '../extensions/comment'
import {
  getShortcutById,
  isMac,
  OPEN_LINK_POPOVER_EVENT,
  type OpenLinkPopoverEventDetail
} from '../extensions/keyboard-shortcuts'
import { getCurrentTaskDueDate } from '../extensions/task-metadata'
import { cn } from '../utils'
import {
  deriveSelectionShape,
  resolveToolbarPolicy,
  shouldShowDesktopToolbar,
  type KeyboardThresholds,
  type ToolbarMode,
  type ToolbarSurface,
  useEditorUxState
} from './editor-ux-state'
import { Button, Toolbar, ToolbarSeparator } from './ui'

export type { ToolbarMode, ToolbarSurface } from './editor-ux-state'

/**
 * Toolbar item contribution from plugins
 */
export interface ToolbarItemContribution {
  /** Icon name (Lucide) or React component */
  icon: string | React.ComponentType
  /** Tooltip/title text */
  title: string
  /** Toolbar section: format, insert, block, or custom */
  group?: 'format' | 'insert' | 'block' | 'custom'
  /** Check if button should appear active */
  isActive?: (editor: Editor) => boolean
  /** Button click handler */
  action: (editor: Editor) => void
  /** Keyboard shortcut display (e.g., 'Mod-Shift-H') */
  shortcut?: string
}

export interface FloatingToolbarProps {
  /** The Tiptap editor instance */
  editor: Editor | null
  /** Additional CSS class */
  className?: string
  /**
   * Force a specific toolbar mode instead of auto-detecting
   * - 'auto': Detect based on device/viewport (default)
   * - 'desktop': Always show floating bubble menu (for Electron)
   * - 'mobile': Always show fixed bottom toolbar (for mobile apps)
   */
  mode?: ToolbarMode
  /**
   * Product surface hosting the toolbar. Canvas inline pages use a compact policy.
   */
  surface?: ToolbarSurface
  /**
   * Optional keyboard visibility thresholds used in mobile mode.
   */
  keyboardThresholds?: Partial<KeyboardThresholds>
  /**
   * Additional toolbar items from plugins
   */
  additionalItems?: ToolbarItemContribution[]
  /**
   * Comment creation handler. When provided, shows a Comment button.
   * Called with anchor data; should return the new comment ID.
   */
  onCreateComment?: (anchorData: string) => Promise<string | null>
}

interface ToolbarButtonProps {
  onClick: () => void
  active?: boolean
  title: string
  ariaLabel?: string
  shortcut?: string
  children: React.ReactNode
  mobileOnly?: boolean
  isMobile: boolean
}

function isInTaskItem(editor: Editor): boolean {
  return editor.isActive('taskItem')
}

function pickDate(initialValue: string | null): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'date'
    input.value = initialValue ?? ''
    input.style.position = 'fixed'
    input.style.opacity = '0'
    input.style.pointerEvents = 'none'
    input.style.left = '-9999px'
    input.style.top = '0'

    let settled = false

    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(value)
    }

    input.addEventListener(
      'change',
      () => {
        finish(input.value || null)
      },
      { once: true }
    )

    input.addEventListener(
      'blur',
      () => {
        requestAnimationFrame(() => finish(input.value || null))
      },
      { once: true }
    )

    document.body.appendChild(input)
    input.focus()

    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
      } catch {
        input.click()
      }
    } else {
      input.click()
    }
  })
}

/**
 * Domain adapter over the vendored MIT Button primitive (./ui): maps the
 * toolbar's mobileOnly/isMobile policy onto size/tooltip props (0297).
 */
function ToolbarButton({
  onClick,
  active,
  title,
  ariaLabel,
  shortcut,
  children,
  mobileOnly,
  isMobile
}: ToolbarButtonProps): JSX.Element | null {
  if (mobileOnly && !isMobile) return null

  return (
    <Button
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
      onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
      aria-label={ariaLabel ?? title}
      tooltip={ariaLabel ?? title}
      shortcutKeys={shortcut}
      active={active}
      size={isMobile ? 'lg' : 'md'}
      tooltipOffset={isMobile ? 10 : 8}
      title={title}
    >
      {children}
    </Button>
  )
}

function ToolbarDivider({ isMobile }: { isMobile: boolean }): JSX.Element {
  return <ToolbarSeparator size={isMobile ? 'lg' : 'md'} />
}

function getToolbarAriaLabel(surface: ToolbarSurface): string {
  return surface === 'canvas-inline'
    ? 'Canvas editor formatting toolbar'
    : 'Editor formatting toolbar'
}

function getShortcutDisplay(shortcutId: string): string | undefined {
  const shortcut = getShortcutById(shortcutId)
  if (!shortcut) return undefined

  return isMac ? shortcut.display.mac : shortcut.display.windows
}

function getTooltipTitle(title: string, shortcutId?: string): string {
  if (!shortcutId) return title

  const shortcut = getShortcutDisplay(shortcutId)
  return shortcut ? `${title} (${shortcut})` : title
}

function getCurrentLinkHref(editor: Editor): string {
  const href = editor.getAttributes('link').href
  return typeof href === 'string' ? href : ''
}

function normalizeReferenceText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function createPageReferenceTarget(value: string): { pageId: string; title: string } | null {
  const title = normalizeReferenceText(value)
  if (!title) return null

  return {
    pageId: title.includes('/') ? title : `default/${title.toLowerCase().replace(/\s+/g, '-')}`,
    title
  }
}

type ReferencePopoverMode = 'page' | 'database'

function getSelectedText(editor: Editor): string {
  const { selection, doc } = editor.state
  if (selection.empty) return ''

  return doc.textBetween(selection.from, selection.to, ' ').trim()
}

function insertPageReference(editor: Editor, value: string): boolean {
  const target = createPageReferenceTarget(value)
  if (!target) return false

  editor
    .chain()
    .focus()
    .insertContent({
      type: 'text',
      text: target.title,
      marks: [
        {
          type: 'wikilink',
          attrs: {
            href: target.pageId,
            title: target.title
          }
        }
      ]
    })
    .run()

  return true
}

function insertDatabaseReference(
  editor: Editor,
  databaseId: string,
  title: string | null | undefined
): boolean {
  const normalizedId = normalizeReferenceText(databaseId)
  if (!normalizedId) return false

  const normalizedTitle = normalizeReferenceText(title) ?? normalizedId

  return editor.commands.setDatabaseReference({
    databaseId: normalizedId,
    title: normalizedTitle
  })
}

type DatabaseToolbarViewType = 'table' | 'board' | 'list' | 'calendar' | 'gallery' | 'timeline'

const DATABASE_TOOLBAR_VIEW_TYPES: DatabaseToolbarViewType[] = [
  'table',
  'board',
  'list',
  'calendar',
  'gallery',
  'timeline'
]

const DATABASE_TOOLBAR_VIEW_LABELS: Record<DatabaseToolbarViewType, string> = {
  table: 'Table',
  board: 'Board',
  list: 'List',
  calendar: 'Calendar',
  gallery: 'Gallery',
  timeline: 'Timeline'
}

type DatabasePickerExtension = {
  options?: {
    onSelectDatabase?: () => Promise<string | null>
  }
}

function getDatabasePicker(editor: Editor): (() => Promise<string | null>) | null {
  const extension = editor.extensionManager?.extensions.find(
    (item) => item.name === 'databaseEmbed'
  ) as DatabasePickerExtension | undefined

  return extension?.options?.onSelectDatabase ?? null
}

function insertDatabaseEmbed(
  editor: Editor,
  databaseId: string,
  viewType: DatabaseToolbarViewType
): boolean {
  const normalizedId = databaseId.trim()
  if (!normalizedId) return false

  return editor.commands.setDatabaseEmbed({
    databaseId: normalizedId,
    viewType
  })
}

function insertMediaEmbed(editor: Editor, url: string): boolean {
  const normalizedUrl = url.trim()
  if (!normalizedUrl) return false

  return editor.commands.setEmbed(normalizedUrl)
}

function LinkToolbarPopover({
  editor,
  open,
  onOpenChange,
  isMobile
}: {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
  isMobile: boolean
}): JSX.Element | null {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!open) return

    setValue(getCurrentLinkHref(editor))
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [editor, open])

  const close = useCallback(() => {
    editor.commands.focus()
    onOpenChange(false)
  }, [editor, onOpenChange])

  const applyLink = useCallback(() => {
    const href = value.trim()

    if (!href) {
      editor.chain().focus().unsetLink().run()
      onOpenChange(false)
      return
    }

    editor.chain().focus().setLink({ href }).run()
    onOpenChange(false)
  }, [editor, onOpenChange, value])

  const removeLink = useCallback(() => {
    editor.chain().focus().unsetLink().run()
    onOpenChange(false)
  }, [editor, onOpenChange])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      event.stopPropagation()
      close()
    },
    [close]
  )

  if (!open) return null

  return (
    <form
      data-testid="editor-link-popover"
      role="dialog"
      aria-label="Edit link"
      className={cn(
        'absolute z-[60] w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-border/70',
        'bg-popover p-3 text-popover-foreground shadow-xl shadow-black/15',
        'dark:shadow-black/40',
        isMobile ? 'bottom-full right-3 mb-2' : 'right-0 top-full mt-2'
      )}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        applyLink()
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Link</span>
        <button
          type="button"
          aria-label="Close link popover"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          onClick={close}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <label htmlFor={inputId} className="sr-only">
        Link URL
      </label>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          id={inputId}
          value={value}
          placeholder="Paste or type URL"
          className={cn(
            'min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-2 text-sm',
            'outline-none transition-colors',
            'placeholder:text-muted-foreground',
            'focus:border-primary focus:ring-2 focus:ring-primary/20'
          )}
          onChange={(event) => setValue(event.target.value)}
        />
        <button
          type="submit"
          aria-label="Apply link"
          className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
          title="Apply link"
        >
          <Check size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Remove link"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          title="Remove link"
          onClick={removeLink}
        >
          <Unlink size={15} aria-hidden="true" />
        </button>
      </div>
    </form>
  )
}

function ReferenceToolbarPopover({
  editor,
  open,
  onOpenChange,
  isMobile
}: {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
  isMobile: boolean
}): JSX.Element | null {
  const pageInputId = useId()
  const databaseInputId = useId()
  const databaseTitleInputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<ReferencePopoverMode>('page')
  const [pageValue, setPageValue] = useState('')
  const [databaseId, setDatabaseId] = useState('')
  const [databaseTitle, setDatabaseTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  const picker = getDatabasePicker(editor)

  useEffect(() => {
    if (!open) return

    const selectedText = getSelectedText(editor)
    setMode('page')
    setPageValue(selectedText)
    setDatabaseId('')
    setDatabaseTitle(selectedText)
    setError(null)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [editor, open])

  const close = useCallback(() => {
    editor.commands.focus()
    onOpenChange(false)
  }, [editor, onOpenChange])

  const applyReference = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault()

      if (mode === 'database') {
        if (!insertDatabaseReference(editor, databaseId, databaseTitle)) {
          setError('Enter a database ID')
          inputRef.current?.focus()
          return
        }

        onOpenChange(false)
        return
      }

      if (!insertPageReference(editor, pageValue)) {
        setError('Enter a page title or ID')
        inputRef.current?.focus()
        return
      }

      onOpenChange(false)
    },
    [databaseId, databaseTitle, editor, mode, onOpenChange, pageValue]
  )

  const pickDatabase = useCallback(async () => {
    if (!picker) return

    setPicking(true)
    setError(null)
    try {
      const selectedDatabaseId = await picker()
      if (selectedDatabaseId) {
        setDatabaseId(selectedDatabaseId)
      }
    } finally {
      setPicking(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [picker])

  const setReferenceMode = useCallback((nextMode: ReferencePopoverMode) => {
    setMode(nextMode)
    setError(null)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      event.stopPropagation()
      close()
    },
    [close]
  )

  if (!open) return null

  return (
    <form
      data-testid="editor-reference-popover"
      role="dialog"
      aria-label="Insert reference"
      className={cn(
        'absolute z-[60] w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-border/70',
        'bg-popover p-3 text-popover-foreground shadow-xl shadow-black/15',
        'dark:shadow-black/40',
        isMobile ? 'bottom-full right-3 mb-2' : 'right-0 top-full mt-2'
      )}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={applyReference}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Reference</span>
        <button
          type="button"
          aria-label="Close reference popover"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          onClick={close}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div
        className="mb-3 grid grid-cols-2 rounded-md border border-border bg-muted/40 p-0.5"
        role="tablist"
        aria-label="Reference type"
      >
        {(['page', 'database'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            className={cn(
              'h-7 rounded px-2 text-xs font-medium transition-colors',
              mode === item
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setReferenceMode(item)}
          >
            {item === 'page' ? 'Page' : 'Database'}
          </button>
        ))}
      </div>
      {mode === 'database' ? (
        <>
          <label htmlFor={databaseInputId} className="sr-only">
            Database ID
          </label>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              id={databaseInputId}
              value={databaseId}
              placeholder="Database ID"
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `${databaseInputId}-error` : undefined}
              className={cn(
                'min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-2 text-sm',
                'outline-none transition-colors',
                'placeholder:text-muted-foreground',
                'focus:border-primary focus:ring-2 focus:ring-primary/20',
                error && 'border-destructive focus:border-destructive focus:ring-destructive/20'
              )}
              onChange={(event) => {
                setDatabaseId(event.target.value)
                setError(null)
              }}
            />
            {picker && (
              <button
                type="button"
                aria-label="Pick database reference"
                className="h-9 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground disabled:opacity-60 dark:hover:bg-white/10"
                disabled={picking}
                onClick={() => {
                  void pickDatabase()
                }}
              >
                Pick
              </button>
            )}
            <button
              type="submit"
              aria-label="Insert database reference"
              className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
              title="Insert database reference"
            >
              <Database size={16} aria-hidden="true" />
            </button>
          </div>
          <label htmlFor={databaseTitleInputId} className="sr-only">
            Database label
          </label>
          <input
            id={databaseTitleInputId}
            value={databaseTitle}
            placeholder="Optional label"
            className={cn(
              'mt-2 w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm',
              'outline-none transition-colors',
              'placeholder:text-muted-foreground',
              'focus:border-primary focus:ring-2 focus:ring-primary/20'
            )}
            onChange={(event) => setDatabaseTitle(event.target.value)}
          />
          {error && (
            <p id={`${databaseInputId}-error`} className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <label htmlFor={pageInputId} className="sr-only">
            Page reference
          </label>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              id={pageInputId}
              value={pageValue}
              placeholder="Page title or ID"
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `${pageInputId}-error` : undefined}
              className={cn(
                'min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-2 text-sm',
                'outline-none transition-colors',
                'placeholder:text-muted-foreground',
                'focus:border-primary focus:ring-2 focus:ring-primary/20',
                error && 'border-destructive focus:border-destructive focus:ring-destructive/20'
              )}
              onChange={(event) => {
                setPageValue(event.target.value)
                setError(null)
              }}
            />
            <button
              type="submit"
              aria-label="Insert page reference"
              className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
              title="Insert page reference"
            >
              <BookOpen size={16} aria-hidden="true" />
            </button>
          </div>
          {error && (
            <p id={`${pageInputId}-error`} className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </>
      )}
    </form>
  )
}

function DatabaseToolbarPopover({
  editor,
  open,
  onOpenChange,
  isMobile
}: {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
  isMobile: boolean
}): JSX.Element | null {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [databaseId, setDatabaseId] = useState('')
  const [viewType, setViewType] = useState<DatabaseToolbarViewType>('table')
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  const picker = getDatabasePicker(editor)

  useEffect(() => {
    if (!open) return

    setDatabaseId('')
    setViewType('table')
    setError(null)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [open])

  const close = useCallback(() => {
    editor.commands.focus()
    onOpenChange(false)
  }, [editor, onOpenChange])

  const applyDatabaseEmbed = useCallback(() => {
    if (!insertDatabaseEmbed(editor, databaseId, viewType)) {
      setError('Enter a database ID')
      inputRef.current?.focus()
      return
    }

    onOpenChange(false)
  }, [databaseId, editor, onOpenChange, viewType])

  const pickDatabase = useCallback(async () => {
    if (!picker) return

    setPicking(true)
    setError(null)
    try {
      const selectedDatabaseId = await picker()
      if (selectedDatabaseId) {
        setDatabaseId(selectedDatabaseId)
      }
    } finally {
      setPicking(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [picker])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      event.stopPropagation()
      close()
    },
    [close]
  )

  if (!open) return null

  return (
    <form
      data-testid="editor-database-popover"
      role="dialog"
      aria-label="Insert database embed"
      className={cn(
        'absolute z-[60] w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-border/70',
        'bg-popover p-3 text-popover-foreground shadow-xl shadow-black/15',
        'dark:shadow-black/40',
        isMobile ? 'bottom-full right-3 mb-2' : 'right-0 top-full mt-2'
      )}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        applyDatabaseEmbed()
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Database</span>
        <button
          type="button"
          aria-label="Close database popover"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          onClick={close}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <label htmlFor={inputId} className="sr-only">
        Database ID
      </label>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          id={inputId}
          value={databaseId}
          placeholder="Database ID"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            'min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-2 text-sm',
            'outline-none transition-colors',
            'placeholder:text-muted-foreground',
            'focus:border-primary focus:ring-2 focus:ring-primary/20',
            error && 'border-destructive focus:border-destructive focus:ring-destructive/20'
          )}
          onChange={(event) => {
            setDatabaseId(event.target.value)
            setError(null)
          }}
        />
        {picker && (
          <button
            type="button"
            aria-label="Pick database"
            className="h-9 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground disabled:opacity-60 dark:hover:bg-white/10"
            disabled={picking}
            onClick={() => {
              void pickDatabase()
            }}
          >
            Pick
          </button>
        )}
        <button
          type="submit"
          aria-label="Insert database embed"
          className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
          title="Insert database embed"
        >
          <Database size={16} aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p id={`${inputId}-error`} className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 grid grid-cols-3 gap-1" role="radiogroup" aria-label="Database view">
        {DATABASE_TOOLBAR_VIEW_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={viewType === type}
            aria-label={`${DATABASE_TOOLBAR_VIEW_LABELS[type]} view`}
            className={cn(
              'h-8 rounded-md border px-2 text-xs font-medium transition-colors',
              viewType === type
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10'
            )}
            onClick={() => setViewType(type)}
          >
            {DATABASE_TOOLBAR_VIEW_LABELS[type]}
          </button>
        ))}
      </div>
    </form>
  )
}

function MediaToolbarPopover({
  editor,
  open,
  onOpenChange,
  isMobile
}: {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
  isMobile: boolean
}): JSX.Element | null {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    setUrl('')
    setError(null)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [open])

  const close = useCallback(() => {
    editor.commands.focus()
    onOpenChange(false)
  }, [editor, onOpenChange])

  const applyMediaEmbed = useCallback(() => {
    if (!insertMediaEmbed(editor, url)) {
      setError('Enter a supported media URL')
      inputRef.current?.focus()
      return
    }

    onOpenChange(false)
  }, [editor, onOpenChange, url])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      event.stopPropagation()
      close()
    },
    [close]
  )

  if (!open) return null

  return (
    <form
      data-testid="editor-media-popover"
      role="dialog"
      aria-label="Insert media embed"
      className={cn(
        'absolute z-[60] w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-border/70',
        'bg-popover p-3 text-popover-foreground shadow-xl shadow-black/15',
        'dark:shadow-black/40',
        isMobile ? 'bottom-full right-3 mb-2' : 'right-0 top-full mt-2'
      )}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        applyMediaEmbed()
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Media</span>
        <button
          type="button"
          aria-label="Close media popover"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          onClick={close}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <label htmlFor={inputId} className="sr-only">
        Media URL
      </label>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          id={inputId}
          value={url}
          placeholder="Paste media URL"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            'min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-2 text-sm',
            'outline-none transition-colors',
            'placeholder:text-muted-foreground',
            'focus:border-primary focus:ring-2 focus:ring-primary/20',
            error && 'border-destructive focus:border-destructive focus:ring-destructive/20'
          )}
          onChange={(event) => {
            setUrl(event.target.value)
            setError(null)
          }}
        />
        <button
          type="submit"
          aria-label="Insert media embed"
          className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
          title="Insert media embed"
        >
          <Clapperboard size={16} aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p id={`${inputId}-error`} className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

/**
 * Render a plugin-provided toolbar button
 */
function PluginToolbarButton({
  item,
  editor,
  isMobile
}: {
  item: ToolbarItemContribution
  editor: Editor
  isMobile: boolean
}): JSX.Element {
  const isActive = item.isActive?.(editor) ?? false
  const title = item.shortcut ? `${item.title} (${item.shortcut})` : item.title

  return (
    <ToolbarButton
      onClick={() => item.action(editor)}
      active={isActive}
      title={title}
      ariaLabel={item.title}
      shortcut={item.shortcut}
      isMobile={isMobile}
    >
      {typeof item.icon === 'string' ? item.icon : <item.icon />}
    </ToolbarButton>
  )
}

interface ToolbarContentProps {
  editor: Editor
  isMobile: boolean
  linkPopoverOpen: boolean
  onLinkPopoverOpenChange: (open: boolean) => void
  referencePopoverOpen: boolean
  onReferencePopoverOpenChange: (open: boolean) => void
  databasePopoverOpen: boolean
  onDatabasePopoverOpenChange: (open: boolean) => void
  mediaPopoverOpen: boolean
  onMediaPopoverOpenChange: (open: boolean) => void
  renderLinkPopover?: boolean
  renderReferencePopover?: boolean
  renderDatabasePopover?: boolean
  renderMediaPopover?: boolean
  additionalItems?: ToolbarItemContribution[]
  onCreateComment?: (anchorData: string) => Promise<string | null>
}

function ToolbarContent({
  editor,
  isMobile,
  linkPopoverOpen,
  onLinkPopoverOpenChange,
  referencePopoverOpen,
  onReferencePopoverOpenChange,
  databasePopoverOpen,
  onDatabasePopoverOpenChange,
  mediaPopoverOpen,
  onMediaPopoverOpenChange,
  renderLinkPopover = true,
  renderReferencePopover = true,
  renderDatabasePopover = true,
  renderMediaPopover = true,
  additionalItems = [],
  onCreateComment
}: ToolbarContentProps): JSX.Element {
  // Group additional items by their group
  const formatItems = additionalItems.filter((i) => i.group === 'format')
  const insertItems = additionalItems.filter((i) => i.group === 'insert')
  const blockItems = additionalItems.filter((i) => i.group === 'block')
  const customItems = additionalItems.filter((i) => i.group === 'custom' || !i.group)

  // Handle comment creation
  const handleCreateComment = useCallback(async () => {
    if (!onCreateComment) return

    const anchor = captureTextAnchor(editor)
    if (!anchor) return

    // Encode the anchor as JSON string
    const anchorData = JSON.stringify(anchor)

    // Create the comment - parent will return the new comment ID
    const commentId = await onCreateComment(anchorData)

    if (commentId) {
      // Apply the mark to the selection
      editor.commands.setComment(commentId)
    }
  }, [editor, onCreateComment])

  const handleInsertMention = useCallback(() => {
    editor.chain().focus().insertContent('@').run()
  }, [editor])

  const handleLink = useCallback(() => {
    onLinkPopoverOpenChange(true)
  }, [onLinkPopoverOpenChange])

  const handleReference = useCallback(() => {
    onReferencePopoverOpenChange(true)
  }, [onReferencePopoverOpenChange])

  const handleDatabase = useCallback(() => {
    onDatabasePopoverOpenChange(true)
  }, [onDatabasePopoverOpenChange])

  const handleMedia = useCallback(() => {
    onMediaPopoverOpenChange(true)
  }, [onMediaPopoverOpenChange])

  const handlePickDueDate = useCallback(async () => {
    const selectedDate = await pickDate(getCurrentTaskDueDate(editor))
    if (!selectedDate) return

    editor.chain().focus().setTaskDueDate(selectedDate).run()
  }, [editor])

  const showTaskButtons = isInTaskItem(editor)

  return (
    <TooltipProvider delayDuration={150}>
      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title={getTooltipTitle('Bold', 'bold')}
        ariaLabel="Bold"
        shortcut={getShortcutDisplay('bold')}
        isMobile={isMobile}
      >
        <Bold size={16} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title={getTooltipTitle('Italic', 'italic')}
        ariaLabel="Italic"
        shortcut={getShortcutDisplay('italic')}
        isMobile={isMobile}
      >
        <Italic size={16} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title={getTooltipTitle('Strikethrough', 'strikethrough')}
        ariaLabel="Strikethrough"
        shortcut={getShortcutDisplay('strikethrough')}
        isMobile={isMobile}
      >
        <Strikethrough size={16} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        title={getTooltipTitle('Code', 'code')}
        ariaLabel="Code"
        shortcut={getShortcutDisplay('code')}
        isMobile={isMobile}
      >
        <Code2 size={16} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        onClick={handleLink}
        active={editor.isActive('link')}
        title={getTooltipTitle('Link', 'link')}
        ariaLabel="Link"
        shortcut={getShortcutDisplay('link')}
        isMobile={isMobile}
      >
        <LinkIcon size={16} aria-hidden="true" />
      </ToolbarButton>
      {renderLinkPopover && (
        <LinkToolbarPopover
          editor={editor}
          open={linkPopoverOpen}
          onOpenChange={onLinkPopoverOpenChange}
          isMobile={isMobile}
        />
      )}
      <ToolbarButton
        onClick={handleReference}
        active={
          editor.isActive('wikilink') ||
          editor.isActive('smartReference') ||
          editor.isActive('databaseReference')
        }
        title="Reference"
        ariaLabel="Reference"
        isMobile={isMobile}
      >
        <BookOpen size={16} aria-hidden="true" />
      </ToolbarButton>
      {renderReferencePopover && (
        <ReferenceToolbarPopover
          editor={editor}
          open={referencePopoverOpen}
          onOpenChange={onReferencePopoverOpenChange}
          isMobile={isMobile}
        />
      )}
      {/* Comment button - only show when handler is provided */}
      {onCreateComment && (
        <ToolbarButton
          onClick={handleCreateComment}
          active={editor.isActive('comment')}
          title="Add Comment"
          ariaLabel="Add Comment"
          isMobile={isMobile}
        >
          <MessageSquare size={16} aria-hidden="true" />
        </ToolbarButton>
      )}
      {/* Plugin format buttons */}
      {formatItems.map((item) => (
        <PluginToolbarButton key={item.title} item={item} editor={editor} isMobile={isMobile} />
      ))}

      <ToolbarDivider isMobile={isMobile} />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title={getTooltipTitle('Heading 1', 'heading-1')}
        ariaLabel="Heading 1"
        shortcut={getShortcutDisplay('heading-1')}
        isMobile={isMobile}
      >
        <Heading1 size={17} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title={getTooltipTitle('Heading 2', 'heading-2')}
        ariaLabel="Heading 2"
        shortcut={getShortcutDisplay('heading-2')}
        isMobile={isMobile}
      >
        <Heading2 size={17} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        title={getTooltipTitle('Heading 3', 'heading-3')}
        ariaLabel="Heading 3"
        shortcut={getShortcutDisplay('heading-3')}
        isMobile={isMobile}
      >
        <Heading3 size={17} aria-hidden="true" />
      </ToolbarButton>

      <ToolbarDivider isMobile={isMobile} />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title={getTooltipTitle('Bullet List', 'bullet-list')}
        ariaLabel="Bullet List"
        shortcut={getShortcutDisplay('bullet-list')}
        isMobile={isMobile}
      >
        <List size={16} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title={getTooltipTitle('Numbered List', 'ordered-list')}
        ariaLabel="Numbered List"
        shortcut={getShortcutDisplay('ordered-list')}
        isMobile={isMobile}
      >
        <ListOrdered size={16} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive('taskList')}
        title={getTooltipTitle('Task List', 'task-list')}
        ariaLabel="Task List"
        shortcut={getShortcutDisplay('task-list')}
        isMobile={isMobile}
      >
        <ListTodo size={16} aria-hidden="true" />
      </ToolbarButton>
      {showTaskButtons && (
        <ToolbarButton
          onClick={handleInsertMention}
          active={editor.isActive('taskMention')}
          title="Mention Assignee"
          ariaLabel="Mention Assignee"
          isMobile={isMobile}
        >
          <AtSign size={16} aria-hidden="true" />
        </ToolbarButton>
      )}
      {showTaskButtons && (
        <ToolbarButton
          onClick={() => {
            void handlePickDueDate()
          }}
          active={getCurrentTaskDueDate(editor) !== null}
          title="Set Due Date"
          ariaLabel="Set Due Date"
          isMobile={isMobile}
        >
          <CalendarDays size={16} aria-hidden="true" />
        </ToolbarButton>
      )}

      <ToolbarDivider isMobile={isMobile} />

      {/* Blocks */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title={getTooltipTitle('Quote', 'blockquote')}
        ariaLabel="Quote"
        shortcut={getShortcutDisplay('blockquote')}
        isMobile={isMobile}
      >
        <TextQuote size={16} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        title={getTooltipTitle('Code Block', 'code-block')}
        ariaLabel="Code Block"
        shortcut={getShortcutDisplay('code-block')}
        isMobile={isMobile}
      >
        <Braces size={16} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        active={false}
        title={getTooltipTitle('Divider', 'horizontal-rule')}
        ariaLabel="Divider"
        shortcut={getShortcutDisplay('horizontal-rule')}
        isMobile={isMobile}
      >
        <Minus size={16} aria-hidden="true" />
      </ToolbarButton>
      {/* Plugin block buttons */}
      {blockItems.map((item) => (
        <PluginToolbarButton key={item.title} item={item} editor={editor} isMobile={isMobile} />
      ))}
      {/* Plugin insert buttons */}
      {insertItems.length > 0 && <ToolbarDivider isMobile={isMobile} />}
      {insertItems.map((item) => (
        <PluginToolbarButton key={item.title} item={item} editor={editor} isMobile={isMobile} />
      ))}
      <ToolbarDivider isMobile={isMobile} />
      <ToolbarButton
        onClick={handleDatabase}
        active={editor.isActive('databaseEmbed')}
        title="Database"
        ariaLabel="Database"
        isMobile={isMobile}
      >
        <Database size={16} aria-hidden="true" />
      </ToolbarButton>
      {renderDatabasePopover && (
        <DatabaseToolbarPopover
          editor={editor}
          open={databasePopoverOpen}
          onOpenChange={onDatabasePopoverOpenChange}
          isMobile={isMobile}
        />
      )}
      <ToolbarButton
        onClick={handleMedia}
        active={editor.isActive('embed')}
        title="Media"
        ariaLabel="Media"
        isMobile={isMobile}
      >
        <Clapperboard size={16} aria-hidden="true" />
      </ToolbarButton>
      {renderMediaPopover && (
        <MediaToolbarPopover
          editor={editor}
          open={mediaPopoverOpen}
          onOpenChange={onMediaPopoverOpenChange}
          isMobile={isMobile}
        />
      )}
      {/* Plugin custom buttons */}
      {customItems.length > 0 && <ToolbarDivider isMobile={isMobile} />}
      {customItems.map((item) => (
        <PluginToolbarButton key={item.title} item={item} editor={editor} isMobile={isMobile} />
      ))}

      {/* Mobile-only buttons */}
      {isMobile && <ToolbarDivider isMobile={isMobile} />}

      {/* Indent/Outdent - mobile only */}
      <ToolbarButton
        onClick={() => {
          if (editor.can().liftListItem('listItem')) {
            editor.chain().focus().liftListItem('listItem').run()
          } else if (editor.can().liftListItem('taskItem')) {
            editor.chain().focus().liftListItem('taskItem').run()
          }
        }}
        active={false}
        title="Outdent"
        ariaLabel="Outdent"
        mobileOnly
        isMobile={isMobile}
      >
        <Outdent size={18} aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => {
          if (editor.can().sinkListItem('listItem')) {
            editor.chain().focus().sinkListItem('listItem').run()
          } else if (editor.can().sinkListItem('taskItem')) {
            editor.chain().focus().sinkListItem('taskItem').run()
          }
        }}
        active={false}
        title="Indent"
        ariaLabel="Indent"
        mobileOnly
        isMobile={isMobile}
      >
        <Indent size={18} aria-hidden="true" />
      </ToolbarButton>

      {/* Quick heading toggle - mobile only */}
      <ToolbarButton
        onClick={() => {
          // Cycle through: paragraph -> h1 -> h2 -> h3 -> paragraph
          if (editor.isActive('heading', { level: 3 })) {
            editor.chain().focus().setParagraph().run()
          } else if (editor.isActive('heading', { level: 2 })) {
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          } else if (editor.isActive('heading', { level: 1 })) {
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          } else {
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        }}
        active={editor.isActive('heading')}
        title="Toggle Heading"
        ariaLabel="Toggle Heading"
        mobileOnly
        isMobile={isMobile}
      >
        <Heading size={18} aria-hidden="true" />
      </ToolbarButton>

      {/* Mention/Link - mobile only (placeholder for future) */}
      <ToolbarButton
        onClick={handleInsertMention}
        active={false}
        title="Mention"
        ariaLabel="Mention"
        mobileOnly
        isMobile={isMobile}
      >
        <AtSign size={18} aria-hidden="true" />
      </ToolbarButton>
    </TooltipProvider>
  )
}

/**
 * Mobile toolbar - fixed at bottom, horizontally scrollable
 */
function MobileToolbar({
  editor,
  isFocused,
  keyboard,
  className,
  surface,
  linkPopoverOpen,
  onLinkPopoverOpenChange,
  referencePopoverOpen,
  onReferencePopoverOpenChange,
  databasePopoverOpen,
  onDatabasePopoverOpenChange,
  mediaPopoverOpen,
  onMediaPopoverOpenChange,
  additionalItems = [],
  onCreateComment
}: {
  editor: Editor
  isFocused: boolean
  keyboard: { visible: boolean; height: number }
  className?: string
  surface: ToolbarSurface
  linkPopoverOpen: boolean
  onLinkPopoverOpenChange: (open: boolean) => void
  referencePopoverOpen: boolean
  onReferencePopoverOpenChange: (open: boolean) => void
  databasePopoverOpen: boolean
  onDatabasePopoverOpenChange: (open: boolean) => void
  mediaPopoverOpen: boolean
  onMediaPopoverOpenChange: (open: boolean) => void
  additionalItems?: ToolbarItemContribution[]
  onCreateComment?: (anchorData: string) => Promise<string | null>
}): JSX.Element | null {
  const scrollRef = useRef<HTMLDivElement>(null)
  const popoverOpen =
    linkPopoverOpen || referencePopoverOpen || databasePopoverOpen || mediaPopoverOpen

  // Only show when editor is focused
  if (!isFocused && !popoverOpen) return null

  return (
    <div
      data-testid="editor-mobile-toolbar"
      data-editor-toolbar-surface={surface}
      data-canvas-interactive={surface === 'canvas-inline' ? 'true' : undefined}
      className={cn(
        'fixed left-0 right-0 z-50',
        'bg-background/95 backdrop-blur-sm border-t border-border',
        'shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]',
        className
      )}
      style={{
        // Position above keyboard when visible, otherwise at bottom with safe area
        bottom: keyboard.visible ? `${keyboard.height}px` : 0,
        // Only use safe area padding when keyboard is NOT visible (keyboard handles its own padding)
        paddingBottom: keyboard.visible ? 0 : 'env(safe-area-inset-bottom, 0px)',
        // Smooth transition when keyboard appears/disappears
        transition: 'bottom 0.1s ease-out'
      }}
    >
      <Toolbar
        ref={scrollRef}
        variant="fixed"
        aria-label={getToolbarAriaLabel(surface)}
        className="relative gap-1 px-3 py-2 overflow-x-auto scrollbar-none"
        style={{
          // Hide scrollbar but allow scrolling
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <ToolbarContent
          editor={editor}
          isMobile={true}
          linkPopoverOpen={linkPopoverOpen}
          onLinkPopoverOpenChange={onLinkPopoverOpenChange}
          referencePopoverOpen={referencePopoverOpen}
          onReferencePopoverOpenChange={onReferencePopoverOpenChange}
          databasePopoverOpen={databasePopoverOpen}
          onDatabasePopoverOpenChange={onDatabasePopoverOpenChange}
          mediaPopoverOpen={mediaPopoverOpen}
          onMediaPopoverOpenChange={onMediaPopoverOpenChange}
          renderLinkPopover={false}
          renderReferencePopover={false}
          renderDatabasePopover={false}
          renderMediaPopover={false}
          additionalItems={additionalItems}
          onCreateComment={onCreateComment}
        />
      </Toolbar>
      <LinkToolbarPopover
        editor={editor}
        open={linkPopoverOpen}
        onOpenChange={onLinkPopoverOpenChange}
        isMobile={true}
      />
      <ReferenceToolbarPopover
        editor={editor}
        open={referencePopoverOpen}
        onOpenChange={onReferencePopoverOpenChange}
        isMobile={true}
      />
      <DatabaseToolbarPopover
        editor={editor}
        open={databasePopoverOpen}
        onOpenChange={onDatabasePopoverOpenChange}
        isMobile={true}
      />
      <MediaToolbarPopover
        editor={editor}
        open={mediaPopoverOpen}
        onOpenChange={onMediaPopoverOpenChange}
        isMobile={true}
      />
    </div>
  )
}

/**
 * Desktop toolbar - bubble menu floating near cursor
 */
function DesktopToolbar({
  editor,
  className,
  compact = false,
  surface,
  linkPopoverOpen,
  onLinkPopoverOpenChange,
  referencePopoverOpen,
  onReferencePopoverOpenChange,
  databasePopoverOpen,
  onDatabasePopoverOpenChange,
  mediaPopoverOpen,
  onMediaPopoverOpenChange,
  additionalItems = [],
  onCreateComment
}: {
  editor: Editor
  className?: string
  compact?: boolean
  surface: ToolbarSurface
  linkPopoverOpen: boolean
  onLinkPopoverOpenChange: (open: boolean) => void
  referencePopoverOpen: boolean
  onReferencePopoverOpenChange: (open: boolean) => void
  databasePopoverOpen: boolean
  onDatabasePopoverOpenChange: (open: boolean) => void
  mediaPopoverOpen: boolean
  onMediaPopoverOpenChange: (open: boolean) => void
  additionalItems?: ToolbarItemContribution[]
  onCreateComment?: (anchorData: string) => Promise<string | null>
}): JSX.Element {
  const popoverOpen =
    linkPopoverOpen || referencePopoverOpen || databasePopoverOpen || mediaPopoverOpen

  return (
    <BubbleMenu
      editor={editor}
      data-testid="editor-desktop-toolbar"
      data-editor-toolbar-surface={surface}
      data-canvas-interactive={surface === 'canvas-inline' ? 'true' : undefined}
      options={{
        placement: 'top',
        offset: 8
      }}
      shouldShow={({ editor, state }) => {
        if (popoverOpen) return true
        if (!editor.isFocused) return false

        return shouldShowDesktopToolbar({
          selectionShape: deriveSelectionShape(state.selection),
          inCodeBlock: editor.isActive('codeBlock'),
          inTaskItem: editor.isActive('taskItem')
        })
      }}
      className={cn(
        'relative',
        'bg-background rounded-lg',
        'shadow-xl shadow-black/15 dark:shadow-black/40',
        'border border-border/50',
        compact && 'max-w-[min(360px,calc(100vw-24px))]',
        compact && !popoverOpen && 'overflow-x-auto',
        className
      )}
    >
      <Toolbar
        variant="floating"
        aria-label={getToolbarAriaLabel(surface)}
        className="gap-0.5 px-1 py-1"
      >
        <ToolbarContent
          editor={editor}
          isMobile={false}
          linkPopoverOpen={linkPopoverOpen}
          onLinkPopoverOpenChange={onLinkPopoverOpenChange}
          referencePopoverOpen={referencePopoverOpen}
          onReferencePopoverOpenChange={onReferencePopoverOpenChange}
          databasePopoverOpen={databasePopoverOpen}
          onDatabasePopoverOpenChange={onDatabasePopoverOpenChange}
          mediaPopoverOpen={mediaPopoverOpen}
          onMediaPopoverOpenChange={onMediaPopoverOpenChange}
          additionalItems={additionalItems}
          onCreateComment={onCreateComment}
        />
      </Toolbar>
    </BubbleMenu>
  )
}

/**
 * Floating toolbar component - Obsidian-style
 *
 * On desktop: Bubble menu floating near cursor/selection
 * On mobile: Fixed at bottom, horizontally scrollable, with extra mobile buttons
 */
export function FloatingToolbar({
  editor,
  className,
  mode = 'auto',
  surface = 'page',
  keyboardThresholds,
  additionalItems = [],
  onCreateComment
}: FloatingToolbarProps): JSX.Element | null {
  const ux = useEditorUxState(editor, mode, keyboardThresholds)
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false)
  const [referencePopoverOpen, setReferencePopoverOpen] = useState(false)
  const [databasePopoverOpen, setDatabasePopoverOpen] = useState(false)
  const [mediaPopoverOpen, setMediaPopoverOpen] = useState(false)

  const handleLinkPopoverOpenChange = useCallback((open: boolean) => {
    setLinkPopoverOpen(open)
    if (open) {
      setReferencePopoverOpen(false)
      setDatabasePopoverOpen(false)
      setMediaPopoverOpen(false)
    }
  }, [])

  const handleReferencePopoverOpenChange = useCallback((open: boolean) => {
    setReferencePopoverOpen(open)
    if (open) {
      setLinkPopoverOpen(false)
      setDatabasePopoverOpen(false)
      setMediaPopoverOpen(false)
    }
  }, [])

  const handleDatabasePopoverOpenChange = useCallback((open: boolean) => {
    setDatabasePopoverOpen(open)
    if (open) {
      setLinkPopoverOpen(false)
      setReferencePopoverOpen(false)
      setMediaPopoverOpen(false)
    }
  }, [])

  const handleMediaPopoverOpenChange = useCallback((open: boolean) => {
    setMediaPopoverOpen(open)
    if (open) {
      setLinkPopoverOpen(false)
      setReferencePopoverOpen(false)
      setDatabasePopoverOpen(false)
    }
  }, [])

  useEffect(() => {
    if (!editor) return

    const handleOpenLinkPopover = (event: Event) => {
      const detail = (event as CustomEvent<OpenLinkPopoverEventDetail>).detail
      if (detail.editor !== editor) return

      handleLinkPopoverOpenChange(true)
    }

    window.addEventListener(OPEN_LINK_POPOVER_EVENT, handleOpenLinkPopover)
    return () => window.removeEventListener(OPEN_LINK_POPOVER_EVENT, handleOpenLinkPopover)
  }, [editor, handleLinkPopoverOpenChange])

  if (!editor) return null

  const shouldMountDesktopToolbar =
    (surface === 'canvas-inline' || !ux.isMobile) &&
    surface !== 'read' &&
    surface !== 'canvas-preview'

  const policy = resolveToolbarPolicy({
    surface,
    isMobile: ux.isMobile,
    isFocused: ux.isFocused,
    selectionShape: ux.selectionShape,
    inCodeBlock: editor.isActive('codeBlock'),
    inTaskItem: editor.isActive('taskItem')
  })

  if (policy.presentation === 'mobile-fixed') {
    return (
      <MobileToolbar
        editor={editor}
        isFocused={ux.isFocused}
        keyboard={ux.keyboard}
        className={className}
        surface={surface}
        linkPopoverOpen={linkPopoverOpen}
        onLinkPopoverOpenChange={handleLinkPopoverOpenChange}
        referencePopoverOpen={referencePopoverOpen}
        onReferencePopoverOpenChange={handleReferencePopoverOpenChange}
        databasePopoverOpen={databasePopoverOpen}
        onDatabasePopoverOpenChange={handleDatabasePopoverOpenChange}
        mediaPopoverOpen={mediaPopoverOpen}
        onMediaPopoverOpenChange={handleMediaPopoverOpenChange}
        additionalItems={additionalItems}
        onCreateComment={onCreateComment}
      />
    )
  }

  if (shouldMountDesktopToolbar) {
    return (
      <DesktopToolbar
        editor={editor}
        className={className}
        compact={policy.isCompact || surface === 'canvas-inline'}
        surface={surface}
        linkPopoverOpen={linkPopoverOpen}
        onLinkPopoverOpenChange={handleLinkPopoverOpenChange}
        referencePopoverOpen={referencePopoverOpen}
        onReferencePopoverOpenChange={handleReferencePopoverOpenChange}
        databasePopoverOpen={databasePopoverOpen}
        onDatabasePopoverOpenChange={handleDatabasePopoverOpenChange}
        mediaPopoverOpen={mediaPopoverOpen}
        onMediaPopoverOpenChange={handleMediaPopoverOpenChange}
        additionalItems={additionalItems}
        onCreateComment={onCreateComment}
      />
    )
  }

  if (policy.presentation === 'hidden') return null

  return (
    <DesktopToolbar
      editor={editor}
      className={className}
      compact={policy.isCompact}
      surface={surface}
      linkPopoverOpen={linkPopoverOpen}
      onLinkPopoverOpenChange={handleLinkPopoverOpenChange}
      referencePopoverOpen={referencePopoverOpen}
      onReferencePopoverOpenChange={handleReferencePopoverOpenChange}
      databasePopoverOpen={databasePopoverOpen}
      onDatabasePopoverOpenChange={handleDatabasePopoverOpenChange}
      mediaPopoverOpen={mediaPopoverOpen}
      onMediaPopoverOpenChange={handleMediaPopoverOpenChange}
      additionalItems={additionalItems}
      onCreateComment={onCreateComment}
    />
  )
}
