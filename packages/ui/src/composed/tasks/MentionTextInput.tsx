/**
 * MentionTextInput - a plain text input with structured-token autocomplete.
 *
 * Typing a trigger opens a menu; selecting an entry strips the token from the
 * text and reports a structured value, so a plain title can drive the task's
 * relations the same way the page checklist does:
 *   - `@name`  → assign a person   (onMention)
 *   - `#tag`   → categorize         (onTag / onCreateTag)
 *   - a trailing date phrase ("friday", "in 3 days") → set the due date
 *     (onDueDate), surfaced as a confirm-to-commit suggestion.
 *
 * Wiki links ([[ ]]) are intentionally not handled here: a task title is a
 * plain string rendered verbatim, so links belong in the rich description.
 */
import { CalendarDays, Hash } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { DIDAvatar } from '../../components/DIDAvatar'
import { cn } from '../../utils'
import { detectTrailingDueDate, type TrailingDueDate } from './parse-due-date'
import { filterTaskPeople, taskPersonLabel, type TaskPersonOption } from './people'

/** A workspace tag candidate for `#` autocomplete (structurally `TaskTagOption`). */
export interface MentionTagOption {
  id: string
  name: string
}

export interface MentionTextInputProps {
  value: string
  onChange: (value: string) => void
  /** Candidates for @mention; empty disables the people menu */
  people?: TaskPersonOption[]
  /** A person was @mentioned (token already stripped from the text) */
  onMention?: (did: string) => void
  /** Workspace tags offered for #hashtag autocomplete */
  tags?: MentionTagOption[]
  /** An existing tag was chosen via `#` (token already stripped) */
  onTag?: (tagId: string) => void
  /** A new tag name was chosen via `#` (token already stripped) */
  onCreateTag?: (name: string) => void
  /** A trailing date phrase was confirmed (phrase already stripped) */
  onDueDate?: (ms: number) => void
  /** Enter pressed while no menu is open */
  onSubmit?: () => void
  /** Escape pressed while no menu is open */
  onCancel?: () => void
  onBlur?: () => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
  inputRef?: RefObject<HTMLInputElement>
  'data-testid'?: string
}

interface ActiveToken {
  /** Index of the trigger character in the value */
  start: number
  query: string
}

