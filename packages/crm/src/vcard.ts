/**
 * vCard import/export — the lowest-common-denominator portability format for
 * contacts (RFC 6350 / 6352, the format iCloud, Google Contacts and Fastmail
 * speak). Enough of vCard 3.0 to round-trip the fields a CRM Contact cares
 * about; deliberately tolerant on parse, deterministic on serialize.
 */

export interface VCardContact {
  displayName: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  org?: string
  title?: string
  note?: string
  /** Birthday as "YYYY-MM-DD" when present. */
  birthday?: string
}

const escape = (v: string): string =>
  v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')

const unescape = (v: string): string =>
  v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')

/** Serialize one contact to a vCard 3.0 string. */
export function toVCard(c: VCardContact): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escape(c.displayName)}`]
  if (c.lastName || c.firstName) {
    lines.push(`N:${escape(c.lastName ?? '')};${escape(c.firstName ?? '')};;;`)
  }
  if (c.org) lines.push(`ORG:${escape(c.org)}`)
  if (c.title) lines.push(`TITLE:${escape(c.title)}`)
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${escape(c.email)}`)
  if (c.phone) lines.push(`TEL:${escape(c.phone)}`)
  if (c.birthday) lines.push(`BDAY:${c.birthday}`)
  if (c.note) lines.push(`NOTE:${escape(c.note)}`)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

/** Serialize many contacts into one vCard document. */
export function toVCards(contacts: VCardContact[]): string {
  return contacts.map(toVCard).join('\r\n')
}

/** Split a property line into its name (sans params) and raw value. */
function splitLine(line: string): { name: string; value: string } | null {
  const colon = line.indexOf(':')
  if (colon < 0) return null
  const name = line.slice(0, colon).split(';')[0].toUpperCase()
  return { name, value: line.slice(colon + 1) }
}

/**
 * Per-property field setters — a dispatch table keeps `parseVCard` flat (one
 * lookup instead of a long switch). The first value wins for EMAIL/TEL.
 */
const FIELD_SETTERS: Record<string, (c: Partial<VCardContact>, value: string) => void> = {
  FN: (c, v) => {
    c.displayName = unescape(v)
  },
  N: (c, v) => {
    const [last, first] = v.split(';').map(unescape)
    if (last) c.lastName = last
    if (first) c.firstName = first
  },
  ORG: (c, v) => {
    c.org = unescape(v.split(';')[0])
  },
  TITLE: (c, v) => {
    c.title = unescape(v)
  },
  EMAIL: (c, v) => {
    c.email ??= unescape(v).trim()
  },
  TEL: (c, v) => {
    c.phone ??= unescape(v).trim()
  },
  BDAY: (c, v) => {
    c.birthday = v.trim()
  },
  NOTE: (c, v) => {
    c.note = unescape(v)
  }
}

/** Unfold RFC-6350 line folding: a leading space/tab continues the prior line. */
function unfoldLines(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const isContinuation = raw.startsWith(' ') || raw.startsWith('\t')
    if (isContinuation && out.length > 0) out[out.length - 1] += raw.slice(1)
    else out.push(raw)
  }
  return out
}

/** Finalize a card: fill `displayName` from `N` when `FN` was absent. */
function finalizeCard(card: Partial<VCardContact>): VCardContact | null {
  const name =
    card.displayName || [card.firstName, card.lastName].filter(Boolean).join(' ').trim()
  return name ? ({ ...card, displayName: name } as VCardContact) : null
}

/**
 * Parse a vCard document into contacts. Handles multiple cards, line folding,
 * and the common properties. Cards without an `FN` fall back to a name from `N`.
 */
export function parseVCard(text: string): VCardContact[] {
  const contacts: VCardContact[] = []
  let current: Partial<VCardContact> | null = null
  for (const line of unfoldLines(text)) {
    const upper = line.trim().toUpperCase()
    if (upper === 'BEGIN:VCARD') {
      current = {}
    } else if (upper === 'END:VCARD') {
      const card = current && finalizeCard(current)
      if (card) contacts.push(card)
      current = null
    } else if (current) {
      const parsed = splitLine(line)
      parsed && FIELD_SETTERS[parsed.name]?.(current, parsed.value)
    }
  }
  return contacts
}
