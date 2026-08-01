---
name: humanize
description: >-
  Make written prose read like a person wrote it, and keep it plain enough for
  anyone to follow — measure the machine-writing tells in a draft, then rewrite
  the ones that are elevated. Use when asked to humanize, de-AI, de-slop,
  simplify or shorten text, when a draft "sounds like ChatGPT" or reads as
  dense, academic or overwritten, when editing the blog essays in
  site/src/pages/blog, or before publishing anything long-form a reader will
  judge on voice. Also read it before writing new long-form prose: it carries
  the house style (conversational tone, short words, short sentences, hard ideas
  in easy words, no bulleted lists).
license: MIT
compatibility: Requires node ≥18 and the repo checkout
allowed-tools: Bash(node:*) Read Edit Grep Glob
---

# Humanize

Most "make this sound human" advice is generic — vary your sentences, use
contractions, ban _delve_. Applied blind, it damages prose that already does
those things. **Measure first.** The scanner tells you which tics this draft
actually has, and you fix those and nothing else.

## House style: conversational and plain

This is not a tic to remove; it is how the prose should be written in the first
place. **Write the way you would explain it to one person across a table.** The
goal is to be understood by as many people as possible, not to show what
vocabulary we have.

1. **Say it with fewer, smaller words.** Prefer the short Anglo-Saxon word to
   the long Latinate one: _use_ over _utilise_, _start_ over _commence_,
   _enough_ over _sufficient_, _show_ over _demonstrate_, _about_ over
   _approximately_, _need_ over _require_, _most_ over _the majority of_.
2. **Prefer short sentences.** One idea per sentence. When a sentence carries
   two clauses joined by a colon and a third hanging off a comma, it is three
   sentences wearing a coat. A reader should never have to re-read to find the
   subject.
3. **Explain hard ideas in easy words.** Technical terms that *are* the subject
   stay — `hydrostatic equilibrium`, `CRDT`, `phosphorus` — but gloss each one
   in plain words the first time it appears. The complexity belongs in the
   idea, never in the sentence describing it.
4. **Cut before you simplify.** The shortest version of a clause is often no
   clause. If a phrase only restates the one before it, delete it.
5. **Keep a conversational tone.** Speak to the reader, not at them: first and
   second person, contractions, the rhythm of someone talking. Say _you_ where
   an encyclopedia would say _one_ or _the user_. Read a paragraph aloud — if
   you'd never say it that way to a friend who asked, rewrite it.
6. **No lists, and don't talk like an encyclopedia.** Bullets and numbered
   lists don't belong in an essay. A list is an outline: it hands the reader
   items and leaves the connecting work undone, which is exactly the work
   prose is for. Turn every list back into paragraphs, and let the sentences
   carry the order (`first`, `the harder part`, `and then`). Same rule for the
   reference-book register that comes with it — definitions before argument,
   neutral survey voice, a heading for every noun. Essays argue; entries
   catalogue. Write the essay.

The one carve-out is machinery, not voice: `Sources` citation lists, code
blocks and `CodeFigure` captions stay as they are, and structured docs
(explorations, `AGENTS.md`, changelog fragments) are not essays and keep their
lists and tables.

**This is not a ban on beautiful prose.** Rhythm, image and metaphor are the
point of these essays, and a long sentence that builds to something is worth
keeping. The rule is that complexity must be *earned*: spend it on the idea,
never on the packaging. When a sentence is both long and doing nothing a
shorter one couldn't, shorten it.

Rules 1–4 are measured by `reading ease (Flesch)` (≥ 55),
`long sentences (>30w) %` (≤ 10), `long words (3+ syl) %` (≤ 12),
`mean sentence length` (≤ 20) and `fancy words /1k` (≤ 1); full guidance in
`references/tells.md` §4–5. Rule 5 shows up in `contractions /1k` (§12) but is
mostly a judgement call, and rule 6 the scanner cannot see at all — you have to
read for both. Fix patterns for the encyclopedia register are in
`references/tells.md` §14.

## The honest framing

The goal is prose a reader enjoys, not a score on a detector. AI detectors are
unreliable in both directions: they flag human writing (especially non-native
and technical prose) and clear machine writing all the time. Never promise a
detector result, and never let one drive an edit.

Third-party humanizer services (Undetectable AI, WriteHuman, QuillBot and the
rest) are the wrong tool for this repo. They work by synonym substitution, which
wrecks the two things that matter most here: technical accuracy and the `xNet`
brand casing. They also can't be reviewed in a diff. Don't route repo prose
through them.

## The loop

```
measure  →  diagnose  →  rewrite the elevated tells  →  re-measure  →  read aloud
```

### 1. Measure

```bash
node .claude/skills/humanize/scripts/tellscan.mjs <file>
```

Thirteen metrics, each with an `ok` / `~` (warn) / `!` (elevated) verdict and
the threshold it was judged against. `--corpus <files...>` prints medians across
many files — use it to find an author's habitual tic rather than a one-off.
`--json` for scripting.

