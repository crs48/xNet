# The tells — catalogue and fix patterns

Each entry: what the tic is, why it reads as machine-written, and how to repair
it without flattening the prose. Ordered roughly by how often it decides a
reader's verdict.

Only work on tells `tellscan.mjs` flagged. A tell that isn't elevated is, in
this draft, a stylistic choice — leave it.

---

## 1. Em-dash saturation

`em-dashes /1k words` · limit 8

The strongest 2024-onward signature. The em-dash is a genuinely good mark, which
is why models reach for it constantly: it joins any two clauses without the
writer committing to a relationship between them. Saturation flattens emphasis —
when every aside gets the loudest mark, none of them is loud.

Repair by re-pointing, and **vary the destination**:

| Original                                                          | Repair                            |
| ----------------------------------------------------------------- | --------------------------------- |
| It looks like rest — it is the hardest work I've done.            | Comma + conjunction.              |
| The signal was arriving — the reading was what was hard.          | Semicolon.                        |
| Four known fields — then an open map.                             | Colon (the second half explains). |
| The years I spent away from sensation — the ones after school —   | Parentheses (true aside).         |
| It turns the volume down — a wise thing for a system with no      | Recast: fold into the clause.     |
| better options.                                                   |                                   |

Keep the two or three that carry real rhetorical weight. The test: read the
sentence with the dash and without. If the dash isn't doing work a comma
couldn't, it isn't earning the emphasis.

> **Splitting at the dash is the trap.** A full stop is the tempting repair and
> the wrong default, because both halves keep the subject they shared and you
> manufacture a **mirrored pair** (tell 3) or a **negation frame** (tell 6):
> `X isn't Y — it's Z` becomes `X isn't Y. It's Z.` Prefer a connective that
> keeps it one sentence, and re-measure *every* metric after a dash pass, not
> just the one you were targeting.

## 2. Opener monotony

`commonest opener share %` · limit 14%

One word starting a quarter of all sentences. Usually _The_, sometimes _It_ or
_This_. Individually invisible; in aggregate it's a metronome.

Fix by varying the **grammatical shape**, not just the word:

- Lead with the subject's name instead of the article: `The protocol does X` →
  `Yjs does X`.
- Front an adverbial: `The change log never overwrites` → `Nothing in the
  change log is ever overwritten`.
- Open with a subordinate clause: `Once you're looking for leverage, you find…`
- Ask, occasionally. One question per section, at most.
- Merge two `The …` sentences into one.

Don't chase the number. Fix the paragraphs where you can *hear* the repetition.

## 3. Mirrored sentence pairs

`mirrored pairs /1k` · limit 0.5

> **This is the one to hunt first.** It is the pattern this repo dislikes most,
> and the scanner's threshold is deliberately near-zero.

Two adjacent short sentences that open on the same word and repeat each other's
shape, usually to land a contrast:

> We built the first half. We refused the second.
> It looks like rest. It is some of the hardest work I have ever done.
> The measure went up. The thing it was supposed to stand for went down.
> No server is consulted. No round-trip happens.

Each one is a rhetorical flourish that announces itself. One per essay might
pass unnoticed; several make the prose sound like it is performing. The tic
scales: three or four in a row (`The dust. The bee. The protocol.`) is the same
move with the volume up.

**Never reach for this construction, and remove it on sight.**

The fix is almost always to make it one sentence and let the syntax carry the
contrast instead of the symmetry:

| Mirrored | Repaired |
| --- | --- |
| We built the first half. We refused the second. | We built the first half and refused the second. |
| It looks like rest. It is the hardest work I know. | It looks like rest, and it is the hardest work I know. |
| The measure went up. The thing it stood for went down. | The measure went up while the thing it stood for went down. |
| A WAD file. A custom map. A model folder. | A WAD file, a custom map, a model folder. |
| I don't mean that as decoration. I mean it as provenance. | I don't mean that as decoration but as provenance. |

Useful connectives: `and`, `while`, `whereas`, `but`, `rather than`, `so`, a
colon, or a semicolon. Vary them — repairing every pair with `and` just trades
one monotony for another.

**Not the same thing**, and safe to leave:

- A labelled glossary — `The improvement test: … The BATNA test: … The vanish
  test: …` — where the repeated frame is a definition list, not rhetoric.
- A run of rhetorical questions in a speaking voice: `Healthcare? Housing?
  Your privacy?`
- Two sentences that happen to share an opening article but have unrelated
  shapes and lengths.

If the repetition is doing structural work a reader needs, keep it. If it is
there for the cadence, cut it.

## 4. Overlong sentences

`long sentences (>30w) %` · limit 10 · `mean sentence length` · limit 20

The main barrier to reach in this repo's prose. Not vocabulary — length. A
sentence past about thirty words usually holds two or three ideas that were
never introduced to each other.

The tells that a long sentence is *unearned*:

- **Two colons.** `One node shape, one namespace…: friction enough that what
  you build holds…: shareable to whom you choose…` A sentence gets one colon.
