#!/usr/bin/env node
/**
 * The footprint ratchet — Charter §7 "Floor" (exploration 0434).
 *
 * Software is how working computers become waste: manufacturing is ~70-90% of a
 * device's lifetime emissions, so the harm an app does is mostly the harm of
 * making a working machine feel broken. §7 answers that with a *floor* rather
 * than a carbon claim — a declared oldest-supported machine, and a gate that
 * fails a change which raises what the app costs to run there.
 *
 * Two metric kinds, because a cloud runner is not a 2017 laptop:
 *
 *   ci      measured on every run from `apps/web/dist`. Ratcheted against the
 *           committed baseline. This is the real receipt.
 *   manual  cold-open and peak RSS *on the floor device itself*, which no
 *           runner can measure. Recorded by hand with a `measuredAt` date; the
 *           gate checks presence and staleness, never invents the number. A
 *           metric still awaiting its first hand measurement is `pending` — a
 *           disclosed gap, in the same shape the claims ledger uses, so the
 *           weaker receipt is labelled rather than dressed up as the stronger.
 *
 * Ratchet, never an absolute: `AGENTS.md` — "ratchet against a committed
 * baseline instead of gating absolutes". There is no principled absolute number
 * of bytes, and a gate that cannot go green teaches everyone to ignore red.
 *
 * Absent is not a pass. A metric the gate can no longer measure reports
 * `unmeasured` and fails, because a measurement that silently stopped working
 * looks exactly like a lean app — the negative-control lesson from 0430, and
 * `AGENTS.md`'s rule that "absent" and "unreadable" must be different values.
 *
 * Named consumer: the `typecheck` job in ci.yml. It runs there rather than in
 * `lint` for the same reason `check:api-report` does — it reads build output,
 * and `lint` is deliberately build-free (exploration 0193).
 * Pass condition: no `ci` metric exceeds baseline x (1 + tolerance), no metric
 * is unmeasured, no `manual` metric is past its staleness window.
 *
 *   node scripts/check-footprint-budget.mjs             # the real scan
 *   node scripts/check-footprint-budget.mjs --selftest  # proof it can go red
 *   node scripts/check-footprint-budget.mjs --update    # accept a new baseline
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const BASELINE_PATH = join(root, 'footprint-baseline.json')
const WEB_DIST = join(root, 'apps', 'web', 'dist')

/**
 * Metric definitions. `tolerance` is the headroom a change may take without
 * being called a regression; `why` is printed on failure so the message argues
 * from the commitment rather than from a number.
 *
 * @type {{ id: string, kind: 'ci' | 'manual', unit: string, tolerance: number, why: string }[]}
 */
const METRICS = [
  {
    id: 'web.initial-bytes-gzip',
    kind: 'ci',
    unit: 'bytes (gzip, first load)',
    tolerance: 0.03,
    why: 'first load is what a slow connection pays before anything is usable'
  },
  {
    id: 'floor.cold-open-ms',
    kind: 'manual',
    unit: 'ms on the declared floor device',
    tolerance: 0.1,
    why: 'the floor device is the commitment; a regression here retires hardware'
  },
  {
    id: 'floor.peak-rss-mb',
    kind: 'manual',
    unit: 'MB resident, steady state',
    tolerance: 0.05,
    why: '8 GB machines are the floor — headroom is the whole promise'
  }
]

/**
 * How long a hand-recorded measurement stays trustworthy. The floor is measured
 * quarterly (Charter §7), and this allows a full extra quarter of slack: a late
 * measurement should nag the decider, not block an unrelated PR mid-sprint.
 */
const MANUAL_MAX_AGE_DAYS = 180

// ─── Measurement ──────────────────────────────────────────────────────────────

