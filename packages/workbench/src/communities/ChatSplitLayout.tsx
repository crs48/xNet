import { useMediaQuery } from '@xnetjs/ui'
import { GripVertical } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'

const WIDTH_KEY = 'xnet:chat-detail-width:v1'
const DEFAULT_WIDTH = 480

/** Keep the conversation mounted while its optional detail panel opens and resizes. */
export function ChatSplitLayout({ children, detail }: { children: ReactNode; detail?: ReactNode }) {
  const wide = useMediaQuery('(min-width: 1024px)')
  const panel = usePanelRef()
  const [initial] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(WIDTH_KEY))
      return {
        width: Number.isFinite(saved) && saved >= 320 && saved <= 2400 ? saved : DEFAULT_WIDTH,
        error: false
      }
    } catch {
      return { width: DEFAULT_WIDTH, error: true }
    }
  })
  const [storageError, setStorageError] = useState(initial.error)
  const preferred = useRef(initial.width)
  const open = Boolean(detail)
  const dragging = useRef(false)

  useEffect(() => {
    if (open && wide) panel.current?.resize(preferred.current)
  }, [open, wide, panel])

  const saveWidth = useCallback((width: number) => {
    preferred.current = width
    try {
      localStorage.setItem(WIDTH_KEY, String(Math.round(width)))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [])
  const rememberWidth = useCallback(() => {
    if (wide && open && panel.current) saveWidth(panel.current.getSize().inPixels)
  }, [wide, open, panel, saveWidth])

  useEffect(() => {
    let frame = 0
    const finish = () => {
      if (!dragging.current) return
      dragging.current = false
      // Read after the library commits its final layout, not the preceding pointer move.
      frame = requestAnimationFrame(rememberWidth)
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [rememberWidth])
  return (
    <Group
      orientation="horizontal"
      className="relative flex min-h-0 min-w-0 flex-1"
      disabled={!wide || !open}
    >
      <Panel
        id="chat"
        minSize={wide && open ? '280px' : '0%'}
        maxSize={!wide && open ? '0%' : '100%'}
        className="flex h-full min-h-0 min-w-0"
      >
        {children}
      </Panel>
      {open && (
        <>
          {wide && (
            <Separator
              aria-label="Resize right sidebar"
              title="Drag or use arrow keys to resize. Double-click to reset."
              className="group relative z-20 flex w-1 shrink-0 cursor-col-resize items-center justify-center bg-border/40 outline-none hover:bg-border focus-visible:bg-primary/30 data-[separator=active]:bg-primary/30"
              onPointerDownCapture={() => {
                dragging.current = true
              }}
              onKeyUp={() => requestAnimationFrame(rememberWidth)}
              onDoubleClick={() => {
                panel.current?.resize(DEFAULT_WIDTH)
                saveWidth(DEFAULT_WIDTH)
              }}
            >
              <span className="flex h-9 w-3 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm opacity-60 group-hover:opacity-100 group-focus-visible:opacity-100">
                <GripVertical size={12} />
              </span>
            </Separator>
          )}
          <Panel
            id="detail"
            panelRef={panel}
            defaultSize={wide ? `${initial.width}px` : '100%'}
            minSize={wide ? '320px' : '100%'}
            maxSize="100%"
            className="flex h-full min-h-0 min-w-0 flex-col"
          >
            {storageError && (
              <p role="status" className="bg-muted px-3 py-1 text-xs text-muted-foreground">
                Sidebar width is saved for this session only.
              </p>
            )}
            {detail}
          </Panel>
        </>
      )}
    </Group>
  )
}
