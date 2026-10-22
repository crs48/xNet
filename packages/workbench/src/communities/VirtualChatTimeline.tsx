import type { ChatHistory } from './use-chat-history'
import type { ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, Loader2 } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { secondaryButton } from './primitives'

const HEADER_HEIGHT = 64

export function VirtualChatTimeline({
  history,
  renderMessage,
  empty,
  activity
}: {
  history: ChatHistory
  renderMessage: (message: ChatHistory['messages'][number], index: number) => ReactNode
  empty: ReactNode
  activity: ReactNode
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const initialized = useRef(false)
  const previousScroll = useRef(0)
  const userScrolling = useRef(false)
  const lastJump = useRef(history.latestRequest)
  const [atBottom, setAtBottom] = useState(true)
  const { messages, offset, loading, error, text } = history
  const getItemKey = useCallback(
    (index: number) => messages[index]?.id ?? 'chat-activity',
    [messages]
  )
  const virtualizer = useVirtualizer({
    count: messages.length + 1,
    getScrollElement: () => viewport.current,
    getItemKey,
    estimateSize: (index) => (index === messages.length ? 80 : 120),
    overscan: 6,
    scrollMargin: HEADER_HEIGHT,
    anchorTo: 'end',
    scrollEndThreshold: 80
  })
  useLayoutEffect(() => {
    if (loading || error) return
    const jump = !initialized.current || lastJump.current !== history.latestRequest
    const inspecting = viewport.current?.querySelector('[data-agent-activity][open]')
    if (jump || (following.current && offset === 0 && !text && !inspecting)) {
      userScrolling.current = false
      if (text && !initialized.current) virtualizer.scrollToOffset(0)
      else virtualizer.scrollToEnd()
      following.current = !text
    }
    initialized.current = true
    lastJump.current = history.latestRequest
  }, [messages, activity, loading, error, offset, text, history.latestRequest, virtualizer])

  // TanStack retains measured heights by key. Discard evicted history so even
  // the measurement cache stays bounded as someone scrolls through years of chat.
  useLayoutEffect(() => {
    const keys = new Set([...messages.map((message) => message.id), 'chat-activity'])
    for (const key of virtualizer.itemSizeCache.keys()) {
      if (!keys.has(String(key))) virtualizer.itemSizeCache.delete(key)
    }
  }, [messages, virtualizer])

  const older = () => {
    userScrolling.current = false
    following.current = false
    history.older()
  }
  const newer = () => {
    userScrolling.current = false
    following.current = false
    history.newer()
  }
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {error && (
        <div role="alert" className="flex items-center gap-3 px-6 py-2 text-sm">
          Could not load messages: {error.message}
          <button onClick={history.reload} className={secondaryButton}>
            Retry
          </button>
        </div>
      )}
      <div
        ref={viewport}
        data-chat-scroll
        data-chat-window-size={messages.length}
        data-chat-window-offset={offset}
        aria-label={text ? 'Message search results' : 'Conversation messages'}
        aria-busy={loading}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
        onWheel={() => {
          userScrolling.current = true
        }}
        onTouchMove={() => {
          userScrolling.current = true
        }}
        onPointerDown={() => {
          userScrolling.current = true
        }}
        onKeyDown={(event) => {
          if (
            ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)
          )
            userScrolling.current = true
        }}
        onScroll={() => {
          const node = viewport.current
          if (!node) return
          const delta = node.scrollTop - previousScroll.current
          previousScroll.current = node.scrollTop
          const bottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80
          following.current = bottom
          setAtBottom(bottom)
          if (!initialized.current || !userScrolling.current || loading || error) return
          if (delta < 0 && node.scrollTop < 100 && history.hasOlder) older()
          else if (delta > 0 && bottom && offset > 0) newer()
        }}
      >
        <div className="flex h-16 items-center justify-center px-6 text-xs text-muted-foreground">
          {loading ? (
            <span role="status" className="flex items-center gap-2">
              <Loader2 size={14} className="motion-safe:animate-spin" /> Loading messages…
            </span>
          ) : history.hasOlder ? (
            <button onClick={older} className={secondaryButton} disabled={!!error}>
              Load earlier {text ? 'results' : 'messages'}
            </button>
          ) : messages.length ? (
            text ? (
              'Start of results'
            ) : (
              'Start of conversation'
            )
          ) : null}
        </div>
        {!loading && !error && !messages.length && empty}
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 flow-root w-full"
              style={{ transform: `translateY(${row.start - HEADER_HEIGHT}px)` }}
            >
              {row.index < messages.length ? (
                renderMessage(messages[row.index], row.index)
              ) : offset > 0 ? (
                <div className="flex justify-center p-6">
                  <button onClick={newer} disabled={loading || !!error} className={secondaryButton}>
                    Load newer {text ? 'results' : 'messages'}
                  </button>
                </div>
              ) : (
                <div className="pb-6">{activity}</div>
              )}
            </div>
          ))}
        </div>
      </div>
      {(offset > 0 || !atBottom) && (
        <button
          onClick={history.jumpToLatest}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium shadow-md hover:bg-muted"
        >
          <ArrowDown size={14} /> {text ? 'Latest results' : 'Jump to latest'}
        </button>
      )}
    </div>
  )
}
