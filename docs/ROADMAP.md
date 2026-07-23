# xNet Roadmap — The Daily Driver, The Cloud, The Commons

> **Written**: July 2026
> **Thesis**: xNet becomes compelling for regular use by one person first. The
> near-term goal is not more features — it is that a single person (starting
> with the author) runs their actual daily workflow inside xNet, with AI agents
> doing real work under real visibility. Everything else — cloud, community —
> exists to make that daily use durable and shared.

---

## The Bet

There is a gap in the market that nobody else can fill the way xNet can:

**Deep AI integration with total visibility, on top of a malleable, sandboxed
workspace.**

Everywhere else, you choose between two bad options. Either the AI lives in a
chat box bolted onto someone else's app — it can talk but barely act — or you
hand an agent your terminal and it can do anything, including things you'll
never know about. xNet's architecture dissolves that trade-off:

- Every node has a **signed change log**. When an agent edits a document,
  creates a database, or restructures your workspace, the record of exactly
  what it touched is not a log file — it is the data model itself.
- The workspace is **Lego**. Pages, databases, canvases, views, frames — all
  composable nodes. An agent that can generate nodes can generate *workspace*.
- Plugins are **sandboxed xNet artifacts**, not shell scripts. An AI-generated
  plugin runs inside xNet's boundary, syncs like any other data, and can be
  shared and collaborated on — it is dramatically safer than giving an agent
  your machine, and dramatically more powerful than giving it a chat box.

That loop — *tell an agent what you need → it builds docs, databases, and
plugins inside your workspace → you see everything it did → you keep, share,
or discard the result* — is the product. No one else is positioned to build
it, because no one else has the signed data model and the malleable-workspace
substrate underneath.

The foundation shipped in 0391 (#620): the local bridge streams live Claude
sessions into the app, retrieval runs over your own workspace, conversations
persist as ordinary nodes, and agent writes are consent-gated. The roadmap is
about turning that foundation into a daily habit, then making it durable
(cloud) and social (the ATmosphere).

---

## Pillar 1 — The AI Daily Driver

**Goal**: my actual daily workflow happens inside xNet. Documents get drafted,
notes get organized, databases get built, plugins get written — by agents,
inside the workspace, with everything visible.

**Where it stands**: the plumbing exists (bridge, streaming sessions, FTS
retrieval, chats as nodes, write consent). What's missing is *reach* — the
agent can converse and search, but it can't yet do most of the daily work.

**Where it goes**:

- **Agents do real work on nodes.** Generate and edit documents, populate and
  restructure databases, build views and dashboards — the full node vocabulary
  as agent tools, not just read + chat. The write-consent model scales with
  this: coarse consent today, per-action legibility as the surface grows.
- **Agents build plugins.** The headline capability: describe a tool you need,
  get a working sandboxed plugin in your workspace. This is where "malleable
  software" stops being a slogan — the workspace extends itself, on request,
  in a sandbox, with provenance.
- **Visibility as a first-class surface.** "What did the AI do?" gets a real
  answer in-product: every agent action attributable in the change log, with a
  reviewable trail per session. This is the trust story competitors can't
  tell, so it must be *visible*, not just true.
- **Dogfood as the gate.** The measure of this pillar is not a feature list —
  it is consecutive weeks of the author's real work (writing, planning,
  tracking, building) done inside xNet without falling back to other tools.
  Friction found in daily use outranks everything else in the queue.

**Done looks like**: a newcomer watches a five-minute session where an agent
drafts a doc, builds a tracking database, and writes a small plugin to glue
them together — then opens the history and sees exactly what happened. Nothing
on the market does that.

---

## Pillar 2 — The Cloud, Effortless

**Goal**: anyone can get their own private cloud — their hub, their data,
their identity — running in minutes, without understanding any of the
machinery.

**Where it stands**: the hub is one binary with named roles (0383), billing
and hosting economics are worked out (0359/0360), recovery is designed
without custodial escrow (0243). But signing up and getting a running hub is
still an operator's task, not a consumer's.

**Where it goes**:

- **Sign-up that just works.** Create an account (WorkOS for the pragmatic
  path today), get a hub provisioned, land in a workspace that syncs. No
  terminal, no config, no docs required. Time-to-first-delight measured in
  minutes.
