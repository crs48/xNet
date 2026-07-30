/**
 * DraftSwitcher — the compact main/draft control (exploration 0329 P2).
 *
 * Lives in host-surface headers (page toolbar, task detail). Shows where you
 * are — "Main", or a tinted chip naming the checked-out draft so a draft is
 * never mistaken for main — and opens a small menu: the node's open drafts
 * (checkout / return to main / discard), plus "New draft…" with a name input
 * (Upwelling: titles that signal intent). Quiet by design (0273/0250): one
 * ghost button on main, one clearly-tinted chip while drafted.
 */
import { useDraft } from '@xnetjs/react'
import { Check, GitBranch, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

function NewDraftForm({
  onCreate,
  onDone
}: {
  onCreate: (name: string) => Promise<void>
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      await onCreate(trimmed)
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') onDone()
        }}
        placeholder="What is this draft for?"
        aria-label="Draft name"
        className="min-w-0 flex-1 rounded-md border border-hairline bg-island px-2 py-1 text-[12px] text-ink-1 outline-none placeholder:text-ink-3"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={!name.trim() || saving}
        className="shrink-0 cursor-pointer rounded-md border-none bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:cursor-default disabled:opacity-50"
      >
        Create
      </button>
    </div>
  )
}

export function DraftSwitcher({ nodeId }: { nodeId: string }) {
  const d = useDraft(nodeId)
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Click-outside / Escape close.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) setNaming(false)
  }, [open])

  const checkedOutName =
    d.checkedOut !== null ? String(d.checkedOut.properties.name ?? 'Unnamed draft') : null

  const handleDiscard = async (draftId: string, name: string) => {
    const ok = window.confirm(
      `Discard the draft “${name}”? Its edits are thrown away — nothing on main changes.`
    )
    if (!ok) return
    await d.discard(draftId as never)
  }

  // Nothing to offer and nothing checked out on a node with no drafts is
  // still worth the entry point — the trigger IS the "New draft…" door.
  return (
    <div ref={rootRef} className="relative" data-testid="draft-switcher">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={
          checkedOutName !== null
            ? `You are editing the draft “${checkedOutName}” — main is untouched`
            : 'Drafts'
        }
        className={
          checkedOutName !== null
            ? // Persistent tinted indicator: a draft must never read as main.
              'flex cursor-pointer items-center gap-1 rounded-md border border-warning/40 bg-warning-muted px-2 py-1 text-xs font-medium text-ink-1 transition-colors hover:border-warning/60'
            : 'flex cursor-pointer items-center gap-1 rounded-md border-none bg-transparent px-2 py-1 text-xs text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-1'
        }
      >
        <GitBranch size={13} strokeWidth={1.5} />
        <span className="max-w-[160px] truncate">
          {checkedOutName !== null ? `Draft: ${checkedOutName}` : 'Main'}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-hairline bg-island-pop py-1 shadow-lg"
        >
          {/* Return to main */}
          <button
            type="button"
            role="menuitem"
            disabled={checkedOutName === null}
            onClick={() => {
              d.returnToMain()
              setOpen(false)
            }}
            className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-2 py-1.5 text-left text-[12px] text-ink-1 hover:bg-background-muted disabled:cursor-default disabled:opacity-50"
          >
            <span className="flex w-4 shrink-0 justify-center">
              {checkedOutName === null && <Check size={13} strokeWidth={1.75} />}
            </span>
            Main
          </button>

          {d.drafts.length > 0 && <div className="my-1 border-t border-hairline" />}

          {d.drafts.map((draft) => {
            const name = String(draft.properties.name ?? 'Unnamed draft')
            const active = d.checkedOut?.id === draft.id
            return (
              <div key={draft.id} className="group flex items-center">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (!active) void d.checkout(draft.id)
                    setOpen(false)
                  }}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-none bg-transparent px-2 py-1.5 text-left text-[12px] text-ink-1 hover:bg-background-muted"
                >
                  <span className="flex w-4 shrink-0 justify-center">
                    {active && <Check size={13} strokeWidth={1.75} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Discard draft ${name}`}
                  title="Discard draft"
                  onClick={() => void handleDiscard(draft.id, name)}
                  className="mr-1 flex shrink-0 cursor-pointer items-center rounded-md border-none bg-transparent p-1 text-ink-3 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              </div>
            )
          })}

          <div className="my-1 border-t border-hairline" />

          {naming ? (
            <NewDraftForm
              onCreate={async (name) => {
                await d.createDraft(name)
                setOpen(false)
              }}
              onDone={() => setNaming(false)}
            />
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setNaming(true)}
              className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-2 py-1.5 text-left text-[12px] text-ink-1 hover:bg-background-muted"
            >
              <span className="flex w-4 shrink-0 justify-center">
                <Plus size={13} strokeWidth={1.75} />
              </span>
              New draft…
            </button>
          )}
        </div>
      )}
    </div>
  )
}
