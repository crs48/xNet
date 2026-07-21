/**
 * FloatingDock — the bottom-center chat dock over the editor (exploration 0286).
 *
 * Two floating islands docked to the editor region with an exact 8px gap to
 * every neighbour (sidebar / right island / status bar). The **Assistant**
 * (flex:1) is a compact launcher into the real AI surface — it never fabricates
 * a conversation. The **video-call** island (fixed 236px) is faithful to the
 * design but only mounts when a call is live (`floatCall`, off until a real
 * calling backend is wired). Each island is independently dismissable.
 */
import { useNavigate } from '@tanstack/react-router'
import { useIdentity } from '@xnetjs/react'
import { DIDAvatar } from '@xnetjs/ui'
import { ArrowUp, Camera, Mic, Minus, PhoneOff, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { useWorkbench } from './state'

const RIGHT_ISLAND = 300
const GAP = 8

function Assistant() {
  const setFloatAi = useWorkbench((s) => s.setFloatAi)
  const navigate = useNavigate()
  const [value, setValue] = useState('')

  const send = () => {
    // The compact dock hands off to the full assistant surface — no local
    // model/connector state is duplicated here. The question rides along in
    // `?q=` so the hand-off never loses what the user typed: this used to call
    // setActiveSurface('ai'), which under unified nav opened nothing and
    // cleared the input (0388).
    const question = value.trim()
    if (!question) return
    void navigate({ to: '/ai', search: { q: question } })
    setValue('')
  }

  return (
    <div className="pointer-events-auto flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-hairline bg-island-b">
      <div className="flex items-center gap-2 border-b border-hairline px-2.5 py-2">
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-ink-1 text-island-b">
          <Sparkles size={13} className="fill-current" strokeWidth={0} />
        </span>
        <span className="text-[13px] font-semibold text-ink-1">Assistant</span>
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        <span className="flex-1" />
        <button
          type="button"
          title="Minimize"
          aria-label="Minimize assistant"
          onClick={() => setFloatAi(false)}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-md border-none bg-transparent text-ink-3 cursor-pointer hover:bg-background-muted hover:text-ink-1"
        >
          <Minus size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="Close"
          aria-label="Close assistant"
          onClick={() => setFloatAi(false)}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-md border-none bg-transparent text-ink-3 cursor-pointer hover:bg-background-muted hover:text-ink-1"
        >
          <X size={15} strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex items-center gap-2.5 px-3 py-4 text-[13px] text-ink-2">
        <Sparkles size={16} strokeWidth={1.75} className="shrink-0 text-ink-3" />
        Ask about this workspace — I can search, summarise, and draft.
      </div>
      <form
        className="flex items-center gap-2 border-t border-hairline py-2 pl-3 pr-2"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask the assistant…"
          className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-ink-1 outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          title="Send"
          aria-label="Send"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-none bg-primary text-primary-foreground cursor-pointer hover:bg-primary-hover"
        >
          <ArrowUp size={15} strokeWidth={2} />
        </button>
      </form>
    </div>
  )
}

function VideoCall() {
  const setFloatCall = useWorkbench((s) => s.setFloatCall)
  const { identity } = useIdentity()
  const round =
    'flex h-[34px] w-[34px] items-center justify-center rounded-full border border-hairline bg-island text-ink-1 cursor-pointer'
  return (
    <div className="pointer-events-auto flex w-[236px] shrink-0 flex-col overflow-hidden rounded-[14px] border border-hairline bg-island-b">
      <div
        className="relative flex h-[150px] items-center justify-center"
        style={{ background: 'linear-gradient(140deg, hsl(214 24% 32%), hsl(258 26% 24%))' }}
      >
        {identity ? (
          <DIDAvatar did={identity.did} size={40} />
        ) : (
          <span className="h-10 w-10 rounded-full bg-white/20" />
        )}
        <span className="absolute right-2 top-2 flex items-center gap-1.5 rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
          00:00
        </span>
      </div>
      <div className="flex items-center justify-center gap-2.5 p-2.5">
        <button type="button" title="Mute" aria-label="Mute" className={round}>
          <Mic size={16} strokeWidth={1.75} />
        </button>
        <button type="button" title="Camera" aria-label="Camera" className={round}>
          <Camera size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="Leave"
          aria-label="Leave call"
          onClick={() => setFloatCall(false)}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-none bg-destructive text-white cursor-pointer"
        >
          <PhoneOff size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}

export function FloatingDock() {
  const floatAi = useWorkbench((s) => s.floatAi)
  const floatCall = useWorkbench((s) => s.floatCall)
  const setFloatAi = useWorkbench((s) => s.setFloatAi)
  const sidebarCollapsed = useWorkbench((s) => s.sidebarCollapsed)
  const sidebarWidth = useWorkbench((s) => s.sidebarWidth)
  const rightOpen = useWorkbench((s) => s.right.open)

  // The dock is absolutely positioned inside the body row, so its offsets are
  // relative to that row (which already sits inside the 11px root padding and
  // above the status island). An 8px gap to each neighbour: the sidebar/right
  // islands on the sides, the status island below (the root's 8px row gap).
  const left = !sidebarCollapsed ? sidebarWidth + GAP : 0
  const right = rightOpen ? RIGHT_ISLAND + GAP : 0
  const bottom = 0

  if (!floatAi && !floatCall) {
    // Compact reopener so a dismissed Assistant is one click away.
    return (
      <div
        className="pointer-events-none absolute z-30 flex justify-end"
        style={{ left, right, bottom }}
      >
        <button
          type="button"
          onClick={() => setFloatAi(true)}
          title="Assistant"
          aria-label="Open assistant"
          className="pointer-events-auto flex h-9 items-center gap-2 rounded-full border border-hairline bg-island-b px-3 text-[13px] font-medium text-ink-1 cursor-pointer hover:bg-background-muted"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-ink-1 text-island-b">
            <Sparkles size={11} className="fill-current" strokeWidth={0} />
          </span>
          Assistant
        </button>
      </div>
    )
  }

  return (
    <div
      className="pointer-events-none absolute z-30 flex items-end justify-center gap-2"
      style={{ left, right, bottom }}
    >
      {floatAi && <Assistant />}
      {floatCall && <VideoCall />}
    </div>
  )
}
