/**
 * In-house natural-language due-date parsing.
 *
 * Covers the phrases people actually type for a due date — "tomorrow",
 * "next friday", "in 3 days", "jun 12", "2026-06-12", "6/12" — and resolves
 * each to a UTC-midnight calendar day (the canonical `dueDate` form, see
 * [[due-date]]). Deliberately small and dependency-free (the repo ships no
 * date library and keeps bundles flat, exploration 0171); the stable
 * `parseDueDate` interface lets `chrono-node` drop in later if we need
 * locales or recurrence.
 *
 * Everything is computed in UTC so the parsed day matches what the rest of
 * the task surfaces store and render.
 */
import { dueDateMsToIso, isoToDueDateMs } from './due-date'

const DAY_MS = 86_400_000

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  weds: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6
}

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11
}

export interface DueDateParse {
  /** Resolved calendar day as UTC-midnight ms. */
  ms: number
  /** ISO "YYYY-MM-DD" for the resolved day. */
  iso: string
}

interface Ref {
  /** UTC midnight of the reference day. */
  todayMs: number
  /** Day-of-week of the reference day (0 = Sunday). */
  dow: number
  year: number
  month: number
}

function refFrom(now: number): Ref {
  const date = new Date(now)
  return {
    todayMs: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    dow: date.getUTCDay(),
    year: date.getUTCFullYear(),
    month: date.getUTCMonth()
  }
}

/** Days until the upcoming `target` weekday (0 = today). */
function daysToWeekday(target: number, dow: number): number {
  return (target - dow + 7) % 7
}