/** Assets index.html makes the browser fetch before anything renders. */
const INITIAL_ASSET_RE =
  /(?:<script[^>]+src="([^"]+)")|(?:<link[^>]+rel="(?:modulepreload|stylesheet)"[^>]+href="([^"]+)")/g

/**
 * Gzipped bytes of the critical path: index.html plus every script,
 * modulepreload and stylesheet it references. Lazy chunks are deliberately
 * excluded — the floor cares what a cold visit costs, not what the app weighs
 * in total. Filenames are content-hashed, so this parses rather than hardcodes.
 *
 * Returns `null` when the build output is absent, so the caller can report
 * `unmeasured` instead of a plausible-looking zero.
 *
 * @returns {number | null}
 */
export function measureInitialBytes(distDir) {
  const indexPath = join(distDir, 'index.html')
  if (!existsSync(indexPath)) return null

  const html = readFileSync(indexPath)
  let total = gzipSync(html).length

  for (const match of html.toString('utf8').matchAll(INITIAL_ASSET_RE)) {
    const href = match[1] ?? match[2]
    if (!href || !href.startsWith('/')) continue
    const assetPath = join(distDir, href.slice(1))
    // A referenced asset that isn't on disk means the build shape changed under
    // us. Fail the whole measurement rather than quietly undercounting.
    if (!existsSync(assetPath)) return null
    total += gzipSync(readFileSync(assetPath)).length
  }

  return total
}

/** Collect every `ci` metric. Absent measurements stay absent — never zero. */
export function collectCiMetrics(distDir = WEB_DIST) {
  /** @type {Record<string, number>} */
  const measured = {}
  const initialBytes = measureInitialBytes(distDir)
  if (initialBytes !== null) measured['web.initial-bytes-gzip'] = initialBytes
  return measured
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

function ageInDays(iso, now) {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  return (now - then) / 86_400_000
}

/**
 * Compare a baseline against fresh measurements.
 *
 * Pure — no I/O — so --selftest can exercise it directly with planted data,
 * keeping the control fixtures in memory rather than on disk (`AGENTS.md`: a
 * control must never be able to leak into the production scan).
 *
 * @returns {{ id: string, kind: string, detail?: string, before?: number, now?: number, why?: string }[]}
 */
export function evaluate(baseline, measured, now = Date.now()) {
  const failures = []

  for (const metric of METRICS) {
    const entry = baseline.metrics?.[metric.id]

    if (!entry) {
      failures.push({
        id: metric.id,
        kind: 'undeclared',
        detail: 'no baseline entry — add one or delete the metric definition'
      })
      continue
    }

    if (metric.kind === 'manual') {
      // A metric awaiting its first hand measurement is a disclosed gap, not a
      // silent pass and not a fake number. It says so out loud every run.
      if (entry.status === 'pending') continue

      if (typeof entry.value !== 'number') {
        failures.push({
          id: metric.id,
          kind: 'unmeasured',
          detail: 'manual metric has no value and is not marked pending'
        })
        continue
      }
      const age = ageInDays(entry.measuredAt, now)
      if (age === null) {
        failures.push({
          id: metric.id,
          kind: 'unmeasured',
          detail: `measuredAt is missing or unparseable: ${String(entry.measuredAt)}`
        })
      } else if (age > MANUAL_MAX_AGE_DAYS) {
        failures.push({
          id: metric.id,
          kind: 'stale',
          detail: `last measured ${Math.round(age)} days ago (max ${MANUAL_MAX_AGE_DAYS})`,
          why: metric.why
        })
      }
      continue
    }

    // `ci` metrics are re-measured every run. A missing measurement is a broken
    // gate, not a clean tree — this is the branch that must never return green.
    const now_ = measured[metric.id]
    if (typeof now_ !== 'number') {
      failures.push({
        id: metric.id,
        kind: 'unmeasured',
        detail: 'no measurement produced — build the app first, or the gate is blind'
      })
      continue
    }
    if (typeof entry.value !== 'number') {
      failures.push({ id: metric.id, kind: 'undeclared', detail: 'baseline entry has no value' })
      continue
    }
    if (now_ > entry.value * (1 + metric.tolerance)) {
      failures.push({
        id: metric.id,
        kind: 'regression',
        before: entry.value,
        now: now_,
        why: metric.why
      })
    }
  }

  return failures
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    console.error(`✗ missing ${BASELINE_PATH} — the floor has no committed baseline.`)
    return null
  }
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
}

function pct(before, now) {
  return `${(((now - before) / before) * 100).toFixed(1)}%`
}

function printFailure(f) {
  if (f.kind === 'regression') {
    console.error(`✗ ${f.id}  ${f.before} → ${f.now} (+${pct(f.before, f.now)})`)
    console.error(`    → ${f.why}`)
    console.error(
      `    → this raises the floor. Optimise it, or accept it deliberately with --update and say why in the commit.`
    )
    return
  }
  console.error(`✗ ${f.id}  ${f.kind}: ${f.detail ?? ''}`)
  if (f.why) console.error(`    → ${f.why}`)
}

function runScan() {
  const baseline = readBaseline()
  if (!baseline) return 1

  const measured = collectCiMetrics()
  const failures = evaluate(baseline, measured)

  for (const metric of METRICS) {
    const entry = baseline.metrics?.[metric.id]
    if (metric.kind === 'manual' && entry?.status === 'pending') {
      console.log(`· ${metric.id}  pending — awaiting its first measurement on the floor device`)
    }
  }

  if (failures.length > 0) {
    for (const f of failures) printFailure(f)
    console.error(
      `\n${failures.length} footprint violation(s). See docs/CHARTER.md §7 for the commitment.`
    )
    return 1
  }

  const floor = baseline.floor ?? {}
  console.log(
    `✓ footprint OK — floor: ${floor.description ?? 'undeclared'} (${Object.keys(measured).length} measured, ${METRICS.length} declared)`
  )
  for (const [id, value] of Object.entries(measured)) {
    const before = baseline.metrics?.[id]?.value
    console.log(`  ${id}: ${value}${typeof before === 'number' ? ` (baseline ${before})` : ''}`)
  }
  return 0
}

function runUpdate() {
  const baseline = readBaseline()
  if (!baseline) return 1
  const measured = collectCiMetrics()
  if (Object.keys(measured).length === 0) {
    console.error('✗ nothing measured — build the app before updating the baseline.')
    return 1
  }
  for (const [id, value] of Object.entries(measured)) {
    baseline.metrics[id] = { ...baseline.metrics[id], value, measuredAt: new Date().toISOString() }
    console.log(`  ${id} → ${value}`)
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`)
  console.log(`✓ baseline updated — explain the raise in the commit message.`)
  return 0
}

/**
 * Proof the gate can go red. Planted violations it MUST flag, plus positive
 * controls so a gate that only ever fails (and therefore gets switched off)
 * also fails here. Fixtures are in memory; nothing touches the real baseline.
 */
function runSelfTest() {
  const DAY = 86_400_000
  const now = Date.parse('2026-08-02T00:00:00Z')
  const fresh = new Date(now - 10 * DAY).toISOString()
  const ancient = new Date(now - 400 * DAY).toISOString()

  const baseline = (over = {}) => ({
    metrics: {
      'web.initial-bytes-gzip': { value: 1_000_000 },
      'floor.cold-open-ms': { value: 4000, measuredAt: fresh },
      'floor.peak-rss-mb': { value: 700, measuredAt: fresh },
      ...over
    }
  })

  const cases = [
    {
      label: 'clean measurement passes',
      run: () => evaluate(baseline(), { 'web.initial-bytes-gzip': 1_000_000 }, now),
      expect: (f) => f.length === 0
    },
    {
      label: 'a change inside tolerance passes',
      run: () => evaluate(baseline(), { 'web.initial-bytes-gzip': 1_020_000 }, now),
      expect: (f) => f.length === 0
    },
    {
      label: 'flags a byte regression past tolerance',
      run: () => evaluate(baseline(), { 'web.initial-bytes-gzip': 1_200_000 }, now),
      expect: (f) => f.some((x) => x.id === 'web.initial-bytes-gzip' && x.kind === 'regression')
    },
    {
      // The branch that matters most: a measurement that stopped working must
      // not be indistinguishable from a lean app.
      label: 'a missing measurement is unmeasured, NOT a pass',
      run: () => evaluate(baseline(), {}, now),
      expect: (f) => f.some((x) => x.id === 'web.initial-bytes-gzip' && x.kind === 'unmeasured')
    },
    {
      label: 'flags a stale hand-recorded measurement',
      run: () =>
        evaluate(
          baseline({ 'floor.cold-open-ms': { value: 4000, measuredAt: ancient } }),
          { 'web.initial-bytes-gzip': 1_000_000 },
          now
        ),
      expect: (f) => f.some((x) => x.id === 'floor.cold-open-ms' && x.kind === 'stale')
    },
    {
      label: 'flags a manual metric with a date it cannot parse',
      run: () =>
        evaluate(
          baseline({ 'floor.peak-rss-mb': { value: 700, measuredAt: 'soon' } }),
          { 'web.initial-bytes-gzip': 1_000_000 },
          now
        ),
      expect: (f) => f.some((x) => x.id === 'floor.peak-rss-mb' && x.kind === 'unmeasured')
    },
    {
      label: 'flags a manual metric with no value and no pending marker',
      run: () =>
        evaluate(
          baseline({ 'floor.peak-rss-mb': { measuredAt: fresh } }),
          { 'web.initial-bytes-gzip': 1_000_000 },
          now
        ),
      expect: (f) => f.some((x) => x.id === 'floor.peak-rss-mb' && x.kind === 'unmeasured')
    },
    {
      label: 'a disclosed pending metric passes without inventing a number',
      run: () =>
        evaluate(
          baseline({ 'floor.peak-rss-mb': { status: 'pending' } }),
          { 'web.initial-bytes-gzip': 1_000_000 },
          now
        ),
      expect: (f) => f.length === 0
    },
    {
      label: 'flags a metric that lost its baseline entry',
      run: () => evaluate({ metrics: {} }, { 'web.initial-bytes-gzip': 1_000_000 }, now),
      expect: (f) => f.length === METRICS.length && f.every((x) => x.kind === 'undeclared')
    },
    {
      // Positive control on the measurer itself: pointed at a directory with no
      // build, it must return null rather than 0.
      label: 'measuring an unbuilt directory returns null, not zero',
      run: () =>
        measureInitialBytes(join(root, 'does-not-exist')) === null ? [] : [{ kind: 'x' }],
      expect: (f) => f.length === 0
    }
  ]

  let failures = 0
  for (const c of cases) {
    let found
    try {
      found = c.run()
    } catch (error) {
      found = [{ kind: 'threw', detail: String(error) }]
    }
    if (c.expect(found)) {
      console.log(`  ✓ ${c.label}`)
    } else {
      failures++
      console.error(`  ✗ ${c.label} — got ${JSON.stringify(found)}`)
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} self-test(s) failed.`)
    return 1
  }
  console.log(`\n✓ footprint-budget self-test passed (${cases.length} cases)`)
  return 0
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).endsWith('check-footprint-budget.mjs')
if (invokedDirectly) {
  const args = process.argv.slice(2)
  let exit
  if (args.includes('--selftest')) exit = runSelfTest()
  else if (args.includes('--update')) exit = runUpdate()
  else exit = runScan()
  process.exit(exit)
}