/** Find a single-char-triggered token (`@`/`#`) the caret is inside of. */
function findActiveToken(value: string, caret: number, trigger: string): ActiveToken | null {
  const head = value.slice(0, caret)
  const at = head.lastIndexOf(trigger)
  if (at === -1) return null
  // Trigger must start the string or follow whitespace; the query may not
  // contain whitespace or another trigger.
  if (at > 0 && !/\s/.test(head[at - 1] ?? '')) return null
  const query = head.slice(at + 1)
  if (/[\s@#]/.test(query)) return null
  return { start: at, query }
}

/** Find the @token the caret is inside of, if any. */
export function findActiveMention(value: string, caret: number): ActiveToken | null {
  return findActiveToken(value, caret, '@')
}

/** Find the #token the caret is inside of, if any. */
export function findActiveHashtag(value: string, caret: number): ActiveToken | null {
  return findActiveToken(value, caret, '#')
}

export type MentionKeyAction =
  | 'menu-next'
  | 'menu-prev'
  | 'menu-select'
  | 'menu-close'
  | 'submit'
  | 'cancel'
  | null

/** Map a key press onto the input's state machine (pure, testable). */
export function interpretMentionKey(
  key: string,
  menuOpen: boolean,
  hasSelection: boolean
): MentionKeyAction {
  if (menuOpen) {
    if (key === 'ArrowDown') return 'menu-next'
    if (key === 'ArrowUp') return 'menu-prev'
    if ((key === 'Enter' || key === 'Tab') && hasSelection) return 'menu-select'
    if (key === 'Escape') return 'menu-close'
  }
  if (key === 'Enter') return 'submit'
  if (key === 'Escape') return 'cancel'
  return null
}

function filterTags(tags: MentionTagOption[], query: string, limit = 6): MentionTagOption[] {
  const needle = query.trim().toLowerCase()
  const matches = needle ? tags.filter((tag) => tag.name.toLowerCase().includes(needle)) : tags
  return matches.slice(0, limit)
}

/** The new-tag name to offer, or null when the query is empty or already exists. */
function tagToCreate(query: string, tags: MentionTagOption[]): string | null {
  const name = query.trim().toLowerCase()
  if (!name) return null
  return tags.some((tag) => tag.name.toLowerCase() === name) ? null : name
}

type Menu =
  | { kind: 'people'; start: number; items: TaskPersonOption[] }
  | { kind: 'tags'; start: number; items: MentionTagOption[]; create: string | null }
  | { kind: 'due'; match: TrailingDueDate }
  | null

interface MenuInput {
  value: string
  caret: number | null
  people: TaskPersonOption[]
  peopleEnabled: boolean
  tags: MentionTagOption[]
  tagsEnabled: boolean
  dueEnabled: boolean
}

/** Derive which menu (if any) to show for the current value + caret. */
function buildMenu({
  value,
  caret,
  people,
  peopleEnabled,
  tags,
  tagsEnabled,
  dueEnabled
}: MenuInput): Menu {
  if (caret == null) return null

  const mention = peopleEnabled ? findActiveMention(value, caret) : null
  const hashtag = tagsEnabled ? findActiveHashtag(value, caret) : null

  // The token whose trigger sits closest to the caret wins.
  if (mention && (!hashtag || mention.start > hashtag.start)) {
    return { kind: 'people', start: mention.start, items: filterTaskPeople(people, mention.query) }
  }
  if (hashtag && (!mention || hashtag.start >= mention.start)) {
    return {
      kind: 'tags',
      start: hashtag.start,
      items: filterTags(tags, hashtag.query),
      create: tagToCreate(hashtag.query, tags)
    }
  }

  // No active token: offer a trailing-date suggestion when the caret is at the
  // end of the text (so it never fights with mid-title editing).
  if (dueEnabled) {
    const trimmedEnd = value.replace(/\s+$/, '').length
    if (caret >= trimmedEnd) {
      const match = detectTrailingDueDate(value)
      if (match && match.end === trimmedEnd) return { kind: 'due', match }
    }
  }

  return null
}

export function MentionTextInput({
  value,
  onChange,
  people = [],
  onMention,
  tags = [],
  onTag,
  onCreateTag,
  onDueDate,
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
  const [caret, setCaret] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const peopleEnabled = Boolean(onMention) && people.length > 0
  const tagsEnabled = Boolean(onTag || onCreateTag)
  const dueEnabled = Boolean(onDueDate)

  const menu = useMemo(
    () =>
      dismissed
        ? null
        : buildMenu({ value, caret, people, peopleEnabled, tags, tagsEnabled, dueEnabled }),
    [value, caret, people, peopleEnabled, tags, tagsEnabled, dueEnabled, dismissed]
  )

  const listItems =
    menu?.kind === 'people'
      ? menu.items
      : menu?.kind === 'tags'
        ? menu.create
          ? [...menu.items, { id: '', name: menu.create }]
          : menu.items
        : []
  const hasSelection = menu?.kind === 'due' || Boolean(listItems[activeIndex])

  const sync = (nextCaret: number | null) => {
    setCaret(nextCaret)
    setDismissed(false)
    setActiveIndex(0)
  }

  const stripToken = (start: number, end: number): string => {
    const before = value.slice(0, start)
    const after = value.slice(end)
    return (before + after).replace(/ {2,}/g, ' ')
  }

  const commitMenu = () => {
    if (!menu) return
    const selectionEnd = ref.current?.selectionStart ?? value.length

    if (menu.kind === 'people') {
      const person = menu.items[activeIndex]
      if (!person) return
      onChange(stripToken(menu.start, selectionEnd))
      onMention?.(person.did)
    } else if (menu.kind === 'tags') {
      const items = menu.create ? [...menu.items, { id: '', name: menu.create }] : menu.items
      const chosen = items[activeIndex]
      if (!chosen) return
      onChange(stripToken(menu.start, selectionEnd))
      if (chosen.id) onTag?.(chosen.id)
      else onCreateTag?.(chosen.name)
    } else {
      const before = value.slice(0, menu.match.start).replace(/\s+$/, '')
      onChange(before)
      onDueDate?.(menu.match.ms)
    }

    setDismissed(true)
    ref.current?.focus()
  }

  const keyActions: Record<
    NonNullable<MentionKeyAction>,
    (event: KeyboardEvent<HTMLInputElement>) => void
  > = {
    'menu-next': () =>
      setActiveIndex((index) => Math.min(index + 1, Math.max(listItems.length - 1, 0))),
    'menu-prev': () => setActiveIndex((index) => Math.max(index - 1, 0)),
    'menu-select': commitMenu,
    'menu-close': (event) => {
      event.stopPropagation()
      setDismissed(true)
    },
    submit: () => onSubmit?.(),
    cancel: () => onCancel?.()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const action = interpretMentionKey(event.key, menu !== null, hasSelection)
    if (action === null) return
    if (action !== 'cancel') event.preventDefault()
    keyActions[action](event)
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
          sync(event.target.selectionStart)
        }}
        onClick={(event) => sync(event.currentTarget.selectionStart)}
        onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Let menu clicks land before the menu unmounts.
          window.setTimeout(() => setDismissed(true), 120)
          onBlur?.()
        }}
        className={cn(
          'w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted',
          className
        )}
      />
      {menu && (
        <div
          data-testid="mention-menu"
          className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border border-border bg-background p-1 shadow-lg"
        >
          {menu.kind === 'people' &&
            (menu.items.length === 0 ? (
              <p className="m-0 px-2 py-1.5 text-xs text-foreground-muted">No matching people</p>
            ) : (
              menu.items.map((person, index) => (
                <button
                  key={person.did}
                  type="button"
                  data-testid="mention-option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={commitMenu}
                  onMouseEnter={() => setActiveIndex(index)}
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
            ))}

          {menu.kind === 'tags' &&
            (listItems.length === 0 ? (
              <p className="m-0 px-2 py-1.5 text-xs text-foreground-muted">No matching tags</p>
            ) : (
              (listItems as MentionTagOption[]).map((tag, index) => (
                <button
                  key={tag.id || `create:${tag.name}`}
                  type="button"
                  data-testid="hashtag-option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={commitMenu}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground',
                    index === activeIndex ? 'bg-background-subtle' : 'hover:bg-background-subtle'
                  )}
                >
                  <Hash size={13} className="text-foreground-muted" />
                  <span className="min-w-0 flex-1 truncate">
                    {tag.id ? tag.name : `Create “${tag.name}”`}
                  </span>
                </button>
              ))
            ))}

          {menu.kind === 'due' && (
            <button
              type="button"
              data-testid="due-suggestion"
              onMouseDown={(event) => event.preventDefault()}
              onClick={commitMenu}
              className="flex w-full items-center gap-2 rounded-sm bg-background-subtle px-2 py-1.5 text-left text-sm text-foreground"
            >
              <CalendarDays size={13} className="text-foreground-muted" />
              <span className="min-w-0 flex-1 truncate">
                Set due{' '}
                {new Date(menu.match.ms).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC'
                })}
              </span>
              <kbd className="rounded border border-border px-1 text-[10px] text-foreground-muted">
                ↵
              </kbd>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
