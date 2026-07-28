#!/usr/bin/env node
// tellscan — measure the machine-writing tells in a piece of prose.
//
// Prints one row per metric with an OK/HIGH/LOW verdict, so a rewrite can
// target what is actually elevated instead of applying generic advice to
// prose that does not need it.
//
//   node tellscan.mjs <file...>            # per-file report
//   node tellscan.mjs --corpus <file...>   # medians across files
//   node tellscan.mjs --json <file...>     # machine-readable
//
// Thresholds are rules of thumb, not science. Detectors are unreliable in
// both directions; these measure *tics*, which is the thing worth fixing.

import { readFileSync } from 'node:fs'

// --- extraction ------------------------------------------------------------

/** Pull human-readable prose out of .astro/.md/.mdx/.html/.txt. */
export function extractProse(raw, file = '') {
  let s = raw

  if (/\.astro$/.test(file)) {
    // Component frontmatter is code, and often contains syntax-highlighted
    // string literals whose punctuation would pollute every count.
    const article = s.match(/<article[\s\S]*?<\/article>/)
    s = article ? article[0] : s.replace(/^---[\s\S]*?\n---/, '')
  } else {
    s = s.replace(/^---\n[\s\S]*?\n---/, '') // yaml frontmatter
  }

  return s
    .replace(/<(script|style|pre|code)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`[^`\n]*`/g, ' ') // inline code
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/<[^>]+>/g, ' ') // tags
    .replace(/&nbsp;/g, ' ')
    // Decode the entities that carry meaning for these metrics before
    // discarding the rest: &rsquo; is an apostrophe, and dropping it silently
    // turns "isn't" into "isnt" and zeroes the contraction count.
    .replace(/&(?:rsquo|lsquo|apos|#39|#8217|#8216);/gi, "'")
    .replace(/&(?:rdquo|ldquo|quot|#34|#8220|#8221);/gi, '"')
    .replace(/&(?:mdash|#8212);/gi, '—')
    .replace(/&(?:ndash|#8211);/gi, '–')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;|&#\d+;/gi, '') // remaining entities
    .replace(/https?:\/\/\S+/g, ' ') // bare urls
    .replace(/[‘’]/g, "'") // curly → straight
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

// Split on terminal punctuation, allowing a closing quote/bracket to follow it.
// Without the optional closer, `…logic." He reached back` never splits, and two
// sentences get counted as one very long one.
export const SENTENCE_SPLIT = /(?<=[.!?][”"’'‘)\]]?)\s+(?=[“"'(]?[A-Z])/

const sentencesOf = (s) =>
  s
    .split(SENTENCE_SPLIT)
    .map((x) => x.trim())
    .filter((x) => x.split(/\s+/).length > 2)

/**
 * Length of a sentence in words the author can actually edit. A quotation of
 * 20+ words is collapsed to one token: it cannot be shortened without
 * misquoting, so counting it would flag `He put it precisely: "<40 words>"` as
 * an overlong sentence when the only prose in it is four words.
 */
export const editableLength = (sentence) =>
  sentence
    .replace(/[“"][^”"]{100,}[”"]/g, ' «quote» ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length

const wordsOf = (s) => s.match(/[A-Za-z][A-Za-z'-]*/g) ?? []

const stats = (xs) => {
  if (!xs.length) return { mean: 0, sd: 0, cv: 0 }
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length)
  return { mean, sd, cv: mean ? sd / mean : 0 }
}

// --- the tells -------------------------------------------------------------

/** Words and phrases that read as machine filler in almost any context. */
const TIC_WORDS = [
  'delve', 'leverage', 'underscore', 'pivotal', 'robust', 'seamless',
  'holistic', 'realm', 'foster', 'harness', 'unpack', 'multifaceted',
  'myriad', 'tapestry', 'testament to', 'shed light on', 'at its core',
  'in today', 'ever-evolving', 'ever-changing', 'landscape of', 'crucial',
  'vital', 'nuanced', 'intricate', 'meticulous', 'commendable', 'daunting',
  'navigating the', 'double-edged', 'the fact that', 'it is important to',
  'it is worth noting', 'plays a (?:key|vital|crucial) role',
  'when it comes to', 'in order to', 'a wide range of', 'game-changer',
  'paradigm shift', 'deep dive', 'best-in-class', 'cutting-edge'
]

const HEDGES = [
  'arguably', 'it could be argued', 'in many ways', 'to some extent',
  'somewhat', 'relatively', 'fairly', 'quite possibly', 'one might say',
  'perhaps unsurprisingly', 'interestingly', 'notably', 'importantly'
]

/**
 * Long words with a short, ordinary equivalent. Not banned — checked. The point
 * is reach: if the plain word says the same thing, the plain word wins.
 */
const FANCY_WORDS = [
  'utili[sz]e', 'commence', 'sufficient', 'demonstrate', 'facilitate',
  'individuals', 'purchase', 'obtain', 'additional', 'approximately',
  'numerous', 'initiate', 'terminate', 'endeavou?r', 'ascertain',
  'subsequently', 'prior to', 'in the event that', 'at this point in time',
  'the majority of', 'a number of', 'is able to', 'in spite of',
  'with regard to', 'in terms of', 'methodolog', 'functionalit',
  'operationali[sz]e', 'incentivi[sz]e', 'conceptuali[sz]e', 'aforementioned',
  'notwithstanding', 'henceforth', 'ameliorate', 'elucidate', 'promulgate',
  'disseminate', 'exacerbate', 'plethora', 'salient', 'cogni[sz]ant',
  'requisite', 'utili[sz]ation', 'predicated', 'constitutes', 'comprise',
  'aggregate', 'leverage[ds]? the', 'endeavour'
]

const CONNECTIVES = [
  'furthermore', 'moreover', 'additionally', 'consequently', 'nevertheless',
  'nonetheless', 'thus', 'hence', 'in conclusion', 'in summary',
  'that said', 'ultimately', 'overall'
]

const count = (s, patterns) => {
  const hits = {}
  let total = 0
  for (const p of patterns) {
    const re = new RegExp(`\\b${p}`, 'gi')
    const n = (s.match(re) ?? []).length
    if (n) {
      hits[p] = n
      total += n
    }
  }
  return { total, hits }
}

const RE = {
  // "not X, but Y" / "isn't just X, it's Y" — the parallel-negation frame.
  negation:
    /\b(?:is|are|was|were|it's|isn't|aren't|wasn't|weren't|not)\s+(?:just|merely|simply|only)?\s*[^.;!?]{3,60}?[,.]\s*(?:but|it's|they're|it is|they are)\b/gi,
  // ", making it easier to…" — the participial tail that explains itself.
  participial:
    /,\s+(?:making|ensuring|allowing|enabling|creating|providing|highlighting|reflecting|underscoring|showcasing|demonstrating|helping)\s+[a-z]/gi,
  // "fast, cheap, and reversible" — the balanced tricolon.
  tricolon: /\b[a-z]+(?:ly)?,\s+[a-z]+(?:ly)?,\s+(?:and|or)\s+[a-z]+\b/gi,
  // "This isn't about X. It's about Y."
  aboutFrame: /\bnot\s+(?:really\s+)?about\s+[^.;!?]{3,50}[.,]\s*(?:it's|they're)\s+about\b/gi,
  colonTitle: /\b\w+:\s+[A-Z]/g,
  emDash: /—/g,
  semicolon: /;/g,
  contraction: /\b\w+'(?:s|t|re|ve|ll|d|m)\b/gi
}

const rate = (n, words) => (words ? (n / words) * 1000 : 0)

/** Rough syllable count — the standard heuristic. Good enough for a trend. */
export function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  return (w.match(/[aeiouy]{1,2}/g) ?? ['x']).length
}

/**
 * Flesch Reading Ease. Higher is more readable:
 *   90+ very easy · 60–70 plain English · 30–50 difficult · <30 very hard
 * Long sentences and long words are the only two things it punishes, which is
 * exactly the pair this repo wants held down.
 */
const flesch = (words, sents, sylls) =>
  sents && words
    ? 206.835 - 1.015 * (words / sents) - 84.6 * (sylls / words)
    : 0

/**
 * Mirrored sentence pairs: adjacent short sentences that open on the same word
 * and repeat each other's shape — "We built the first half. We refused the
 * second." The single most disliked tic in this repo's prose. Counted rather
 * than pattern-matched because the giveaway is the repetition, not the words.
 */
function mirroredPairs(sents) {
  const first = (s) => (s.match(/^[A-Za-z']+/) ?? [''])[0].toLowerCase()
  let n = 0
  for (let i = 1; i < sents.length; i++) {
    const a = sents[i - 1].split(/\s+/), b = sents[i].split(/\s+/)
    if (a.length > 16 || b.length > 16) continue
    if (a.length < 2 || b.length < 2) continue
    if (first(sents[i - 1]) && first(sents[i - 1]) === first(sents[i])) n++
  }
  return n
}

// --- scoring ---------------------------------------------------------------

/**
 * @param {'high'|'low'} dir  which direction is bad
 */
const verdict = (value, limit, dir = 'high') =>
  dir === 'high'
    ? value > limit * 1.5 ? 'HIGH' : value > limit ? 'WARN' : 'ok'
    : value < limit * 0.66 ? 'LOW' : value < limit ? 'WARN' : 'ok'

export function analyse(raw, file = '') {
  const prose = extractProse(raw, file)
  const words = wordsOf(prose)
  const w = words.length
  const sents = sentencesOf(prose)
  const lens = sents.map(editableLength)
  const s = stats(lens)

  const openers = sents
    .map((x) => (x.match(/^[A-Za-z']+/) ?? [''])[0].toLowerCase())
    .filter(Boolean)
  const openerTop = openers.length
    ? Math.max(
        ...Object.values(
          openers.reduce((a, o) => ((a[o] = (a[o] ?? 0) + 1), a), {})
        )
      ) / openers.length
    : 0

  const m = (re) => (prose.match(re) ?? []).length

  const tics = count(prose, TIC_WORDS)
  const hedges = count(prose, HEDGES)
  const connectives = count(prose, CONNECTIVES)
  const fancy = count(prose, FANCY_WORDS)

  const sylls = words.map(syllables)
  const totalSylls = sylls.reduce((a, b) => a + b, 0)
  const longWords = sylls.filter((n) => n >= 3).length
  const longSents = lens.filter((n) => n > 30).length

  return {
    file,
    words: w,
    sentences: sents.length,
    metrics: [
      // label,                 value,                       limit, dir, unit
      ['em-dashes /1k words', rate(m(RE.emDash), w), 8, 'high', ''],
      ['sentence-length cv', s.cv, 0.5, 'low', ''],
      ['short sentences (≤8w) %', (100 * lens.filter((x) => x <= 8).length) / (lens.length || 1), 12, 'low', '%'],
      ['mean sentence length', s.mean, 20, 'high', 'w'],
      ['long sentences (>30w) %', (100 * longSents) / (lens.length || 1), 10, 'high', '%'],
      ['reading ease (Flesch)', flesch(w, sents.length, totalSylls), 55, 'low', ''],
      ['long words (3+ syl) %', (100 * longWords) / (w || 1), 12, 'high', '%'],
      ['fancy words /1k', rate(fancy.total, w), 1, 'high', ''],
      ['commonest opener share %', 100 * openerTop, 14, 'high', '%'],
      ['contractions /1k words', rate(m(RE.contraction), w), 6, 'low', ''],
      ['tic words /1k words', rate(tics.total, w), 2, 'high', ''],
      ['hedges /1k words', rate(hedges.total, w), 1.5, 'high', ''],
      ['formal connectives /1k', rate(connectives.total, w), 1.5, 'high', ''],
      ['mirrored pairs /1k', rate(mirroredPairs(sents), w), 0.5, 'high', ''],
      ['negation frames /1k', rate(m(RE.negation), w), 2, 'high', ''],
      ['participial tails /1k', rate(m(RE.participial), w), 1.5, 'high', ''],
      ['tricolons /1k words', rate(m(RE.tricolon), w), 2.5, 'high', ''],
      ['"not about X, about Y" /1k', rate(m(RE.aboutFrame), w), 0.6, 'high', '']
    ].map(([label, value, limit, dir, unit]) => ({
      label, value, limit, dir, unit, verdict: verdict(value, limit, dir)
    })),
    hits: {
      tics: tics.hits,
      hedges: hedges.hits,
      connectives: connectives.hits,
      fancy: fancy.hits
    }
  }
}

// --- reporting -------------------------------------------------------------

const MARK = { ok: '  ', WARN: '~ ', HIGH: '! ', LOW: '! ' }

function report(r) {
  console.log(`\n\x1b[1m${r.file}\x1b[0m  ${r.words} words, ${r.sentences} sentences`)
  for (const m of r.metrics) {
    const bad = m.verdict !== 'ok'
    const val = `${m.value.toFixed(m.value < 10 ? 2 : 1)}${m.unit}`
    const line = `  ${MARK[m.verdict]}${m.label.padEnd(28)} ${val.padStart(7)}   (${m.dir === 'high' ? '≤' : '≥'} ${m.limit})`
    console.log(bad ? `\x1b[33m${line}\x1b[0m` : line)
  }
  const flagged = r.metrics.filter((x) => x.verdict !== 'ok')
  for (const [k, v] of Object.entries(r.hits)) {
    const items = Object.entries(v).sort((a, b) => b[1] - a[1])
    if (items.length) {
      console.log(`    ${k}: ${items.map(([t, n]) => `${t}×${n}`).join(', ')}`)
    }
  }
  console.log(
    flagged.length
      ? `  → fix: ${flagged.map((x) => x.label).join('; ')}`
      : '  → nothing elevated. Do not "humanize" this; edit it for substance instead.'
  )
}

// --- cli -------------------------------------------------------------------
// Guarded: analyse/extractProse are importable without running the CLI.

function main(argv) {
  const asJson = argv.includes('--json')
  const asCorpus = argv.includes('--corpus')
  const files = argv.filter((a) => !a.startsWith('--'))

  if (!files.length) {
    console.error('usage: tellscan.mjs [--json|--corpus] <file...>')
    process.exit(2)
  }

  const results = files.map((f) => analyse(readFileSync(f, 'utf8'), f))

  if (asJson) {
    console.log(JSON.stringify(asCorpus ? { files: results } : results, null, 2))
  } else if (asCorpus) {
    const median = (xs) =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
    console.log(`\n\x1b[1mcorpus medians\x1b[0m (${results.length} files)`)
    results[0].metrics.forEach((m, i) => {
      const v = median(results.map((r) => r.metrics[i].value))
      const vd = verdict(v, m.limit, m.dir)
      const line = `  ${MARK[vd]}${m.label.padEnd(28)} ${(v.toFixed(v < 10 ? 2 : 1) + m.unit).padStart(7)}   (${m.dir === 'high' ? '≤' : '≥'} ${m.limit})`
      console.log(vd === 'ok' ? line : `\x1b[33m${line}\x1b[0m`)
    })
  } else {
    results.forEach(report)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2))
