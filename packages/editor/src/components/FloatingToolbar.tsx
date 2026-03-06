/**
 * FloatingToolbar - Obsidian-style floating toolbar for the editor
 *
 * Desktop: Bubble menu that floats near cursor/selection
 * Mobile: Fixed at bottom, above keyboard, horizontally scrollable
 */
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { useRef, useCallback, type JSX } from 'react'
import { captureTextAnchor } from '../extensions/comment'
import { getCurrentTaskDueDate } from '../extensions/task-metadata'
import { cn } from '../utils'
import {
  deriveSelectionShape,
  shouldShowDesktopToolbar,
  type KeyboardThresholds,
  type ToolbarMode,
  useEditorUxState
} from './editor-ux-state'

export type { ToolbarMode } from './editor-ux-state'

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

  const handleInsertMention = useCallback(() => {
    editor.chain().focus().insertContent('@').run()
  }, [editor])

  const handlePickDueDate = useCallback(async () => {
    const selectedDate = await pickDate(getCurrentTaskDueDate(editor))
    if (!selectedDate) return

    editor.chain().focus().setTaskDueDate(selectedDate).run()
  }, [editor])

  const showTaskButtons = isInTaskItem(editor)

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
      {showTaskButtons && (
        <ToolbarButton
          onClick={handleInsertMention}
          active={editor.isActive('taskMention')}
          title="Mention Assignee"
          isMobile={isMobile}
        >
          @
        </ToolbarButton>
      )}
      {showTaskButtons && (
        <ToolbarButton
          onClick={() => {
            void handlePickDueDate()
          }}
          active={getCurrentTaskDueDate(editor) !== null}
          title="Set Due Date"
          isMobile={isMobile}
        >
          📅
        </ToolbarButton>
      )}

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
        onClick={handleInsertMention}
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
  isFocused,
  keyboard,
  className,
  additionalItems = [],
  onCreateComment
}: {
  editor: Editor
  isFocused: boolean
  keyboard: { visible: boolean; height: number }
  className?: string
  additionalItems?: ToolbarItemContribution[]
  onCreateComment?: (anchorData: string) => Promise<string | null>
}): JSX.Element | null {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Only show when editor is focused
  if (!isFocused) return null

  return (
    <div
      data-testid="editor-mobile-toolbar"
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
      data-testid="editor-desktop-toolbar"
      options={{
        placement: 'top',
        offset: 8
      }}
      shouldShow={({ editor, state }) => {
        return shouldShowDesktopToolbar({
          selectionShape: deriveSelectionShape(state.selection),
          inCodeBlock: editor.isActive('codeBlock'),
          inTaskItem: editor.isActive('taskItem')
        })
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
  keyboardThresholds,
  additionalItems = [],
  onCreateComment
}: FloatingToolbarProps): JSX.Element | null {
  const ux = useEditorUxState(editor, mode, keyboardThresholds)

  if (!editor) return null

  const isMobile = ux.isMobile

  if (isMobile) {
    return (
      <MobileToolbar
        editor={editor}
        isFocused={ux.isFocused}
        keyboard={ux.keyboard}
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