/** Build a UTC-midnight ms for an explicit Y/M/D, validated. */
function calendarDay(year: number, month: number, day: number): number | null {
  return isoToDueDateMs(
    `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  )
}

/** Pick the year that puts month/day on or after today (this year, else next). */
function upcomingYear(month: number, day: number, ref: Ref): number {
  const thisYear = calendarDay(ref.year, month, day)
  if (thisYear != null && thisYear >= ref.todayMs) return ref.year
  return ref.year + 1
}

type Matcher = (phrase: string, ref: Ref) => number | null

const matchKeyword: Matcher = (phrase, ref) => {
  switch (phrase) {
    case 'today':
    case 'tod':
    case 'tonight':
      return ref.todayMs
    case 'tomorrow':
    case 'tmr':
    case 'tmrw':
    case 'tom':
      return ref.todayMs + DAY_MS
    case 'yesterday':
      return ref.todayMs - DAY_MS
    case 'weekend':
    case 'this weekend':
      // Saturday, unless today is already part of the weekend.
      if (ref.dow === 0 || ref.dow === 6) return ref.todayMs
      return ref.todayMs + daysToWeekday(6, ref.dow) * DAY_MS
    case 'next week':
      return ref.todayMs + 7 * DAY_MS
    case 'next month': {
      const month = (ref.month + 1) % 12
      const year = ref.year + (ref.month === 11 ? 1 : 0)
      return calendarDay(year, month, new Date(ref.todayMs).getUTCDate())
    }
    default:
      return null
  }
}

const matchWeekday: Matcher = (phrase, ref) => {
  const match = /^(?:(this|next|on|coming)\s+)?([a-z]+)$/.exec(phrase)
  if (!match) return null
  const target = WEEKDAYS[match[2]]
  if (target === undefined) return null

  let days = daysToWeekday(target, ref.dow)
  // "next monday" / "monday" both mean the upcoming one; "next" only differs
  // by skipping today when today is that weekday.
  if (match[1] === 'next' && days === 0) days = 7
  return ref.todayMs + days * DAY_MS
}

const matchRelative: Matcher = (phrase, ref) => {
  const match = /^in\s+(\d+|a|an)\s+(day|days|week|weeks|month|months)$/.exec(phrase)
  if (!match) return null
  const count = match[1] === 'a' || match[1] === 'an' ? 1 : Number(match[1])
  if (!Number.isFinite(count)) return null

  const unit = match[2]
  if (unit.startsWith('day')) return ref.todayMs + count * DAY_MS
  if (unit.startsWith('week')) return ref.todayMs + count * 7 * DAY_MS
  // months
  const month = ref.month + count
  const year = ref.year + Math.floor(month / 12)
  return calendarDay(year, month % 12, new Date(ref.todayMs).getUTCDate())
}

const matchIso: Matcher = (phrase) => isoToDueDateMs(phrase)

const matchNumeric: Matcher = (phrase, ref) => {
  const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(phrase)
  if (!match) return null
  const month = Number(match[1]) - 1
  const day = Number(match[2])
  if (month < 0 || month > 11) return null

  let year: number
  if (match[3]) {
    year = Number(match[3])
    if (year < 100) year += 2000
  } else {
    year = upcomingYear(month, day, ref)
  }
  return calendarDay(year, month, day)
}

const matchMonthName: Matcher = (phrase, ref) => {
  // "jun 12", "june 12 2026", "12 jun", "12 june 2026" (optional comma)
  const monthFirst = /^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(phrase)
  const dayFirst = /^(\d{1,2})\s+([a-z]+)(?:,?\s+(\d{4}))?$/.exec(phrase)

  let monthName: string | undefined
  let day: number | undefined
  let yearText: string | undefined
  if (monthFirst) {
    monthName = monthFirst[1]
    day = Number(monthFirst[2])
    yearText = monthFirst[3]
  } else if (dayFirst) {
    monthName = dayFirst[2]
    day = Number(dayFirst[1])
    yearText = dayFirst[3]
  } else {
    return null
  }

  const month = MONTHS[monthName]
  if (month === undefined || day === undefined) return null
  const year = yearText ? Number(yearText) : upcomingYear(month, day, ref)
  return calendarDay(year, month, day)
}

const MATCHERS: Matcher[] = [
  matchKeyword,
  matchWeekday,
  matchRelative,
  matchIso,
  matchNumeric,
  matchMonthName
]

/** Normalize whitespace and case; strip a trailing/leading "due"/"by"/"on". */
function normalize(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^(due|by|due by|on)\s+/, '')
    .trim()
}

/** Parse the whole input as a date phrase. Returns null when it isn't one. */
export function parseDueDate(input: string, now = Date.now()): DueDateParse | null {
  const phrase = normalize(input)
  if (!phrase) return null
  const ref = refFrom(now)
  for (const matcher of MATCHERS) {
    const ms = matcher(phrase, ref)
    if (ms != null) return { ms, iso: dueDateMsToIso(ms) }
  }
  return null
}

export interface TrailingDueDate extends DueDateParse {
  /** Start index of the matched phrase in the original text. */
  start: number
  /** End index (exclusive) of the matched phrase. */
  end: number
  /** The matched substring. */
  text: string
}

/**
 * Detect a date phrase at the END of `text` (the last up-to-4 words), longest
 * match wins. Trailing-only by design: a date mid-sentence ("split 2/3 of the
 * work") is ignored, which kills most false positives. The caller surfaces the
 * result as a confirm-to-commit suggestion — it is never auto-applied.
 */
export function detectTrailingDueDate(text: string, now = Date.now()): TrailingDueDate | null {
  const trimmedEnd = text.replace(/\s+$/, '').length
  if (trimmedEnd === 0) return null

  const words = [...text.slice(0, trimmedEnd).matchAll(/\S+/g)]
  // Try the longest trailing candidate first (up to 4 words).
  for (let i = Math.max(0, words.length - 4); i < words.length; i += 1) {
    const start = words[i].index ?? 0
    const candidate = text.slice(start, trimmedEnd)
    const parsed = parseDueDate(candidate, now)
    if (parsed) return { ...parsed, start, end: trimmedEnd, text: candidate }
  }
  return null
}
