#!/usr/bin/env node
/**
 * Enforce the POSSE invariant on everything we announce (exploration 0432).
 *
 * A syndicated post is a MIRROR, never the origin: it must carry a link home to
 * xnet.fyi, or the copy has escaped the site that owns it. Charter §6 — you own
 * your audience — is the reason, and this is its machine-checkable half.
 *
 * Four rules, checked against every post text recorded in the ledger:
 *
 *   canonical-link  ✗ no https://xnet.fyi/… link  → the mirror has no origin
 *   budget          ✗ over 300 graphemes          → Bluesky would reject it
 *   facet-range     ✗ a link facet whose UTF-8 byte range does not decode back
 *                     to its own URL → ships a post whose "link" highlights
 *                     prose (the naive string-index bug, 0432)
 *   brand           ✗ `XNet` / `Xnet` / `XNET` in copy a human reads → AGENTS.md
 *
 * Run: `node scripts/check-syndication.mjs` (or `pnpm check:syndication`).
 *      `node scripts/check-syndication.mjs --selftest`  (verifies the gate
 *      catches planted violations — a gate with no negative control is
 *      unfalsifiable, exploration 0430).
 *
 * The self-test's fixtures are in memory, never on disk, so a control can never
 * leak into the real scan.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { graphemes, linkFacets, MAX_GRAPHEMES, verifyFacets } from './syndicate/facets.mjs'
import { LEDGER_PATH } from './syndicate/ledger.mjs'

const CANONICAL = /https:\/\/xnet\.fyi\//
// Word-boundary match so identifiers like XNetProvider in a URL slug don't trip
// it; the rule is about prose a reader sees.
const BAD_BRAND = /\b(XNet|Xnet|XNET)\b/

/**
 * Problems with one post's text. Pure (no I/O) so --selftest exercises it
 * directly.
 */
export function checkPost(text) {
  const problems = []
  if (!CANONICAL.test(text)) {
    problems.push({ rule: 'canonical-link', detail: 'no https://xnet.fyi/ link' })
  }
  const count = graphemes(text)
  if (count > MAX_GRAPHEMES) {
    problems.push({ rule: 'budget', detail: `${count} graphemes > ${MAX_GRAPHEMES}` })
  }
  for (const detail of verifyFacets(text, linkFacets(text))) {
    problems.push({ rule: 'facet-range', detail })
  }
  const brand = text.match(BAD_BRAND)
  if (brand) {
    problems.push({ rule: 'brand', detail: `${brand[0]} should be xNet` })
  }
  return problems
}

function runScan() {
  const path = resolve(process.cwd(), LEDGER_PATH)
  if (!existsSync(path)) {
    // Nothing has been announced yet. That is a valid state, not a pass we are
    // pretending to — say which it is.
    console.log(`✓ syndication OK (no ledger at ${LEDGER_PATH} — nothing announced yet)`)
    return 0
  }

  let ledger
  try {
    ledger = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    console.error(`${LEDGER_PATH} is not valid JSON: ${error.message}`)
    return 1
  }

  // Seeded rows adopt pre-existing work and carry no post text.
  const posts = (ledger.posted ?? []).filter((p) => !p.seeded && typeof p.text === 'string')
  let failures = 0
  for (const p of posts) {
    for (const problem of checkPost(p.text)) {
      failures++
      console.error(`✗ [${p.key}] ${problem.rule}: ${problem.detail}`)
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} syndication violation(s) in ${LEDGER_PATH}.`)
    return 1
  }
  console.log(`✓ syndication OK (${posts.length} announced post(s) checked)`)
  return 0
}

function runSelfTest() {
  const good = 'The Harvest You Can Count — on ledgers.\n\nhttps://xnet.fyi/blog/the-harvest'
  const cases = [
    {
      label: 'a well-formed post passes',
      text: good,
      expect: (p) => p.length === 0
    },
    {
      label: 'flags a post with no canonical link',
      text: 'Something shipped today. Follow along!',
      expect: (p) => p.some((x) => x.rule === 'canonical-link')
    },
    {
      label: 'flags a link to somewhere other than xnet.fyi',
      text: 'Read it\n\nhttps://example.com/blog/the-harvest',
      expect: (p) => p.some((x) => x.rule === 'canonical-link')
    },
    {
      label: 'flags a post over the grapheme budget',
      text: `${'x'.repeat(MAX_GRAPHEMES)}\n\nhttps://xnet.fyi/blog/a`,
      expect: (p) => p.some((x) => x.rule === 'budget')
    },
    {
      label: 'accepts a post exactly at the budget',
      text: (() => {
        const url = 'https://xnet.fyi/b'
        return 'y'.repeat(MAX_GRAPHEMES - graphemes(url) - 2) + '\n\n' + url
      })(),
      expect: (p) => p.length === 0
    },
    {
      label: 'counts an emoji as one grapheme, not two',
      text: '🌾'.repeat(MAX_GRAPHEMES - 20) + '\n\nhttps://xnet.fyi/b',
      expect: (p) => p.length === 0
    },
    {
      label: 'flags XNet in copy',
      text: 'XNet now syncs faster.\n\nhttps://xnet.fyi/changelog',
      expect: (p) => p.some((x) => x.rule === 'brand')
    },
    {
      label: 'does not flag the correct xNet casing',
      text: 'xNet now syncs faster.\n\nhttps://xnet.fyi/changelog',
      expect: (p) => p.length === 0
    },
    {
      label: 'does not flag the lowercase machine surfaces',
      text: 'Try xnet.fyi and @xnetjs/core.\n\nhttps://xnet.fyi/docs',
      expect: (p) => p.length === 0
    }
  ]

  let failures = 0
  for (const c of cases) {
    const found = checkPost(c.text)
    if (c.expect(found)) {
      console.log(`  ✓ ${c.label}`)
    } else {
      failures++
      console.error(`  ✗ ${c.label} — got ${JSON.stringify(found)}`)
    }
  }

  // The facet rule can't be exercised through checkPost's own linkFacets (it is
  // correct by construction), so plant the naive string-index bug directly.
  const text = 'New essay — “Harvest” 🌾\n\nhttps://xnet.fyi/blog/harvest'
  const uri = 'https://xnet.fyi/blog/harvest'
  const start = text.indexOf(uri)
  const naive = [
    {
      index: { byteStart: start, byteEnd: start + uri.length },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri }]
    }
  ]
  if (verifyFacets(text, naive).length > 0) {
    console.log('  ✓ flags a facet whose byte range does not decode to its URL')
  } else {
    failures++
    console.error('  ✗ failed to flag the naive string-index facet bug')
  }

  if (failures > 0) {
    console.error(`\n${failures} self-test(s) failed.`)
    return 1
  }
  console.log(`\n✓ syndication self-test passed (${cases.length + 1} cases)`)
  return 0
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).endsWith('check-syndication.mjs')
if (invokedDirectly) {
  process.exit(process.argv.includes('--selftest') ? runSelfTest() : runScan())
}
