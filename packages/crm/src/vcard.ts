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
  const rawName = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const name = rawName.split(';')[0].toUpperCase()
  return { name, value }
}

/**
 * Parse a vCard document into contacts. Handles multiple cards, RFC line
 * folding (continuation lines start with a space/tab), and the common
 * properties. Cards without an `FN` fall back to a name built from `N`.
 */
export function parseVCard(text: string): VCardContact[] {
  // Unfold: a leading space/tab continues the previous line.
  const unfolded: string[] = []
  for (const raw of text.split(/\r\n|\r|\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += raw.slice(1)
    } else {
      unfolded.push(raw)
    }
  }

  const contacts: VCardContact[] = []
  let current: Partial<VCardContact> | null = null
  for (const line of unfolded) {
    const trimmed = line.trim()
    if (trimmed.toUpperCase() === 'BEGIN:VCARD') {
      current = {}
      continue
    }
    if (trimmed.toUpperCase() === 'END:VCARD') {
      if (current) {
        const name =
          current.displayName ||
          [current.firstName, current.lastName].filter(Boolean).join(' ').trim()
        if (name) contacts.push({ ...current, displayName: name } as VCardContact)
      }
      current = null
      continue
    }
    if (!current) continue
    const parsed = splitLine(line)
    if (!parsed) continue
    const { name, value } = parsed
    switch (name) {
      case 'FN':
        current.displayName = unescape(value)
        break
      case 'N': {
        const [last, first] = value.split(';').map(unescape)
        if (last) current.lastName = last
        if (first) current.firstName = first
        break
      }
      case 'ORG':
        current.org = unescape(value.split(';')[0])
        break
      case 'TITLE':
        current.title = unescape(value)
        break
      case 'EMAIL':
        if (!current.email) current.email = unescape(value).trim()
        break
      case 'TEL':
        if (!current.phone) current.phone = unescape(value).trim()
        break
      case 'BDAY':
        current.birthday = value.trim()
        break
      case 'NOTE':
        current.note = unescape(value)
        break
      default:
        break
    }
  }
  return contacts
}
