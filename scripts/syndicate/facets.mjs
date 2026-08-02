/**
 * Rich-text helpers for Bluesky posts (exploration 0432).
 *
 * Two things Bluesky does differently from every other network, both of which
 * silently produce broken posts if you assume otherwise:
 *
 *   1. A bare URL in `text` is NOT a link. Clickability comes from a `facets`
 *      array whose ranges are UTF-8 BYTE offsets — not string indices.
 *   2. The limit is 300 GRAPHEMES (`maxGraphemes` in the app.bsky.feed.post
 *      lexicon), not 300 code units, and Bluesky never shortens URLs, so the
 *      whole URL counts against the budget.
 *
 * Zero-dep on purpose, matching scripts/atproto/publish-lexicons.mjs.
 */

/** Bluesky's post-text limit, in graphemes (app.bsky.feed.post lexicon). */
export const MAX_GRAPHEMES = 300

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

/**
 * User-perceived character count.
 *
 * NOT `s.length`: an emoji is 1 grapheme and 2 code units, so counting code
 * units rejects posts that would have fit.
 */
export function graphemes(s) {
  return [...segmenter.segment(s)].length
}

// Trailing `[^\s<>().,;:!?]` keeps sentence punctuation out of the URL, so a
// link at the end of a sentence doesn't swallow the full stop.
const URL_RE = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?]/g

/**
 * Link facets for every URL in `text`.
 *
 * The offsets are UTF-8 bytes. Our copy is full of `—`, `’` and `•` — 3 bytes
 * and 1 code unit each — so using the match index directly puts the range in
 * the wrong place and highlights a slice of prose plus half the URL. Measured:
 * on one realistic line the naive index is 12 bytes short (exploration 0432).
 */
export function linkFacets(text) {
  const facets = []
  for (const m of text.matchAll(URL_RE)) {
    facets.push({
      index: {
        byteStart: Buffer.byteLength(text.slice(0, m.index), 'utf8'),
        byteEnd: Buffer.byteLength(text.slice(0, m.index + m[0].length), 'utf8')
      },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }]
    })
  }
  return facets
}

/**
 * Every facet's byte range decodes back to its own URI.
 *
 * This is the assertion that would have caught the naive-offset bug, and it is
 * what the CI gate checks. Returns a list of human-readable problems; empty
 * means the facets are sound.
 */
export function verifyFacets(text, facets) {
  const buf = Buffer.from(text, 'utf8')
  const problems = []
  for (const f of facets) {
    const uri = f.features?.[0]?.uri
    const slice = buf.subarray(f.index.byteStart, f.index.byteEnd).toString('utf8')
    if (slice !== uri) {
      problems.push(
        `facet [${f.index.byteStart},${f.index.byteEnd}) decodes to ${JSON.stringify(slice)}, expected ${JSON.stringify(uri)}`
      )
    }
  }
  return problems
}
