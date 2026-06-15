/**
 * Import de-duplication and reconciliation matching (exploration 0187).
 *
 * Re-importing the same statement must not create duplicate transactions. We
 * prefer a stable provider id when present; otherwise we fingerprint on the
 * triple (calendar day, signed amount, normalized payee). Matching also powers
 * reconciliation: line up imported/synced rows against entries already in the
 * book.
 */

/** A normalized row coming from a CSV/OFX/QIF parse or a bank-sync provider. */
export interface ImportedRow {
  /** Stable provider/file id, if the source supplies one. Best dedupe key. */
  externalId?: string
  /** Unix ms. */
  date: number
  /** Signed minor units on the imported (bank/asset) account; + = money in. */
  amount: number
  currency: string
  payee?: string
  memo?: string
}

/** A book entry projected for matching: amount is on the reconciled account. */
export interface ExistingEntry {
  id: string
  externalId?: string
  date: number
  amount: number
  currency: string
  payee?: string
}

const DAY_MS = 86_400_000

/** Normalize a payee for fuzzy equality: lowercase, collapse non-alphanumerics. */
export function normalizePayee(payee: string | undefined): string {
  return (payee ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Stable fingerprint for dedupe when no externalId exists. */
export function fingerprint(row: {
  date: number
  amount: number
  currency: string
  payee?: string
}): string {
  const day = Math.floor(row.date / DAY_MS)
  return `${day}|${row.amount}|${row.currency}|${normalizePayee(row.payee)}`
}

export interface DedupeResult {
  /** Rows not already present — safe to import. */
  fresh: ImportedRow[]
  /** Rows that matched an existing entry — skipped. */
  duplicates: ImportedRow[]
}

/**
 * Partition incoming rows into fresh vs duplicate against existing entries.
 * Matches by externalId first, then by fingerprint. Also de-dupes incoming rows
 * against each other so a doubled file row imports once.
 */
export function dedupeRows(
  incoming: readonly ImportedRow[],
  existing: readonly ExistingEntry[]
): DedupeResult {
  const seenIds = new Set<string>()
  const seenFp = new Set<string>()
  for (const e of existing) {
    if (e.externalId) seenIds.add(e.externalId)
    seenFp.add(fingerprint(e))
  }
  const fresh: ImportedRow[] = []
  const duplicates: ImportedRow[] = []
  for (const row of incoming) {
    const fp = fingerprint(row)
    const isDup =
      (row.externalId !== undefined && seenIds.has(row.externalId)) ||
      (row.externalId === undefined && seenFp.has(fp))
    if (isDup) {
      duplicates.push(row)
      continue
    }
    fresh.push(row)
    if (row.externalId) seenIds.add(row.externalId)
    seenFp.add(fp)
  }
  return { fresh, duplicates }
}

export interface MatchCandidate {
  entry: ExistingEntry
  /** Days between the row and the candidate (absolute). */
  dayGap: number
  /** True when payees normalize equal. */
  payeeMatch: boolean
}

/**
 * Reconciliation candidates for one imported row: existing entries with the
 * exact same signed amount + currency within `windowDays`, best (closest date,
 * payee match) first. Empty ⇒ a genuinely new transaction to create.
 */
export function matchCandidates(
  row: ImportedRow,
  existing: readonly ExistingEntry[],
  windowDays = 4
): MatchCandidate[] {
  const rowPayee = normalizePayee(row.payee)
  const candidates: MatchCandidate[] = []
  for (const entry of existing) {
    if (entry.amount !== row.amount || entry.currency !== row.currency) continue
    const dayGap = Math.abs(Math.round((entry.date - row.date) / DAY_MS))
    if (dayGap > windowDays) continue
    candidates.push({
      entry,
      dayGap,
      payeeMatch: rowPayee !== '' && normalizePayee(entry.payee) === rowPayee
    })
  }
  return candidates.sort((a, b) => {
    if (a.payeeMatch !== b.payeeMatch) return a.payeeMatch ? -1 : 1
    return a.dayGap - b.dayGap
  })
}