- **A list inside a clause inside a list.** Parentheses nested in a comma
  series.
- **The subject is more than ten words from its verb.**
- **A trailing `, and …` that starts a new thought.** That's a new sentence.
- **You have to re-read it** to find who is doing what.

Repairs, cheapest first:

1. **Cut.** Long sentences are where restatement hides.
2. **Full stop at the colon.** The clause after a colon is usually already a
   sentence.
3. **Promote the parenthetical.** If an aside needs commas *and* brackets, it
   wants its own sentence.
4. **Split at the `and`** when the second half has its own subject.

> The grant is itself a node (who, what, which actions, until when) and it can
> carry a capability token that the grantee can attenuate but never amplify:
> you hand a contractor read access to one project, the contractor hands her
> assistant read access to one document, and at no link in the chain can anyone
> mint themselves more than they were given. **[66 words]**

→ **The grant is itself a node: who, what, which actions, until when. It can
carry a capability token the grantee can narrow but never widen. You hand a
contractor read access to one project; she hands her assistant read access to
one document. Nobody anywhere in that chain can mint themselves more than they
were given.** *[four sentences, longest 24 words]*

**Keep the long sentence when the length is the point** — when it accumulates,
or builds to a landing. One or two an essay. The limit is a share, not a cap:
10% of sentences over thirty words is plenty of room.

> **Interaction with tell 1.** Repairing an em-dash by merging clauses makes
> sentences longer. Sometimes a full stop really is the right dash repair —
> just check you haven't made a mirrored pair (tell 3) in the process.

> **Interaction with tell 3 — the big one.** Splitting a long sentence at its
> internal list is the fastest way to *manufacture* mirrored pairs, because
> every fragment inherits the same subject:
>
> `Your source control never edits a commit; your logs are never rewritten;
> your accountant does not erase the ledger.`
> → `Your source control never edits a commit. Your logs are never rewritten.
> Your accountant does not erase the ledger.` **Three mirrored sentences where
> there was one honest list.**
>
> When the long sentence *is* a list, keep it as a list — semicolons are the
> right tool, and a 25-word list reads faster than three 8-word echoes. Split
> at the joint between two **different** ideas, not between items of the same
> one. **Always re-run the pair scan after a length pass.**

## 5. Big words with small equivalents

`long words (3+ syl) %` · limit 12 · `fancy words /1k` · limit 1 ·
`reading ease (Flesch)` · floor 55

| Instead of | Write |
| --- | --- |
| utilise | use |
| commence, initiate | start |
| sufficient | enough |
| demonstrate | show |
| facilitate | help |
| approximately | about |
| numerous | many |
| require | need |
| additional | more |
| obtain, purchase | get, buy |
| the majority of | most |
| prior to | before |
| subsequently | later |
| in the event that | if |
| with regard to, in terms of | about |
| is able to | can |

Full list in `scripts/tellscan.mjs` (`FANCY_WORDS`). The scanner prints the
actual hits — look at them before cutting.

**Keep the long word when it is the precise one.** _Provenance_,
_hydrostatic_, _interoception_ and _appropriability_ have no short synonym that
means the same thing, and swapping them would make the prose vaguer, not
plainer. The test is whether a shorter word says *the same thing*, not
something near it.

**Gloss, don't dumb down.** The move is not to avoid a hard idea; it is to
introduce it in easy words:

> Every change is content-addressed and hash-chained to its parent.

→ **Every change carries a fingerprint of its own contents, plus the
fingerprint of the change before it. Alter any of it and the chain breaks.**

Same idea, no term dropped, and a reader who has never heard of a hash chain
now knows what it does.


## 6. Negation parallelism

`negation frames /1k` · limit 2

`It's not X. It's Y.` / `not because X, but because Y` / `X isn't just Y — it's
Z.` The most recognizable rhetorical frame in machine prose, because it
manufactures the *feeling* of insight from a bare contrast.

Once an essay it's a good move. Three times it's a tic. Repairs:

- **Just assert Y.** Most of the time X was a straw man. `This isn't a
  technical problem, it's a governance problem` → `This is a governance
  problem.`
- **Give X its due**, then turn: `The technical fix works. It just doesn't
  survive the second owner.`
- **Make the contrast concrete** — swap the abstraction for the actual thing.

## 7. Rule of three

`tricolons /1k words` · limit 2.5

`fast, cheap, and reversible.` Three balanced items, often with escalating
clause length. Satisfying once a page, mechanical when every list is a triple.

Break by count and by shape: use two items, or four; make one item longer than
the others; replace the list with the one example that actually matters.

## 8. Tic words

`tic words /1k words` · limit 2

`delve, leverage, underscore, pivotal, robust, seamless, holistic, realm,
foster, harness, unpack, myriad, tapestry, testament to, shed light on, at its
core, crucial, vital, nuanced, intricate, meticulous, in order to, when it
comes to, a wide range of, deep dive, game-changer, paradigm shift`

