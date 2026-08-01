#!/usr/bin/env node
/**
 * Ratchet the exploration backlog (exploration 0421).
 *
 * xNet's build loop is already fast — median PR cycle time under an hour, CI at
 * eight minutes. What has no clock at all is *deciding what to build*: 259
 * explorations sit at `[_]`, the backlog grows ~85 documents a month, and
 * nothing ever closes one. A document written in February and never started is
 * indistinguishable from one written yesterday.
 *
 * This gives the backlog the two things every fast project on Collison's list
 * had and this one lacks: a decider and an expiry.
 *
 *   review:  <YYYY-MM-DD>   when to RE-DECIDE — not when to ship
 *   decider: <name>         who closes it; a single name, never a list
 *
 * Absent `review:`, a document is due 90 days after it first appeared. 90 is
 * measured, not guessed: it marks 41 of 276 undecided documents stale (15%),
 * where 180 marks *zero* today and ~200 in three months as the June/July bulge
 * crosses at once. A gate that cannot fire is not lenient, it is absent.
 *
 * Expiry never moves, renames or deletes anything. Status in the *filename* is
 * a proven link-rot generator (see check-exploration-links.mjs); `review:` and
 * `status: withdrawn` live in frontmatter precisely because changing them
 * renames nothing. Withdrawing is a legitimate, encouraged outcome — recording
 * that a decision was *made* is the point.
 *
 * Named consumer: `docs/explorations/STALE.md`, which `/mvp-followup` reads to
 * answer "what's next" — today it has no principled way to choose among 259
 * identical-looking candidates.
 *
 * Pass condition: the stale count must not EXCEED the committed baseline in
 * `.fallow-baseline.json`. A ratchet, never an absolute — per AGENTS.md, and
 * per fallow.yml's own postmortem, where gating the absolute made every Monday
 * a guaranteed red nobody consumed.
 *
 * Run: `node scripts/check-exploration-fallow.mjs` (or `pnpm check:exploration-fallow`).
 *      `--write-baseline` reseeds the baseline to today's count.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const DIR = join(root, 'docs/explorations')
const BASELINE = join(DIR, '.fallow-baseline.json')
const STALE_INDEX = join(DIR, 'STALE.md')
const DEFAULT_WINDOW_DAYS = 90
const DAY_MS = 86_400_000

const writeBaseline = process.argv.includes('--write-baseline')

/**
 * Git hooks export GIT_DIR / GIT_WORK_TREE, which hijack any `git` subprocess
 * started underneath them and silently point it at the wrong tree — a worktree
 * hazard this repo has already been bitten by (exploration 0413).
 */
function git(args) {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k]
  return execFileSync('git', args, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
}

/**
 * How little date coverage makes this check vacuous rather than merely partial.
 *
 * `git rev-parse --is-shallow-repository` looked like the guard to use and is
 * the wrong one: this repo reports shallow (there is a `.git/shallow` graft)
 * while still holding all 4,984 commits back to January, so the proxy fails a
 * checkout that can answer the question perfectly well. What the script
 * actually needs is dates for the documents it judges — so measure that, below,
 * and treat undated documents as their own reported category. A document whose
 * age is *unreadable* must never be silently folded in with one that is *not
 * yet due* (AGENTS.md).
 */
const MIN_DATE_COVERAGE = 0.5

/**
 * Earliest ADD timestamp per exploration number, in epoch ms, from one
 * `git log` pass. `match` selects which filenames count.
 *
 * Identity is the 4-digit number, not the filename: checking a doc off renames
 * it, so filename identity would reset the clock on every status change — the
 * one event that most reliably means work IS happening.
 */
