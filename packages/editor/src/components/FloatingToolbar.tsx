/**
 * FloatingToolbar - Obsidian-style floating toolbar for the editor
 *
 * Desktop: Bubble menu that floats near cursor/selection
 * Mobile: Fixed at bottom, above keyboard, horizontally scrollable
 */
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/react/menus'
import { useState, useEffect, useRef, useCallback, type JSX } from 'react'
import { captureTextAnchor } from '../extensions/comment'
import { cn } from '../utils'

/** Toolbar display mode */
export type ToolbarMode = 'auto' | 'desktop' | 'mobile'

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
   * Additional toolbar items from plugins
   */
  additionalItems?: ToolbarItemContribution[]
  /**
   * Comment creation handler. When provided, shows a Comment button.
   * Called with anchor data; should return the new comment ID.
   */
  onCreateComment?: (anchorData: string) => Promise<string | null>
}

// Check if we're on a mobile device
function useIsMobile(mode?: ToolbarMode): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // If mode is explicitly set, don't auto-detect
    if (mode === 'desktop') {
      setIsMobile(false)
      return
    }
    if (mode === 'mobile') {
      setIsMobile(true)
      return
    }

    // Auto-detect based on device/viewport
    const checkMobile = () => {
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isNarrow = window.innerWidth < 768
      setIsMobile(hasTouch || isNarrow)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [mode])

  return isMobile
}

// Track keyboard visibility and height on mobile
interface KeyboardState {
  visible: boolean
  height: number
}

function useKeyboardVisible(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({ visible: false, height: 0 })

  useEffect(() => {
    // Use visualViewport API if available (modern browsers)
    const viewport = window.visualViewport
    if (!viewport) return

    const handleResize = () => {
      // Calculate keyboard height from the difference between window and viewport height
      const keyboardHeight = window.innerHeight - viewport.height
      // If viewport height is significantly less than window height, keyboard is likely open
      const keyboardOpen = viewport.height < window.innerHeight * 0.75
      setState({
        visible: keyboardOpen,
        height: keyboardOpen ? keyboardHeight : 0
      })
    }

    viewport.addEventListener('resize', handleResize)
    // Also listen for scroll to handle iOS scroll behavior
    viewport.addEventListener('scroll', handleResize)
    return () => {
      viewport.removeEventListener('resize', handleResize)
      viewport.removeEventListener('scroll', handleResize)
    }
  }, [])

  return state
}