- **One identity, progressively upgraded.** Start simple; link a passkey;
  eventually your ATProto DID *is* your primary identity — public, portable,
  recoverable via your Bluesky account. The identities you already have link
  together instead of multiplying.
- **The cloud as amplifier, not landlord.** The hub makes your workspace
  durable, reachable, and shareable — but local-first stays primary, export
  is always free, and leaving is always possible. That is the sales pitch,
  not a concession: it's a private cloud you actually own.
- **The AI pillar rides on it.** A hosted hub means your agent-built
  workspace, plugins, and history follow you across devices — the daily
  driver becomes durable the moment cloud onboarding is clean.

**Done looks like**: a friend with no technical background signs up, has a
private synced workspace within five minutes, and their identity story
(recovery included) is stronger than what the incumbent clouds offer.

---

## Pillar 3 — The Commons on the ATmosphere

**Goal**: a GitHub-for-xNet — the front page where people share what they're
building, subscribe to each other, and where xNet work flows into existing
decentralized social feeds instead of a walled garden.

**Where it stands**: the identity bridge, `site.standard.document` publishing,
and Bluesky-anchored recovery shipped (0389). The Index is fully designed
(0366→0382: free to read, reproducible, no engagement ranking, run as an
ordinary hub role) but not yet built. Publishing exists; discovery doesn't.

**Where it goes**:

- **The Index as the front page.** One place to see what's happening in xNet:
  plugins people built (including AI-built ones), documents people published,
  hubs and communities that exist. Free to read, free to be listed, ranked by
  legible rules — a commons, not a leaderboard.
- **Share to where people already are.** Publishing a page or a plugin
  produces a real ATProto record that renders as a rich card in Bluesky and
  the wider ATmosphere. Your existing feed and followers are the distribution
  channel; xNet doesn't ask anyone to rebuild their audience.
- **Subscribe and follow.** See what specific people and communities are
  building; pull a shared plugin or document into your own workspace with
  provenance intact. The Lego blocks circulate.
- **The loop closes across pillars.** An agent builds you a plugin (Pillar 1),
  your hub hosts it (Pillar 2), you share it to the commons and someone else
  remixes it (Pillar 3). That circulation — AI-assisted creation flowing
  through a decentralized community — is the ecosystem no incumbent can copy.

**Done looks like**: someone discovers xNet from a Bluesky card, browses the
Index, finds a plugin someone made with an agent last week, signs up, and has
it running in their own private cloud the same afternoon.

---

## Sequencing

The pillars are ordered by dependency, but they overlap rather than queue:

1. **Now — the daily driver deepens.** Agent reach over nodes, agent-built
   plugins, the visibility surface. Gated by real daily use, not feature
   completion.
2. **Next — cloud onboarding gets consumer-grade.** Sign-up, provisioning,
   linked identity. Starts as soon as the daily driver is worth signing up
   *for*.
3. **Then — the commons opens.** The Index ships once there is something worth
   indexing: real published docs and real shared plugins coming out of
   pillars 1 and 2. Building the front page before the content exists would
   make it a catalogue of ourselves — the one failure mode the Index designs
   explicitly forbid.

---

## What This Roadmap Deliberately Ignores

Vertical apps (ERP, CRM), full mobile parity, OS-level integration, protocol
bridges beyond ATProto, and marketplace-scale plugin distribution. None of
them make xNet more compelling for one person's daily use this year. They
return to the table when the three pillars pull them in — a thriving commons
will ask for marketplace mechanics; daily drivers will ask for mobile.

---

## Principles That Hold Across All Three

1. **Local-first, always.** The cloud amplifies; it never owns. Core editing
   never requires a server.
2. **Visibility is the product.** AI that acts without a legible trail is the
   competition's product, not ours.
3. **Sandboxed power.** Agents get more capability only inside boundaries the
   user can see and revoke — the plugin sandbox, not the terminal.
4. **Mirror, not master.** The Index reflects the commons and stays free to
   read; adopt existing ATmosphere vocabulary before minting our own.
5. **Dogfood is the metric.** Every phase is judged by whether real daily
   work happens in xNet — not by shipped-feature count.