Thresholds are calibrated heuristics, not science. Treat `!` as "look here",
not as a defect.

### 2. Diagnose

The scanner's closing line names the elevated metrics. **That list is the scope
of the edit** — with three standing exceptions that apply whatever the numbers
say: mirrored pairs (always remove), plain language (always prefer the shorter
word and the shorter sentence), and the house voice (always conversational,
always prose rather than bullets). If nothing else is elevated, the draft
does not need humanizing — it needs better thinking, sharper examples, or
cutting. Say so instead of rewriting.

Read the flagged passages before touching them. A metric can be elevated for a
good reason: `the-right-to-say-no.astro` trips `tic words` on _leverage_ ×12,
but the essay is about Donella Meadows' leverage points. That's subject matter.
Leave it.

### 3. Rewrite

Full catalogue with before/after: **`references/tells.md`**. Read it when you
need the fix pattern for a specific tell.

**One tell outranks the rest: mirrored sentence pairs** (`references/tells.md`
§3). Two adjacent short sentences opening on the same word and repeating each
other's shape — `We built the first half. We refused the second.` This is a
standing prohibition, not a threshold: never write one, and remove them
wherever they appear, even when nothing else in the draft is elevated. Merge
into a single sentence and let a connective carry the contrast.

The short version of the discipline:

- **Rewrite structurally, don't swap synonyms.** Recast the sentence. A
  thesaurus pass makes prose worse and is the exact failure mode of the
  commercial tools.
- **Vary the repair.** If you fix thirty em-dashes and twenty become commas,
  you've traded one tic for another. Spread the load across full stops, colons,
  parentheses, semicolons, and recast clauses.
- **Cut before you rewrite.** A tic often sits in a sentence that adds nothing.
  Deleting it fixes the metric and improves the draft.
- **One pass per tell**, then re-measure. Chasing several at once produces
  over-corrected prose that reads as scrubbed.

### 4. Verify

Re-run the scanner. Then read the changed paragraphs aloud — the scanner cannot
hear a clunk it created, and over-humanized prose is a real failure mode.
Symptoms: forced casualness, folksy filler ("Look,", "Here's the thing"),
sentence fragments used as punctuation, and shortened sentences that dropped a
qualifier the argument needed.

## Preservation contract

Non-negotiable. A humanizing pass may change **wording and rhythm only**.

| Never change                                | Why                                    |
| ------------------------------------------- | -------------------------------------- |
| Facts, figures, dates, names                | Rewording drifts into fabrication      |
| Claims and their hedges                     | "often" → "always" is a new claim      |
| Link targets, anchor text meaning, `Sources`| Citations must still support the point |
| Code, identifiers, config, file paths       | Prose rules stop at the fence          |
| `xNet` casing (see root `AGENTS.md`)        | Copy is `xNet`, machine surfaces lower |
| Heading structure and argument order        | That's an edit, not a humanizing pass  |
| Quoted material                             | Rewriting a quote falsifies it         |

If a sentence can only lose its tic by changing what it asserts, **leave it and
report it**. Say which sentence and why.

## Matching a voice

Generic "human" is a style nobody has. When rewriting someone's work, pull 2–4
paragraphs of their strongest existing prose first and match its rhythm,
diction, and level of directness. For this repo the blog essays are the
reference: first person, en-GB spelling, concrete nouns, an argument that
commits.

## xNet blog specifics

Essays live in `site/src/pages/blog/*.astro`. Prose is inside `<article>`; the
component frontmatter above it is code the scanner already ignores — and so
should you.

The corpus was scanned in full (20 essays) and then rewritten. Em-dash density
went from a corpus median of **20.3 → 2.59 /1k** and mirrored pairs from
**1.56 → 0.46 /1k**, with rhythm broadly intact (cv 0.70 → 0.67, short
sentences 22.6% → 21.3%).

Everything else was already healthy and must not be "fixed": sentence-length
variance, short-sentence share, contractions, tic words, hedges, formal
connectives, and participial tails are all comfortably inside their limits.
This corpus never had the usual AI problems.

**`commonest opener` still reads ~23% and is deliberately left alone.** Nearly
every repeat is intentional parallelism (`We built the first half. We refused
the second.`). Treat it as accepted unless you can hear the metronome.

Two things live outside `<article>` and the scanner never sees them — sweep
them by hand in the same pass:

- each post's `description:` in `site/src/data/blog.ts` (renders in the hero,
  the index card, RSS, and `og:description`)
- the blog index subtitle in `site/src/pages/blog/index.astro`

Structural dashes were kept on purpose: `Sources` citations, `CodeFigure`
filenames, and the `<Base title>` template.

After editing an essay, the changed prose ships to readers — write a changelog
fragment (`/changelog`) or apply `skip-changelog`.

## Related

- `references/tells.md` — the catalogue and fix patterns
- `writing-agent-instructions` — for editing `AGENTS.md`/`SKILL.md` themselves
- Root `AGENTS.md` — brand spelling, commit conventions
