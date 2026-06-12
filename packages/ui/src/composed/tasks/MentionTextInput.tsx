/**
 * MentionTextInput - a plain text input with @mention-to-assign.
 *
 * Typing `@` opens a people menu; selecting an entry strips the token
 * from the text and reports the DID via `onMention`. This brings the
 * page editor's "@name assigns a person" affordance to non-TipTap
 * surfaces (task quick-add, inline title editing).
 */
import { useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { DIDAvatar } from '../../components/DIDAvatar'
import { cn } from '../../utils'
import { filterTaskPeople, taskPersonLabel, type TaskPersonOption } from './people'

export interface MentionTextInputProps {
  value: string
  onChange: (value: string) => void
  /** Candidates for @mention; empty disables the menu entirely */
  people?: TaskPersonOption[]
  /** A person was @mentioned (token already stripped from the text) */
  onMention?: (did: string) => void
  /** Enter pressed while the mention menu is closed */
  onSubmit?: () => void
  /** Escape pressed while the mention menu is closed */
  onCancel?: () => void
  onBlur?: () => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
  inputRef?: RefObject<HTMLInputElement>
  'data-testid'?: string
}

interface ActiveMention {
  /** Index of the `@` character in the value */
  start: number
  query: string
}

/** Find the @token the caret is inside of, if any. */
export function findActiveMention(value: string, caret: number): ActiveMention | null {
  const head = value.slice(0, caret)
  const at = head.lastIndexOf('@')
  if (at === -1) return null
  // `@` must start the string or follow whitespace, and the query may not
  // contain whitespace or another `@`.
  if (at > 0 && !/\s/.test(head[at - 1] ?? '')) return null
  const query = head.slice(at + 1)
  if (/[\s@]/.test(query)) return null
  return { start: at, query }
}

export function MentionTextInput({
  value,
  onChange,
  people = [],
  onMention,
  onSubmit,
  onCancel,
  onBlur,
  placeholder,
  autoFocus,
  className,
  inputRef,
  'data-testid': testId
}: MentionTextInputProps) {
  const fallbackRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? fallbackRef
  const [mention, setMention] = useState<ActiveMention | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const suggestions = useMemo(
    () => (mention ? filterTaskPeople(people, mention.query) : []),
    [mention, people]
  )
  const menuOpen = mention !== null && people.length > 0

  const syncMention = (nextValue: string, caret: number | null) => {
    setMention(caret == null ? null : findActiveMention(nextValue, caret))
    setActiveIndex(0)
  }

  const selectMention = (person: TaskPersonOption) => {
    if (!mention) return
    const caret = ref.current?.selectionStart ?? mention.start + 1 + mention.query.length
    const before = value.slice(0, mention.start)
    const after = value.slice(caret)
    onChange((before + after).replace(/ {2,}/g, ' '))
    onMention?.(person.did)
    setMention(null)
    ref.current?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (menuOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 1, 0))
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const person = suggestions[activeIndex]
        if (person) {
          event.preventDefault()
          selectMention(person)
          return
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setMention(null)
        return
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      onSubmit?.()
    } else if (event.key === 'Escape') {
      onCancel?.()
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={ref}
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        data-testid={testId}
        onChange={(event) => {
          onChange(event.target.value)
          syncMention(event.target.value, event.target.selectionStart)
        }}
        onClick={(event) => syncMention(value, event.currentTarget.selectionStart)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Let menu clicks land before the menu unmounts.
          window.setTimeout(() => setMention(null), 120)
          onBlur?.()
        }}
        className={cn(
          'w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted',
          className
        )}
      />
      {menuOpen && (
        <div
          data-testid="mention-menu"
          className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border border-border bg-background p-1 shadow-lg"
        >
          {suggestions.length === 0 ? (
            <p className="m-0 px-2 py-1.5 text-xs text-foreground-muted">No matching people</p>
          ) : (
            suggestions.map((person, index) => (
              <button
                key={person.did}
                type="button"
                data-testid="mention-option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMention(person)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground',
                  index === activeIndex ? 'bg-background-subtle' : 'hover:bg-background-subtle'
                )}
              >
                <DIDAvatar did={person.did} size={18} />
                <span className="min-w-0 flex-1 truncate">
                  {taskPersonLabel(person)}
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