function addedByNumber({ noRenames, match }) {
  const out = git([
    'log',
    ...(noRenames ? ['--no-renames'] : []),
    '--diff-filter=A',
    '--format=@%ct',
    '--name-only',
    '--',
    'docs/explorations/'
  ])
  const seen = new Map()
  let ts = null
  for (const line of out.split('\n')) {
    if (line.startsWith('@')) {
      ts = Number(line.slice(1)) * 1000
      continue
    }
    const m = match.exec(line)
    if (!m || ts === null) continue
    const prev = seen.get(m[1])
    if (prev === undefined || ts < prev) seen.set(m[1], ts)
  }
  return seen
}

/**
 * When each exploration first appeared. Rename detection stays ON (git's
 * default) so only TRUE adds count: a document whose birth predates this
 * checkout's history must stay undated rather than acquire the date of a later
 * status flip, which would be younger than the truth and silently wrong.
 *
 * This drives staleness, and its behaviour is deliberately unchanged.
 */
const firstSeenByNumber = () =>
  addedByNumber({ noRenames: false, match: /explorations\/(\d{4})_\[.\]_/ })

/**
 * Births and check-offs for the retirement curve — both with `--no-renames`.
 *
 * That flag is load-bearing twice over.
 *
 * For check-offs it is the difference between a measurement and nothing: a
 * status flip IS a rename, so under default detection the arrival of the `[x]`
 * filename is recorded as R, not A. Detection ON finds 6 check-offs where OFF
 * finds 195 — a 97% undercount that still looks like data.
 *
 * For births it removes a bias that points the wrong way. Detection ON drops
 * the original add of any document later absorbed into a rename chain, and the
 * documents that get renamed are exactly the ones that get CHECKED OFF: 51 of
 * the 195 shipped documents have no birth date under ON. Measuring retirement
 * against a birth map that preferentially forgets the retirements would report
 * the backlog as more hopeless than it is.
 *
 * These stay separate from `firstSeenByNumber()` rather than replacing it,
 * because turning detection off there hands a (too-late) birth date to every
 * previously-undated document and moves the stale count — measured, 41 → 75.
 * The curve is a display; a display must not move the pass condition.
 */
const curveHistory = () => ({
  born: addedByNumber({ noRenames: true, match: /explorations\/(\d{4})_\[.\]_/ }),
  done: addedByNumber({ noRenames: true, match: /explorations\/(\d{4})_\[x\]_/ })
})

/** Day thresholds the retirement curve is sampled at. */
const SURVIVAL_BUCKETS = [1, 7, 14, 30, 60, 90, 120]

/**
 * The retirement curve for the backlog (exploration 0424, after Bouk's account
 * of Winfrey's industrial type curves).
 *
 * Decay is only manageable once it has a shape. Measured today: every one of
 * the 195 check-offs happened within 30 days, 96% of them within a single day,
 * and the unshipped share never falls — 54% at day 1, 55% at day 120. So an old
 * `[_]` is not a decision pending, it is a decision already made by inaction.
 * Publishing the curve is what lets a reader of this index attach a prior to an
 * age instead of guessing at one.
 *
 * Right-censoring matters: a document written yesterday cannot have "failed" to
 * ship within 30 days, so each bucket only counts documents old enough to have
 * had the chance. Without that the recent bulge would drag every bucket down and
 * the curve would report despair instead of a hazard rate.
 */
function survivalTable(born, done, nowMs) {
  const docs = [...born.entries()].map(([number, bornAt]) => ({
    ageDays: Math.floor((nowMs - bornAt) / DAY_MS),
    lagDays: done.has(number) ? Math.floor((done.get(number) - bornAt) / DAY_MS) : null
  }))

  return SURVIVAL_BUCKETS.map((day) => {
    const cohort = docs.filter((d) => d.ageDays >= day)
    const shipped = cohort.filter((d) => d.lagDays !== null && d.lagDays <= day)
    return {
      day,
      n: cohort.length,
      openPct:
        cohort.length === 0
          ? null
          : Math.round((100 * (cohort.length - shipped.length)) / cohort.length)
    }
  })
}