interface ToolbarButtonProps {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
  mobileOnly?: boolean
  isMobile: boolean
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
  mobileOnly,
  isMobile
}: ToolbarButtonProps): JSX.Element | null {
  if (mobileOnly && !isMobile) return null

  return (
    <button
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
      onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
      className={cn(
        'flex-shrink-0 flex items-center justify-center rounded text-sm font-medium',
        'transition-colors duration-100',
        'touch-manipulation select-none',
        isMobile ? 'w-10 h-10' : 'w-8 h-8',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 dark:active:bg-white/15'
      )}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}

function ToolbarDivider({ isMobile }: { isMobile: boolean }): JSX.Element {
  return (
    <span className={cn('flex-shrink-0 w-px bg-border/60', isMobile ? 'h-6 mx-1.5' : 'h-5 mx-1')} />
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
      isMobile={isMobile}
    >
      {typeof item.icon === 'string' ? item.icon : <item.icon />}
    </ToolbarButton>
  )
}

interface ToolbarContentProps {
  editor: Editor
  isMobile: boolean
  additionalItems?: ToolbarItemContribution[]
  onCreateComment?: (anchorData: string) => Promise<string | null>
}

function ToolbarContent({
  editor,
  isMobile,
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

  return (
    <>
      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold"
        isMobile={isMobile}
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic"
        isMobile={isMobile}
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough"
        isMobile={isMobile}
      >
        <s>S</s>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        title="Code"
        isMobile={isMobile}
      >
        {'</>'}
      </ToolbarButton>
      {/* Comment button - only show when handler is provided */}
      {onCreateComment && (
        <ToolbarButton
          onClick={handleCreateComment}
          active={editor.isActive('comment')}
          title="Add Comment"
          isMobile={isMobile}
        >
          {/* Comment icon - speech bubble outline */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
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
        title="Heading 1"
        isMobile={isMobile}
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
        isMobile={isMobile}
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
        isMobile={isMobile}
      >
        H3
      </ToolbarButton>

      <ToolbarDivider isMobile={isMobile} />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet List"
        isMobile={isMobile}
      >
        •
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Numbered List"
        isMobile={isMobile}
      >
        1.
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive('taskList')}
        title="Task List"
        isMobile={isMobile}
      >
        ☐
      </ToolbarButton>

      <ToolbarDivider isMobile={isMobile} />

      {/* Blocks */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Quote"
        isMobile={isMobile}
      >
        "
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        title="Code Block"
        isMobile={isMobile}
      >
        {'{}'}
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        active={false}
        title="Divider"
        isMobile={isMobile}
      >
        —
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
        mobileOnly
        isMobile={isMobile}
      >
        ←
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
        mobileOnly
        isMobile={isMobile}
      >
        →
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
        mobileOnly
        isMobile={isMobile}
      >
        #
      </ToolbarButton>

      {/* Mention/Link - mobile only (placeholder for future) */}
      <ToolbarButton
        onClick={() => {
          // TODO: Open mention picker
          editor.chain().focus().insertContent('@').run()
        }}
        active={false}
        title="Mention"
        mobileOnly
        isMobile={isMobile}
      >
        @
      </ToolbarButton>
    </>
  )
}

/**
 * Mobile toolbar - fixed at bottom, horizontally scrollable
 */
function MobileToolbar({
  editor,
  className,
  additionalItems = [],
  onCreateComment
}: {
  editor: Editor
  className?: string
  additionalItems?: ToolbarItemContribution[]
  onCreateComment?: (anchorData: string) => Promise<string | null>
}): JSX.Element | null {
  const keyboard = useKeyboardVisible()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  // Track editor focus state
  useEffect(() => {
    const handleFocus = () => setIsFocused(true)
    const handleBlur = () => {
      // Delay blur check to allow toolbar clicks
      setTimeout(() => {
        if (!editor.isFocused) setIsFocused(false)
      }, 150)
    }

    editor.on('focus', handleFocus)
    editor.on('blur', handleBlur)

    // Check initial state
    if (editor.isFocused) setIsFocused(true)

    return () => {
      editor.off('focus', handleFocus)
      editor.off('blur', handleBlur)
    }
  }, [editor])

  // Only show when editor is focused
  if (!isFocused) return null

  return (
    <div
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
      <div
        ref={scrollRef}
        className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-none"
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
          additionalItems={additionalItems}
          onCreateComment={onCreateComment}
        />
      </div>
    </div>
  )
}

/**
 * Desktop toolbar - bubble menu floating near cursor
 */
function DesktopToolbar({
  editor,
  className,
  additionalItems = [],
  onCreateComment
}: {
  editor: Editor
  className?: string
  additionalItems?: ToolbarItemContribution[]
  onCreateComment?: (anchorData: string) => Promise<string | null>
}): JSX.Element {
  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: 'top',
        offset: 8
      }}
      // Only show when there's a text selection (not on empty cursor or node selection)
      shouldShow={({ editor, from, to, state }) => {
        // Don't show for node selections (images, files, embeds have their own toolbars)
        if (state.selection instanceof NodeSelection) return false
        // Don't show in code blocks
        if (editor.isActive('codeBlock')) return false
        // Only show when there's actual text selected
        return from !== to
      }}
      className={cn(
        'flex items-center gap-0.5 px-1 py-1',
        'bg-background rounded-lg',
        'shadow-xl shadow-black/15 dark:shadow-black/40',
        'border border-border/50',
        className
      )}
    >
      <ToolbarContent
        editor={editor}
        isMobile={false}
        additionalItems={additionalItems}
        onCreateComment={onCreateComment}
      />
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
  additionalItems = [],
  onCreateComment
}: FloatingToolbarProps): JSX.Element | null {
  const isMobile = useIsMobile(mode)

  if (!editor) return null

  if (isMobile) {
    return (
      <MobileToolbar
        editor={editor}
        className={className}
        additionalItems={additionalItems}
        onCreateComment={onCreateComment}
      />
    )
  }

  return (
    <DesktopToolbar
      editor={editor}
      className={className}
      additionalItems={additionalItems}
      onCreateComment={onCreateComment}
    />
  )
}
