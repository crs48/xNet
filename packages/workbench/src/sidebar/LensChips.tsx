/**
 * The lens-chip primitive (exploration 0353).
 *
 * One switcher shape for every "which projection of this am I looking
 * at" choice — the sidebar's lenses, and any surface that used to grow
 * its own internal tab bar (CRM). Sharing the primitive is what stops a
 * second tab system from reappearing inside a route.
 */

export interface LensChoice {
  id: string
  label: string
}

export function LensChips({
  choices,
  activeId,
  onSelect,
  className
}: {
  choices: readonly LensChoice[]
  activeId: string
  onSelect: (id: string) => void
  className?: string
}): React.JSX.Element {
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          onClick={() => onSelect(choice.id)}
          aria-pressed={choice.id === activeId}
          data-lens-chip={choice.id}
          className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
            choice.id === activeId
              ? 'border-transparent bg-accent text-ink-1'
              : 'border-hairline bg-transparent text-ink-3 hover:text-ink-1'
          }`}
        >
          {choice.label}
        </button>
      ))}
    </div>
  )
}