/**
 * The leading `---` frontmatter block, or '' when a document has none (most of
 * the older corpus does not).
 *
 * Scoping to this block is load-bearing, not tidiness. A whole-file scan reads
 * any line-initial `status:` — including the ones inside the YAML examples in
 * exploration 0421, which documents this very mechanism and would therefore
 * have reported *itself* as withdrawn.
 */
const frontmatter = (src) => {
  if (!src.startsWith('---\n')) return ''
  const end = src.indexOf('\n---', 4)
  return end === -1 ? '' : src.slice(4, end)
}

/** A frontmatter scalar, or null. Absent is not an error — it means "default". */
const field = (fm, key) => {
  const m = new RegExp(`^${key}:[ \\t]*(\\S+)`, 'm').exec(fm)
  return m ? m[1].replace(/^["']|["']$/g, '') : null
}

const firstSeen = firstSeenByNumber()
const curve = curveHistory()
const now = Date.now()
const stale = []
const undated = []
let considered = 0

for (const file of readdirSync(DIR).sort()) {
  const m = /^(\d{4})_\[(.)\]_.*\.md$/.exec(file)
  if (!m) continue
  const [, number, status] = m
  if (status === 'x') continue // built; nothing left to decide

  const fm = frontmatter(readFileSync(join(DIR, file), 'utf8'))
  if (field(fm, 'status') === 'withdrawn') continue // decided against, on purpose

  considered++
  const review = field(fm, 'review')
  const born = firstSeen.get(number)
  let due
  if (review && /^\d{4}-\d{2}-\d{2}$/.test(review)) {
    due = Date.parse(`${review}T00:00:00Z`)
  } else if (born !== undefined) {
    due = born + DEFAULT_WINDOW_DAYS * DAY_MS
  } else {
    // No creation date and no explicit review date. NOT "not yet due" — its age
    // is simply unknown, and the two must stay distinguishable. Reported, never
    // counted as stale, and fixable by giving the document a `review:` date.
    undated.push({ file, number })
    continue
  }

  if (now > due) {
    stale.push({
      file,
      number,
      status,
      due: new Date(due).toISOString().slice(0, 10),
      explicit: Boolean(review),
      decider: field(fm, 'decider'),
      days: Math.floor((now - due) / DAY_MS)
    })
  }
}

// Deterministic order: the index must be byte-identical on unchanged input, or
// it churns the diff on every run and nobody reads it.
stale.sort((a, b) => a.file.localeCompare(b.file))
undated.sort((a, b) => a.file.localeCompare(b.file))

const coverage = considered === 0 ? 1 : (considered - undated.length) / considered
if (coverage < MIN_DATE_COVERAGE) {
  console.error(
    `✗ creation dates unavailable for ${undated.length} of ${considered} explorations ` +
      `(${Math.round(coverage * 100)}% coverage).\n` +
      '  Below this the result is vacuous — nearly everything would look new and\n' +
      '  the check would pass without checking anything.\n' +
      '  → set `fetch-depth: 0` on the job running this script.'
  )
  process.exit(1)
}

const survival = survivalTable(curve.born, curve.done, now)

/**
 * The curve's endpoints, which are the whole finding: it does not fall.
 *
 * An earlier version reported "flattens around day N" by scanning for the first
 * bucket every later one sits within 5 points of. On this data that answers
 * "day 1" — technically true, and misleading, because it implies a burn-down
 * that then plateaus. There is no burn-down. Stating both endpoints says the
 * same thing without inventing a threshold to say it.
 */
const measured = survival.filter((row) => row.openPct !== null)
const shape =
  measured.length >= 2
    ? {
        first: measured[0].openPct,
        last: measured[measured.length - 1].openPct,
        lastDay: measured[measured.length - 1].day
      }
    : null

const index = [
  '<!-- Generated by scripts/check-exploration-fallow.mjs — do not edit by hand. -->',
  '',
  '# Stale explorations',
  '',
  'Explorations past their `review:` date (or 90 days old with none). Being',
  'listed here is not a failure — it means the claim this document makes on',
  'future attention has lapsed and needs renewing or releasing.',
  '',
  'Two fixes, both one-line frontmatter edits. Neither renames the file, so',
  'neither breaks an inbound reference:',
  '',
  '```yaml',
  'review: 2027-02-01 # renew the claim',
  'status: withdrawn # release it; the document stays exactly where it is',
  '```',
  '',
  `**${stale.length}** stale of ${considered} undecided.`,
  '',
  '## How this backlog retires',
  '',
  'Measured from git history, not assumed (exploration 0424). Each row counts',
  'only documents old enough to have had that many days, so a recent bulge',
  'cannot drag the curve down.',
  '',
  '| Days since written | Cohort | Still unshipped |',
  '| --- | --- | --- |',
  ...survival
    .filter((row) => row.openPct !== null)
    .map((row) => `| ${row.day} | ${row.n} | ${row.openPct}% |`),
  '',
  ...(shape
    ? [
        `The curve does not fall: ${shape.first}% of documents at least a day old are`,
        `unshipped, and ${shape.last}% at ${shape.lastDay} days. An exploration is checked off`,
        'within days of being written, or never — so an old `[_]` is not a pending',
        'decision, it is a decision already made by inaction. Renew it deliberately,',
        'or withdraw it; both are one line and neither renames the file.',
        ''
      ]
    : []),
  '## Past review date',
  '',
  '| Exploration | Due | Overdue | Decider |',
  '| --- | --- | --- | --- |',
  ...stale.map(
    (s) =>
      `| [${s.file}](${encodeURI(s.file)}) | ${s.due}${s.explicit ? '' : ' *(default)*'} | ${s.days}d | ${s.decider ?? '—'} |`
  ),
  '',
  ...(undated.length > 0
    ? [
        '## Undated',
        '',
        `${undated.length} exploration(s) predate this checkout's history and carry no`,
        '`review:` date, so their age is unknown. They are **not** counted as stale —',
        'unknown age and not-yet-due are different facts. Give one a `review:` date to',
        'move it out of this list.',
        '',
        ...undated.map((u) => `- [${u.file}](${encodeURI(u.file)})`),
        ''
      ]
    : [])
].join('\n')

writeFileSync(STALE_INDEX, index)

if (writeBaseline) {
  writeFileSync(BASELINE, `${JSON.stringify({ count: stale.length }, null, 2)}\n`)
  console.log(`✓ baseline seeded at ${stale.length}`)
  process.exit(0)
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).count : 0

// Printed on green runs too: the number should be familiar long before it is
// ever binding (0283 — a gate whose first appearance is a failure gets ignored).
console.log(`explorations past review date: ${stale.length} (baseline ${baseline})`)

if (stale.length > baseline) {
  // Least-overdue first: whatever just crossed the line is what this change
  // most likely introduced, and it is buried if the list is alphabetical.
  const newest = [...stale].sort((a, b) => a.days - b.days)
  console.error(
    `\n✗ stale explorations increased: ${stale.length} > ${baseline}\n\n` +
      '  Most recently gone stale — start here:\n' +
      newest
        .slice(0, 10)
        .map((s) => `    ${s.file}  (${s.days}d overdue${s.decider ? `, ${s.decider}` : ''})`)
        .join('\n') +
      (stale.length > 10 ? `\n    … and ${stale.length - 10} more` : '') +
      '\n\n  Both fixes are one-line frontmatter edits — no rename, so no\n' +
      '  inbound reference breaks:\n' +
      '    review: 2027-02-01     # renew the claim\n' +
      '    status: withdrawn      # release it; the document stays put\n\n' +
      `  Full list: docs/explorations/STALE.md\n`
  )
  process.exit(1)
}

console.log(`✓ exploration backlog OK (${considered} undecided, ${stale.length} stale)`)
process.exit(0)
