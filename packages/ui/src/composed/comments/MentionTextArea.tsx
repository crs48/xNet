/**
 * MentionTextArea — a plain textarea with @mention typeahead (0170).
 *
 * Typing `@` opens a people menu; selecting inserts the DID-form
 * mention (`@did:key:…`) that the comment pipeline already extracts
 * into structured mentions and renders as a profile link
 * (commentReferences.ts). The menu makes DID mentions typeable while
 * the text stays the single source of truth — no hidden state.
 */
import { useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { DIDAvatar } from '../../components/DIDAvatar'
import { useListboxNavigation } from '../../hooks/useListboxNavigation'
import { cn } from '../../utils'
import { findActiveMention } from '../tasks/MentionTextInput'
import { filterTaskPeople, taskPersonLabel, type TaskPersonOption } from '../tasks/people'

export interface MentionTextAreaProps {
  value: string
  onChange: (value: string) => void
  /** Candidates for @mention; empty disables the menu entirely */
  people?: TaskPersonOption[]
  /** Host shortcuts (submit/escape); not called while the menu eats a key */
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  rows?: number
  autoFocus?: boolean
  className?: string
  containerClassName?: string
  textareaRef?: RefObject<HTMLTextAreaElement>
  'data-testid'?: string
}

export function MentionTextArea({
  value,
  onChange,
  people = [],
  onKeyDown,
  placeholder,
  rows = 3,
  autoFocus,
  className,
  containerClassName,
  textareaRef,
  'data-testid': testId
}: MentionTextAreaProps) {
  const fallbackRef = useRef<HTMLTextAreaElement>(null)
  const ref = textareaRef ?? fallbackRef
  const [mention, setMention] = useState<ReturnType<typeof findActiveMention>>(null)

  const suggestions = useMemo(
    () => (mention ? filterTaskPeople(people, mention.query) : []),
    [mention, people]
  )
  const menuOpen = mention !== null && people.length > 0

  const selectMention = (person: TaskPersonOption) => {
    if (!mention) return
    const caret = ref.current?.selectionStart ?? mention.start + 1 + mention.query.length
    const inserted = `@${person.did} `
    onChange(value.slice(0, mention.start) + inserted + value.slice(caret))
    setMention(null)
    ref.current?.focus()
  }

  // Shared listbox keyboard contract (0172): wrap + Enter/Tab commit + Escape
  // dismiss + IME guard. Committing past the end of the list closes the menu.
  const nav = useListboxNavigation({
    count: suggestions.length,
    isOpen: menuOpen,
    resetKey: mention,
    onCommit: (index) => {
      const person = suggestions[index]
      if (person) selectMention(person)
      else setMention(null)
    },
    onDismiss: () => setMention(null),
    idPrefix: 'comment-mention'
  })
  const activeIndex = nav.activeIndex

  const syncMention = (nextValue: string, caret: number | null) => {
    setMention(caret == null ? null : findActiveMention(nextValue, caret))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && nav.onKeyDown(event)) {
      event.stopPropagation()
      return
    }
    onKeyDown?.(event)
  }

  return (
    <div className={cn('relative', containerClassName)}>
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        data-testid={testId}
        role={menuOpen ? 'combobox' : undefined}
        aria-expanded={menuOpen || undefined}
        aria-controls={menuOpen ? 'comment-mention-listbox' : undefined}
        aria-activedescendant={menuOpen ? nav.activeDescendantId : undefined}
        aria-autocomplete={menuOpen ? 'list' : undefined}
        onChange={(event) => {
          onChange(event.target.value)
          syncMention(event.target.value, event.target.selectionStart)
        }}
        onClick={(event) => syncMention(value, event.currentTarget.selectionStart)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Let menu clicks land before the menu unmounts.
          window.setTimeout(() => setMention(null), 120)
        }}
        className={cn('w-full', className)}
      />
      {menuOpen && (
        <div
          data-testid="mention-menu"
          id="comment-mention-listbox"
          role="listbox"
          aria-label="People"
          className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border border-border bg-background p-1 shadow-lg"
        >
          {suggestions.length === 0 ? (
            <p className="m-0 px-2 py-1.5 text-xs text-foreground-muted">No matching people</p>
          ) : (
            suggestions.map((person, index) => (
              <button
                key={person.did}
                type="button"
                id={nav.optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                data-testid="mention-option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMention(person)}
                onMouseEnter={() => nav.setActiveIndex(index)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground',
                  index === activeIndex ? 'bg-background-subtle' : 'hover:bg-background-subtle'
                )}
              >
                <DIDAvatar did={person.did} size={18} />
                <span className="min-w-0 flex-1 truncate">
                  {taskPersonLabel(person)}
                  {person.handle && (
                    <span className="text-foreground-muted"> @{person.handle}</span>
                  )}
                  {person.isSelf && <span className="text-foreground-muted"> (you)</span>}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
