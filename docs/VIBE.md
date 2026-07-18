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

| Layer        | Feel                                                                                        | Lineage                                             |
| ------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Protocol** | The readable loom: seams exposed, spec public, re-implementable, signed and inspectable      | Permacomputing; the Luddites' refusal of sealed machines |
| **Platform** | The commons: hubs you can own, federation, the right to organize, the right to leave         | Ostrom's design principles; the tracker communities  |
| **App**      | The quiet venue: calm chrome by default, warmth on request, richness at the edges            | Weiser & Brown's calm technology; the cozyweb        |

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
scene, not a corporation; first-run asks how xNet should feel. When a
design review needs a tiebreak, the question this document contributes is:

> _Does this widen the scene's room, or claim it for the platform?_
