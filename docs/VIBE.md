# The Feel of xNet

> _The charter is what we refuse. This is what we cultivate._

xNet is a local-first platform for data people own — documents, databases,
and shared spaces that live on your devices and sync peer-to-peer. The
[Humane Internet Charter](./CHARTER.md) is its immune system: six
commitments, several CI-enforced, that keep extraction out — no behavioral
surplus, no dark patterns, no lock-in. An immune system is necessary and
insufficient. A sterile room has a great immune system and no life in it.

This document names the life we are making room for. It grew out of
[exploration 0352](./explorations/0352_[x]_THE_VIBE_OF_XNET_SCENES_COMMONS_AND_SOLARPUNK.md),
which traced the feel we're after to three touchstones: the small, loved,
member-run communities of the early internet (Oink's Pink Palace and its
descendants); **scenius** — Brian Eno's word for genius that lives in a scene
rather than a person; and **solarpunk** — infrastructure in service of human
flourishing, "never dystopian."

## The doctrine: vibe belongs to the scene

The design system has one governing rule:
_"chrome may not have hue; hue belongs to data"_
([`packages/ui/src/theme/tokens.css`](../packages/ui/src/theme/tokens.css)).

The vibe doctrine is the same rule one level up:

> **The platform may not have a vibe monopoly. Vibe belongs to the scene.**

Oink's Pink Palace was pink because its people made it pink — the protocol
underneath was calm grey plumbing. xNet's job is not to be the Pink Palace;
it is to be the stable, dignified venue on which a thousand pink palaces get
built. The chrome stays quiet so the scene can be loud. Two xNet scenes
should feel as different from each other as a record store and a farm co-op —
and both should feel safe in exactly the same way.

## Three layers, three feels

| Layer        | Feel                                                                                    | Lineage                                                  |
| ------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Protocol** | The readable loom: seams exposed, spec public, re-implementable, signed and inspectable | Permacomputing; the Luddites' refusal of sealed machines |
| **Platform** | The commons: hubs you can own, federation, the right to organize, the right to leave    | Ostrom's design principles; the tracker communities      |
| **App**      | The quiet venue: calm chrome by default, warmth on request, richness at the edges       | Weiser & Brown's calm technology; the cozyweb            |

The fourth thing — the **scene** — is not our layer at all. It is what people
build on top. Every design decision should widen their room to do it.

## The loop: reciprocity legible, never scored

What made the old tracker communities hum was a loop: contribute passively
(seed), see that your contribution matters, contribute actively (upload,
curate, argue), belong. What made them anxious was the scoreboard — ratio
enforcement turned generosity into a credit economy and the credit economy
into dread.

We keep the loop and drop the leaderboard:

- **Show stewardship** — "your device has kept this space available for 340
  days"; "this space lives on nine devices, yours is one."
- **Never show standing** — no ranks, no ratios, no streaks, no leaderboards.
  This is enforced, not aspirational: the humane-patterns CI gate bans ratio
  scorekeeping alongside streak counters
  ([`scripts/check-humane-patterns.mjs`](../scripts/check-humane-patterns.mjs)).

## Measurement is pull, never push

The loop above is about what we show you of _other people_. This is the same
rule turned inward, and we learned we needed it the hard way: a 🔥 streak
counter shipped in the habit widget and the Today panel for months, under two
documents that ban streaks and a CI gate that claimed to enforce it
(exploration 0422). Doctrine did not catch it. Nobody was looking, because the
question felt settled.

> **xNet may compute anything about you that you asked it to compute, and show
> it where you go looking. It may never bring that number to you, dress it in
> iconography built for loss aversion, or shape it as something you can break.**

The distinction is not measurement versus none — a habit grid you built, on a
schedule you chose, is measurement you asked for. The distinction is **who
initiates**. A number you navigate to is a tool. A number that arrives is a
claim on your attention you did not make, and the cheapest way to make it feel
urgent is to make it losable.

Three tests, in order of how often they catch something:

- **Does it arrive, or do you fetch it?** A metric on a dashboard you assembled
  is pull. The same metric in a notification, a badge, or a launch screen is
  push, and needs a reason better than "engagement".
- **Can it break, or only fall?** Prefer a rate or a decaying strength score to
  a consecutive-day chain. `habitStrength`
  ([`packages/experiments/src/streak.ts`](../packages/experiments/src/streak.ts))
  lowers on a miss; a streak is destroyed by one. Same information, no cliff.
- **Would the iconography survive being plain?** If the number needs a flame to
  land, the flame is doing the work, and the work is loss aversion.

**Carve-out — facts about others are not scores about you.** "Three people are
waiting on your review" is push, is a count, and is legitimate: it reports
someone else's blocked state, not your standing. Rule-based, capped, snoozable
notifications ([`packages/comms/src/notify/rules.ts`](../packages/comms/src/notify/rules.ts))
stay exactly as they are. What this rule governs is _self_-measurement.

Enforced: the humane-patterns gate now matches the streak math reaching a render
path and flame/lightning beside a count, and its dark-pattern scope covers the
workbench and dashboard packages — which it did not when the streak shipped.

## The sentence

Every beloved community of the early internet died the same death: a server
seizure, a shutdown notice, an acquisition. Their ethos was real, but it
lived on machines someone else could turn off. Local-first plus portable
exit is the answer to that, and it yields the one sentence no platform can
say:

