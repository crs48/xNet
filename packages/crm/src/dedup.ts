/**
 * Contact deduplication — blocking + similarity scoring. The standard
 * record-linkage shape: cheaply group candidates by a blocking key (email
 * domain or a phonetic-ish name key) to avoid the O(n²) all-pairs comparison,
 * then score within blocks. Pure and dependency-free; the merge UI and the
 * emission of `SocialIdentityClaim` edges live elsewhere.
 */

export interface DedupContact {
  id: string
  displayName?: string | null
  email?: string | null
  phone?: string | null
}

/** Lowercase + trim an email; `null` when empty. */
export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null
  const s = value.trim().toLowerCase()
  return s || null
}

/** Strip an email to its domain, for blocking. */
export function emailDomain(value: string | null | undefined): string | null {
  const email = normalizeEmail(value)
  const at = email?.lastIndexOf('@') ?? -1
  return at > 0 ? (email as string).slice(at + 1) : null
}

/** Reduce a phone to comparable digits (keeping a leading `+`); `null` when empty. */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const plus = trimmed.startsWith('+') ? '+' : ''
  const digits = trimmed.replace(/\D/g, '')
  return digits ? plus + digits : null
}

/** Jaro similarity in [0, 1]. */
export function jaro(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 0 || b.length === 0) return 0
  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aMatches = new Array<boolean>(a.length).fill(false)
  const bMatches = new Array<boolean>(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance)
    const end = Math.min(i + matchDistance + 1, b.length)
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue
      aMatches[i] = true
      bMatches[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0
  let transpositions = 0
  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue
    while (!bMatches[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }
  transpositions /= 2
  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3
}

/** Jaro-Winkler similarity in [0, 1] — boosts a shared prefix (good for names). */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const j = jaro(a, b)
  let prefix = 0
  const max = Math.min(4, a.length, b.length)
  while (prefix < max && a[prefix] === b[prefix]) prefix++
  return j + prefix * prefixScale * (1 - j)
}

const normName = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()

/** Name similarity via Jaro-Winkler on normalized names. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normName(a)
  const nb = normName(b)
  if (!na || !nb) return 0
  return jaroWinkler(na, nb)
}

/** A coarse blocking key — email domain if present, else the last name token. */
export function blockingKey(c: DedupContact): string {
  const domain = emailDomain(c.email)
  if (domain) return `d:${domain}`
  const tokens = normName(c.displayName).split(' ').filter(Boolean)
  const last = tokens[tokens.length - 1]
  return last ? `n:${last.slice(0, 4)}` : 'n:?'
}

export interface MatchResult {
  score: number
  reasons: string[]
}

/**
 * Similarity of two contacts in [0, 1]. Exact email or exact phone is decisive
 * (≥0.95); otherwise name similarity carries it, nudged up by a domain match.
 */
export function matchScore(a: DedupContact, b: DedupContact): MatchResult {
  const reasons: string[] = []
  const emailA = normalizeEmail(a.email)
  const emailB = normalizeEmail(b.email)
  if (emailA && emailB && emailA === emailB) {
    reasons.push('same email')
    return { score: 1, reasons }
  }
  const phoneA = normalizePhone(a.phone)
  const phoneB = normalizePhone(b.phone)
  if (phoneA && phoneB && phoneA === phoneB) {
    reasons.push('same phone')
    return { score: 0.95, reasons }
  }
  let score = nameSimilarity(a.displayName, b.displayName)
  if (score > 0) reasons.push(`name ${score.toFixed(2)}`)
  const domA = emailDomain(a.email)
  const domB = emailDomain(b.email)
  if (domA && domB && domA === domB) {
    reasons.push('same domain')
    score = Math.min(1, score + 0.05)
  }
  return { score, reasons }
}

export interface DuplicateCandidate {
  a: string
  b: string
  score: number
  reasons: string[]
}

/**
 * Find probable duplicate pairs at or above `threshold`. Blocks first (so the
 * comparison is near-linear in practice), then scores within each block.
 * Results are sorted most-confident first.
 */
export function findDuplicateCandidates(
  contacts: DedupContact[],
  threshold = 0.82
): DuplicateCandidate[] {
  const blocks = new Map<string, DedupContact[]>()
  for (const c of contacts) {
    const key = blockingKey(c)
    const bucket = blocks.get(key)
    if (bucket) bucket.push(c)
    else blocks.set(key, [c])
  }
  const out: DuplicateCandidate[] = []
  for (const bucket of blocks.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const { score, reasons } = matchScore(bucket[i], bucket[j])
        if (score >= threshold) {
          out.push({ a: bucket[i].id, b: bucket[j].id, score, reasons })
        }
      }
    }
  }
  return out.sort((x, y) => y.score - x.score)
}