Full list in `scripts/tellscan.mjs` (`TIC_WORDS`).

**Check context before cutting.** These are ordinary English words. An essay
about Donella Meadows will say _leverage_ legitimately; a distributed-systems
post will say _robust_ about a protocol property. The scanner prints the actual
hits with counts — look at them.

The genuine fix is usually deletion, not substitution. `in order to` → `to`.
`It is important to note that X` → `X`.

## 9. Participial tails

`participial tails /1k` · limit 1.5

`…, making it easier to onboard.` `…, ensuring data stays consistent.` The
clause explains the significance of what was just said, which is the reader's
job. It also lets a sentence trail off instead of landing.

Fix: cut it, or promote it to its own sentence with a real subject.

> The store batches writes, reducing round trips and improving throughput.

→ **The store batches writes. Ten thousand rows now ingest in 570ms instead of
250 seconds.**

Note the second gain: forced to write a real sentence, you reach for a real
number.

## 10. Hedge stacking

`hedges /1k words` · limit 1.5

`arguably`, `somewhat`, `relatively`, `in many ways`, `it could be argued`,
`interestingly`, `notably`. One hedge is honest. Three in a paragraph is a
writer refusing to commit.

Keep hedges that mark real uncertainty; delete the ones that soften a claim you
actually believe. If you can't tell which, ask whether the sentence would be
*false* without it. If not, cut it.

## 11. Formal connectives

`formal connectives /1k` · limit 1.5

`Furthermore`, `Moreover`, `Additionally`, `Consequently`, `Thus`, `Hence`,
`In conclusion`, `Ultimately`, `Overall`.

Almost always deletable. Well-ordered paragraphs don't need to be told they
follow one another. Where a real logical turn exists, use the plain word: `But`,
`So`, `Still`, `Even so`.

## 12. Missing contractions

`contractions /1k words` · floor 6

Formal register reads as machine-written in first-person essay prose. `it is` →
`it's`, `does not` → `doesn't`.

**Not universal.** Technical reference prose and specs are legitimately
contraction-free, and some sentences want the full form for stress: *"It is not
a self"* lands harder than *"It isn't a self."* Apply where the register is
conversational.

## 13. Uniform rhythm

`sentence-length cv` · floor 0.5 · `short sentences (≤8w) %` · floor 12%

The classic tell, and the one this repo's blog does **not** have. When it does
appear: the fix isn't chopping every sentence, it's adding genuine short ones.
A 4-word sentence after a 40-word one is a rhythm change a reader feels.

Don't manufacture these by cutting qualifiers the argument needs.

## 14. Structural tells the scanner can't see

Check these by reading:

- **The summarizing kicker.** A final paragraph that restates the section
  instead of advancing it. Delete it; the section already made the point.
- **Symmetrical sections.** Every section the same length with the same
  claim→example→restatement arc. Vary the shape: let one section be three
  sentences.
- **Vague plural subjects.** "Organizations struggle with…", "Users often find…"
  Name someone. Even a hypothetical with a name beats a plural abstraction.
- **The both-sides close.** Ending on "there are trade-offs either way" after an
  essay that clearly has a view. Commit.
- **Perfect parallel headings.** Six headings all `The X and the Y`. Fine as a
  deliberate series; a tell when accidental.

## Mechanical hazards of a punctuation pass

Found the hard way on the xNet blog. Check for these after any bulk edit.

**Never capitalise into a quotation.** Splitting at a dash before a quote
tempts you to raise the first letter: `copies — “there is no cloud”` →
`copies. “There is no cloud”`. That silently edits the source. Use a semicolon
or comma so the quote keeps its original case.

**Watch the line break.** In HTML, a comma or colon left at the start of a
line renders with a leading space (`the app , free and offline`). An opening
bracket left at the end of a line does the same in reverse (`honour ( the way`).
Re-flow the line rather than leaving the mark stranded.

**Verify against the rendered page, not the source.** Strip inline tags
(`em`, `strong`, `a`, `code`) with *no* space and block tags with a space —
otherwise every `<em>x</em>,` looks like a spacing bug and you'll chase
hundreds of phantoms.

**Leave structural dashes alone.** In citation lists (`Publisher — Title`),
figure filenames (`signChange() — path/to.ts`), and page-title templates, the
dash is a field separator, not voice. Stripping it damages a convention.

## Over-correction

The failure mode of every humanizing pass. Symptoms:

- Manufactured casualness: `Look,` `Here's the thing.` `Turns out…`
- Fragments used as punctuation. Which reads as a tic. Very quickly.
- Rhetorical questions opening every section.
- Qualifiers dropped, turning careful claims into overclaims.
- Slang or idiom that isn't in the author's register.

Over-humanized prose reads as **scrubbed** — the metrics pass and it still isn't
the author's voice. If a repair makes the sentence worse, the original tic was
cheaper. Revert it and report the metric as accepted.