> **The scene outlives the server.** You can raid the palace, but everyone
> walks out with a copy.

If the hub dies, every member still holds the data, the log, and the keys;
the scene re-homes and continues. That is the deepest promise in this
document, and it is architectural, not rhetorical
([`packages/sync/src/change.ts`](../packages/sync/src/change.ts),
[`packages/identity/src/keys.ts`](../packages/identity/src/keys.ts), the
charter's §Exit).

## Integration you can walk out with

There is a delightful kind of stickiness and an extractive kind, and they look
identical from the inside. Devices that hand off, a graph that follows you,
things that simply work together — that surplus is real and worth paying for.
A toll on the position that makes them work is not. The two are separable, and
this is the test that separates them:

> **Build the surplus, then make every piece of it work identically against a
> hub you do not run.** The integration is earned if it survives the user
> leaving. If it degrades on exit, it was a toll wearing integration's
> clothes.

This is the cultivation-side twin of the Charter's refused rents: §Commons
says what we will not charge for, and this says what we should build instead.
It is also the harder discipline, because the tolled version is always cheaper
to ship. When a feature only works well on our hosting, that is the signal to
look again — see [`ECONOMICS.md`](./ECONOMICS.md) §3 for the running inventory
of what currently travels and what does not.

## Surrender scales with exit

Letting go of the wheel is often the right move in a life — you are not smart
enough to plan it, and the world's feedback knows things your intentions do
not. It does not follow that letting go is safe in software, and the reason is
worth stating because it decides features (exploration 0422).

You can surrender to your own life because life is not optimising against you
and you could not leave it anyway. Software inverts both halves: it **can** be
built to want something from you, and you **can** walk out. So the safety of
any "let it drive" feature is not a property of the feature. It is a property
of what happens when you want it to stop:

> **The autonomy a feature may take is bounded by how cheaply it can be revoked
> and how completely you leave with your data.** Anything that increases what
> the software decides must point at the mechanism that makes leaving cheap.

Read carefully: this **bounds** autonomy by exit cost. It does not authorise
autonomy up to that bound. "Exit is cheap here, so it's fine to let it drive"
is the argument this rule exists to refuse — cheap exit is the precondition for
even considering the question, never the answer to it.

This is why the assistant scaffolds rather than substitutes
([`packages/plugins/src/ai/runtime.ts`](../packages/plugins/src/ai/runtime.ts),
Charter §Agency) and why nothing auto-confirms. The thing you would be
surrendering to there is not your own unexamined intelligence; it is a vendor's
model, with its own reasons. §Exit is what makes the difference legible, which
makes it a precondition on autonomy rather than a separate promise about
portability.

## What this feels like in practice, in order

1. **Calm first.** The venue is monochrome, hairline, unhurried. Richness
   lives at the edges and in the data, not in the chrome.
2. **Warmth on request.** The cozy room, the calm shell, the quiet surface
   are real, discoverable choices — a feel you pick, not a flag you find.
3. **Care over metrics.** Quality bars are cultural, held by people who are
   adamant about the work — never automated into scores.
4. **Generosity by default.** Holding a replica for your scene is passive,
   ambient, and acknowledged — the background hum of belonging.
5. **The seams show.** Anyone may open the machine: the spec, the log, the
   conformance vectors are the workshop door left unlocked.
6. **Have fun.** Cute avatars were mandatory at the Pink Palace. Solemnity
   is not a virtue. If a scene wants a pig mascot, the venue should smile.

## How this document stays honest

Like the charter, a feel with no receipt is just marketing. The enforced
parts (no scorekeeping, no streaks, calm motion) live in CI gates. The
cultivated parts live in what we ship: the seed workspace demonstrates a
scene, not a corporation; first-run asks how xNet should feel.

Receipts for the two rules added in exploration 0422:

| Rule                            | Receipt                                                                                                                                                                      | Kind          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Measurement is pull, never push | [`scripts/check-humane-patterns.mjs`](../scripts/check-humane-patterns.mjs) — streak math in a render path, loss-aversion iconography; dark scope covers workbench/dashboard | Enforced      |
| Measurement is pull, never push | [`streak-heatmap-widget.tsx`](../packages/dashboard/src/widgets/streak-heatmap-widget.tsx), [`TodayPanel.tsx`](../packages/workbench/src/views/TodayPanel.tsx) render rates  | Architectural |
| Surrender scales with exit      | `scaffold` default + cognitive-debt guard ([`ai/runtime.ts`](../packages/plugins/src/ai/runtime.ts)); §Exit is the bound                                                     | Architectural |
| Surrender scales with exit      | No gate can check "did this feature point at its exit path" — it is a review question                                                                                        | Cultural      |

That last row is the honest gap: a rule enforced only by attention is a rule
that will eventually be missed. The streak is the proof — it shipped under two
documents that banned it. When a gate cannot decide the question, the mitigation
is that the question gets asked out loud in review, not that we call it enforced.

When a design review needs a tiebreak, the questions this document contributes
are:

> _Does this widen the scene's room, or claim it for the platform?_
>
> _Did the user go looking for this number, or did it come to them?_
>
> _If they want this to stop, what does stopping cost?_
