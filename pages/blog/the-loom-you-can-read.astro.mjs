import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$LoomArt } from '../../chunks/LoomArt_BU1ADpFy.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { $ as $$Mermaid } from '../../chunks/Mermaid_D1Kl_hLV.mjs';
import { $ as $$CodeFigure } from '../../chunks/CodeFigure_F2M_f7y-.mjs';
import { $ as $$Peek } from '../../chunks/Peek_6cp1wh8N.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$LoomHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$LoomHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#070710]"> ${renderComponent($$result, "LoomArt", $$LoomArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-indigo-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 font-mono lowercase text-indigo-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/LoomHero.astro", void 0);

const $$TrustBoundary = createComponent(($$result, $$props, $$slots) => {
  const canSee = [
    "The order of changes, and the rooms they belong to \u2014 it has to, to relay them.",
    "Who authored each change (their public did:key) and when.",
    "On the default, unencrypted path: the property values it forwards."
  ];
  const cannot = [
    "Forge your signature. Every change is Ed25519-signed; a tampered one fails verification on every device.",
    "Rewrite history. Each change names its parent by hash, so silently editing the past breaks the chain for everyone.",
    "Read content on the encrypted path. There, the content key is wrapped per-recipient (X25519), so the hub stores ciphertext it has no key for."
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
Where the trust line falls
</h3> <p class="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
The hub is trusted for <span class="font-medium text-gray-700 dark:text-gray-200">delivery and ordering</span> — not for truth, and not for privacy. Here is exactly what that means.
</p> <div class="mt-6 grid gap-6 sm:grid-cols-2"> <div> <p class="font-mono text-sm font-semibold text-amber-600 dark:text-amber-400">
What the hub can see
</p> <ul class="mt-3 space-y-2.5"> ${canSee.map((row) => renderTemplate`<li class="flex gap-2.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300"> <span class="select-none text-amber-500/80" aria-hidden="true">
●
</span> <span>${row}</span> </li>`)} </ul> </div> <div> <p class="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
What the hub can never do
</p> <ul class="mt-3 space-y-2.5"> ${cannot.map((row) => renderTemplate`<li class="flex gap-2.5 text-sm leading-relaxed text-gray-700 dark:text-gray-200"> <span class="select-none text-emerald-500" aria-hidden="true">
✓
</span> <span>${row}</span> </li>`)} </ul> </div> </div> <p class="mt-6 border-t border-border pt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
Swap the hub for another one — or
<a href="/build-with" class="font-medium text-indigo-600 dark:text-indigo-400">run your own</a> — and nothing about your data changes. That is the difference between a
      relay and a landlord.
</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/TrustBoundary.astro", void 0);

const $$HonestMachine = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      isnt: "It isn\u2019t a magic privacy box \u2014 the hub can see plaintext on the default path.",
      is: "The unencrypted path relays property values the hub can read. The encrypted, per-recipient envelope path exists (X25519-wrapped keys) and makes it blind \u2014 but it is not yet the universal default. We won\u2019t call the whole thing end-to-end encrypted, because today it isn\u2019t."
    },
    {
      isnt: "The kernel isn\u2019t a CRDT in the Automerge sense.",
      is: "It\u2019s a signed, hash-chained, last-write-wins change log. Rich-text documents layer Yjs (a real CRDT) on top, optionally. LWW is portable, deterministic, and trivially auditable across languages \u2014 at the cost of the fine-grained text-merge magic a sequence CRDT gives you. That\u2019s a deliberate trade, not an accident."
    },
    {
      isnt: "It isn\u2019t trying to beat Mastodon, Bluesky, or Nostr at federation.",
      is: "Those are server-to-server, online-first systems for one shared social graph. xNet is local-first storage for everything you make \u2014 notes, tasks, a CRM, a wiki \u2014 with the master copy on your device. Different problem; they can coexist."
    },
    {
      isnt: "Owning the format doesn\u2019t make leaving effortless in real life.",
      is: "We can only make the part we control cheap to leave: your identity is a portable did:key, your history is an open log, the app works offline. Your friends, your habits, and your muscle memory are still switching costs we can\u2019t wave away. The format just makes sure the door is never locked."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
What this isn’t
</h3> <p class="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
Opening the hood only counts if you’re honest about the parts that aren’t
      shiny. Four things this post is <em>not</em> claiming.
</p> <ul class="mt-6 space-y-5"> ${rows.map((row) => renderTemplate`<li class="grid gap-3 sm:grid-cols-[1fr_1.3fr] sm:gap-5"> <div class="flex gap-2.5"> <span class="select-none text-gray-400 dark:text-gray-600" aria-hidden="true">
✕
</span> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${row.isnt}</p> </div> <div class="flex gap-2.5"> <span class="select-none text-emerald-500" aria-hidden="true">
✓
</span> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.is}</p> </div> </li>`)} </ul> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HonestMachine.astro", void 0);

const $$TheLoomYouCanRead = createComponent(($$result, $$props, $$slots) => {
  const post = postBySlug("the-loom-you-can-read");
  const kw = (s) => `<span class="tok-keyword">${s}</span>`;
  const ty = (s) => `<span class="tok-type">${s}</span>`;
  const fn = (s) => `<span class="tok-function">${s}</span>`;
  const st = (s) => `<span class="tok-string">${s}</span>`;
  const cm = (s) => `<span class="tok-comment">${s}</span>`;
  const changeCode = [
    `${kw("export")} ${kw("interface")} ${ty("Change")}&lt;${ty("T")} = ${ty("unknown")}&gt; {`,
    `  id: ${ty("string")}  ${cm("// a unique id for this edit")}`,
    `  payload: ${ty("T")}  ${cm("// just the fields that changed")}`,
    `  hash: ${ty("ContentId")}  ${cm("// &quot;cid:blake3:\u2026&quot; \u2014 this edit&rsquo;s fingerprint")}`,
    `  parentHash: ${ty("ContentId")} | ${ty("null")}  ${cm("// the previous edit&rsquo;s fingerprint")}`,
    `  authorDID: ${ty("DID")}  ${cm("// who made it")}`,
    `  signature: ${ty("Uint8Array")}  ${cm("// Ed25519 \u2014 proof it was them")}`,
    `  lamport: ${ty("number")}  ${cm("// a logical clock, for ordering")}`,
    `}`
  ].join("\n");
  const signCode = [
    `${kw("const")} hash = ${fn("computeChangeHash")}(unsigned)  ${cm("// canonical JSON \u2192 BLAKE3")}`,
    `${kw("const")} signature = ${fn("sign")}(${fn("toBytes")}(hash), signingKey)  ${cm("// Ed25519, deterministic")}`,
    `${kw("return")} { ...unsigned, hash, signature }`
  ].join("\n");
  const didCode = [
    `${kw("const")} ED25519_PREFIX = ${kw("new")} ${ty("Uint8Array")}([0xed, 0x01])`,
    ``,
    `${kw("export")} ${kw("function")} ${fn("createDID")}(publicKey: ${ty("Uint8Array")}): ${ty("DID")} {`,
    `  ${kw("const")} bytes = ${kw("new")} ${ty("Uint8Array")}([...ED25519_PREFIX, ...publicKey])`,
    `  ${kw("return")} (${st("'did:key:'")} + ${fn("base58btc.encode")}(bytes)) ${kw("as")} ${ty("DID")}  ${cm("// did:key:z6Mk\u2026")}`,
    `}`
  ].join("\n");
  const lwwCode = [
    `${fn("shouldReplace")}(existing, incoming): ${ty("boolean")} {`,
    `  ${kw("if")} (incoming.lamport  !== existing.lamport)  ${kw("return")} incoming.lamport  &gt; existing.lamport`,
    `  ${kw("if")} (incoming.wallTime !== existing.wallTime) ${kw("return")} incoming.wallTime &gt; existing.wallTime`,
    `  ${kw("return")} incoming.author &gt; existing.author  ${cm("// last resort: compare the keys themselves")}`,
    `}`
  ].join("\n");
  const vectorCode = [
    `{`,
    `  ${ty('"description"')}: ${st('"first change for a Page node"')},`,
    `  ${ty('"expected"')}: {`,
    `    ${ty('"hash"')}: ${st('"cid:blake3:76fdfa20\u2026626cb980"')},`,
    `    ${ty('"signatureBase64"')}: ${st('"UcVsz+shSANm\u20265yE2AQ=="')}`,
    `  }`,
    `}`
  ].join("\n");
  const cloudVsLocal = `flowchart LR
  subgraph CLOUD["The usual way \u2014 cloud-first"]
    direction TB
    U1["You type"] -->|"round-trip"| S["A company server<br/>(the real copy)"]
    S -->|"if online"| V1["Your screen"]
    S --> K["They keep a copy<br/>they can read and lock"]
  end
  subgraph LOCAL["xNet \u2014 local-first"]
    direction TB
    U2["You type"] --> DB["SQLite on your disk<br/>(the real copy)"]
    DB --> V2["Your screen \u2014 instant, offline"]
    DB -.->|"later, optional"| H["A hub<br/>(may not even be able to read it)"]
  end`;
  const hashChain = `flowchart LR
  C1["Edit #1<br/>hash a1b2<br/>parent: none"] --> C2["Edit #2<br/>hash c3d4<br/>parent a1b2"]
  C2 --> C3["Edit #3<br/>hash e5f6<br/>parent c3d4"]
  C3 -.-> N["Change any past edit and its hash changes,<br/>so every later edit&rsquo;s parent link breaks.<br/>Tampering is obvious."]`;
  const mergeSeq = `sequenceDiagram
  participant L as Laptop (offline)
  participant H as Hub (relay)
  participant P as Phone (offline)
  L->>L: rename note to "Groceries" (lamport 7)
  P->>P: rename note to "Shopping" (lamport 7)
  Note over L,P: both come back online
  L->>H: signed change \u2014 title = "Groceries"
  P->>H: signed change \u2014 title = "Shopping"
  H-->>P: deliver the laptop's change
  H-->>L: deliver the phone's change
  Note over L,P: the same 3-line rule runs on BOTH devices \u2014<br/>lamport ties, wallTime ties, higher key wins \u2014<br/>both land on the same title, with no server vote`;
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "LoomHero", $$LoomHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-indigo-600 dark:prose-a:text-indigo-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
The Luddites have a bad reputation they didn&rsquo;t earn. We use their
        name for anyone who&rsquo;s afraid of technology, but the real weavers of
        1811 weren&rsquo;t afraid of machines — they owned and ran complicated
        ones every day. What they refused was a <em>particular</em> machine: the
        power loom installed by a factory owner, in a building they couldn&rsquo;t
        enter, running rules they weren&rsquo;t allowed to see, built to make their
        own skill worthless. Their fight was never <em>machine versus human</em>.
        It was about <em>who the machine is for, and whether the worker is allowed
        to open it.</em> </p> <p>
Two hundred years later you are the weaver, and almost every app you touch
        is that sealed loom. You can feed it and you can watch it run, but you may
        not open the cabinet, read the mechanism, or take the cloth and leave. This
        essay is about a loom built the other way — one you&rsquo;re allowed to
        open. To show you it&rsquo;s real, we&rsquo;re going to follow a single,
        boring thing all the way through the machine: you sit down at your laptop
        and type a note that says <strong>Buy milk</strong>. By the end you&rsquo;ll
        have seen every place that note lives, and every place an ordinary app
        would quietly betray it. There&rsquo;s a little code along the way — you can
        skip every grey panel and the story still holds — but it&rsquo;s there
        because <em>being able to show you the machine is the whole argument.</em> </p> <h2>One: it&rsquo;s already on your disk</h2> <p>
The instant you finish typing <strong>Buy milk</strong>, where does it
        live? In a normal cloud app, the honest answer is: <em>somewhere else.</em>
Your keystrokes are sent off to a company&rsquo;s server, which holds the
        real copy and lends you a view of it. &ldquo;The cloud&rdquo; is just
        someone else&rsquo;s computer, and on that computer your note is a guest
        that can be read, ranked, monetised, or locked out — and if the network
        drops, so does your note.
</p> <p>
xNet starts at the opposite end. Your note is written first to a small
        database — SQLite, the same engine inside your phone — that lives in a
        private corner of your own browser called the Origin Private File System.
        No server is consulted. No round-trip happens. The note is <em>yours,
        locally and completely,</em> before the internet is even part of the
        story. The screen updates instantly because it&rsquo;s reading from a file
        a few millimetres away, not a data centre an ocean away. Turn off your
        Wi-Fi and nothing changes; the app was never really talking to the network
        to begin with.
</p> ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": cloudVsLocal, "caption": "Same keystroke, two architectures. Cloud-first makes the server the source of truth and you the guest. Local-first makes your disk the source of truth and the network optional." })} <p>
This one inversion — <em>your device holds the master copy</em> — is the
        foundation everything else is bolted onto. It&rsquo;s the difference between
        renting a seat in someone&rsquo;s building and owning the loom in your own
        front room. But a loom in your front room raises an obvious question: if
        the real copy is on <em>your</em> laptop, and another real copy is on
<em>your</em> phone, how on earth do the two ever agree? To answer that, we
        need to look at what a single edit actually <em>is.</em> </p> <h2>Two: every edit is a little signed receipt</h2> <p>
Here is the first idea worth slowing down for. xNet never stores your note
        as a note. It stores the <em>history of edits</em> that produced it — and
        each edit is a tiny, self-contained record called a <strong>change</strong>.
        If you&rsquo;ve ever used the version-control tool <code>git</code>, you
        already have the mental model: nothing is ever overwritten in place;
        instead every change is a sealed receipt that says <em>what changed, who
        changed it, and which receipt came right before it.</em> Your note is just
        the sum of its receipts, replayed in order.
</p> <p>
What&rsquo;s actually inside one of these receipts is short enough to read
        in one sitting.
</p> ${renderComponent($$result2, "Peek", $$Peek, { "label": "Open the panel \u2014 what a single edit looks like" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "CodeFigure", $$CodeFigure, { "code": changeCode, "filename": "packages/sync/src/change.ts", "caption": "Every edit points at the one before it by fingerprint, and is signed by its author. So the whole history is a tamper-evident chain \u2014 exactly like git's commits, but for everything you make." })} ` })} <p>
Two of those fields are doing quiet, heavy work. The <strong>hash</strong>
is a fingerprint of the edit&rsquo;s contents, produced by a fast, modern
        hash function (BLAKE3). Change a single character and the fingerprint
        changes completely. And because each edit also records the
<strong>fingerprint of the one before it</strong>, the receipts form a
        chain: tampering with any past edit changes its fingerprint, which breaks
        the link in every edit that followed. You can&rsquo;t quietly rewrite
        history; the seams show.
</p> ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": hashChain, "caption": "Each edit names its parent by fingerprint. That single link is what makes the past tamper-evident \u2014 and it's the same trick that secures a git repository or a blockchain." })} <p>
The other field is the <strong>signature</strong>. Before an edit is
        stored, it&rsquo;s signed with a private key only you hold (using Ed25519,
        the same kind of signature that secures SSH and modern messaging apps).
        Anyone, anywhere, can later check that signature and know the edit really
        came from you and wasn&rsquo;t altered in transit — without ever needing to
        ask a server &ldquo;is this person who they say they are?&rdquo; The proof
        travels <em>with the data.</em> </p> ${renderComponent($$result2, "Peek", $$Peek, { "label": "Open the panel \u2014 sealing the receipt" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "CodeFigure", $$CodeFigure, { "code": signCode, "filename": "signChange() \u2014 packages/sync/src/change.ts", "caption": "Hash the contents, then sign the hash. Because the signature scheme is deterministic, the same edit produces byte-identical bytes on any device, in any language \u2014 which is what makes the next two sections possible." })} ` })} <h2>Three: your name is a key, not an account</h2> <p>
That signature only means something if &ldquo;you&rdquo; means something.
        On the normal web, your identity is an <em>account</em> — a row in a
        company&rsquo;s database that they create, control, and can delete. Your
        name on their loom is theirs to switch off.
</p> <p>
xNet has no accounts. Your identity is a cryptographic key pair you
        generate on your own device, and your public name — your
<strong>DID</strong>, or decentralised identifier — is literally your
        public key, written out as text. Nobody issues it. There&rsquo;s no
        registrar, no username server, nothing to revoke. It looks like
<code>did:key:z6Mk…</code> and the recipe that produces it is small enough
        to print.
</p> ${renderComponent($$result2, "Peek", $$Peek, { "label": "Open the panel \u2014 minting a name nobody can revoke" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "CodeFigure", $$CodeFigure, { "code": didCode, "filename": "createDID() \u2014 packages/identity/src/did.ts", "caption": "Your public key, tagged and text-encoded. That's the whole identity. Because it's self-certifying, any device can verify your signatures with nothing but the name itself \u2014 no central directory to phone home to." })} ` })} <p>
This is the hinge the whole &ldquo;you can leave&rdquo; promise turns on. An
        account lives on the platform; lose the platform and you lose the name. A
        key lives with <em>you</em>; it works on any hub, on any device, with any
        app that speaks the protocol. Your name is something you carry, not
        something you&rsquo;re lent.
</p> <h2>Four: two devices, no referee</h2> <p>
Now we can answer the question from the start. Your laptop and your phone
        each hold a real copy of your note. Suppose you&rsquo;re on a train with no
        signal, and on your laptop you rename the note to
<strong>Groceries</strong> — while, in your pocket, your phone (also
        offline) had already renamed the very same note to <strong>Shopping</strong>.
        Two edits, same field, no connection between them. When you get home and
        both reconnect, who wins?
</p> <p>
In a cloud app the server decides, because the server is the boss. xNet has
        no boss. Instead, every device runs the <em>exact same rule</em> to pick a
        winner — and because that rule is simple and deterministic, they all reach
        the same answer without anyone refereeing.
</p> ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": mergeSeq, "caption": "No central tie-breaker. Each device receives the other's signed change and runs the identical rule, so both converge on the same result on their own." })} <p>
The rule is called last-write-wins, and it&rsquo;s genuinely three lines.
        Compare the two edits&rsquo; logical clocks (a counter that captures
        cause-and-effect); if those tie, compare wall-clock time; and if
<em>those</em> somehow tie too, fall back to comparing the authors&rsquo;
        keys themselves. That last line looks almost silly, but it&rsquo;s the
        point: there is always a deterministic answer, so every device — yours,
        mine, one written in a different programming language entirely — lands on
        the same winner.
</p> ${renderComponent($$result2, "Peek", $$Peek, { "label": "Open the panel \u2014 the rule that decides, in full" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "CodeFigure", $$CodeFigure, { "code": lwwCode, "filename": "packages/data/src/store/store.ts", "caption": "Three comparisons, no network, no authority. Because it's pure and total, running it anywhere gives the same result \u2014 that's the whole meaning of 'no referee'. (The loser isn't lost, either: it's still in the history, just not the current value.)" })} ` })} <p>
Sit with how strange and good that is. The most contentious moment in any
        shared system — <em>two people changed the same thing at once</em> — is
        resolved here by a rule you can read in ten seconds, running independently
        on every device, owned by no one. There is no server in the middle adding
        its thumb to the scale. That&rsquo;s not a missing feature. It&rsquo;s the
        feature.
</p> <h2>Five: the hub is a post office, not a landlord</h2> <p>
&ldquo;But wait,&rdquo; you might say, &ldquo;my laptop and my phone
        clearly <em>did</em> talk to something to swap those edits.&rdquo; They did.
        It&rsquo;s called a hub, and the most important thing about it is how little
        it&rsquo;s trusted. A hub takes signed changes, puts them in order, and
        forwards them to your other devices and anyone you&rsquo;re collaborating
        with. It&rsquo;s a post office: it routes the mail and keeps things moving.
        It is emphatically <em>not</em> the landlord that owns your data.
</p> <p>
The difference is enforced by the machinery we&rsquo;ve already walked
        through. The hub can&rsquo;t forge an edit, because it can&rsquo;t produce
        your signature. It can&rsquo;t secretly rewrite your history, because the
        fingerprint chain would break and every device would notice. And on the
        encrypted path, it can&rsquo;t even <em>read</em> your content, because the
        key to unlock it is wrapped individually for each recipient and the hub
        isn&rsquo;t one of them. Here&rsquo;s the exact line between what it can see
        and what it can never do.
</p> ${renderComponent($$result2, "TrustBoundary", $$TrustBoundary, {})} <p>
We&rsquo;re going to be honest below about where that line sits today — the
        default path still relays values the hub can read, and only the encrypted
        path makes it fully blind. But the structure is the point: a hub is
<em>replaceable.</em> Don&rsquo;t like yours? Move to another, or run your
        own on a cheap box. Your identity and your data don&rsquo;t change, because
        they were never the hub&rsquo;s to hold.
</p> <h2>Six: proof you can actually leave</h2> <p>
Every platform says &ldquo;you can export your data.&rdquo; What they mean
        is they&rsquo;ll hand you a box of stuff in a format only they fully
        understand, and wish you luck. &ldquo;Exit&rdquo; on those terms is a
        courtesy they can withdraw. On xNet, exit isn&rsquo;t a feature that was
        added — it&rsquo;s a property of the format itself, and you can prove it.
</p> <p>
Because every step we&rsquo;ve described — the canonical fingerprint, the
        deterministic signature, the three-line merge — is specified down to the
        byte, the protocol ships with <strong>golden vectors</strong>: frozen
        test cases that pin down the exact expected output. A given edit must
        produce this exact fingerprint and this exact signature, full stop.
</p> ${renderComponent($$result2, "Peek", $$Peek, { "label": "Open the panel \u2014 a fact you can re-derive" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "CodeFigure", $$CodeFigure, { "code": vectorCode, "filename": "conformance/vectors/change/0001-create-page.json", "caption": "This exact case passes against xNet's implementations in TypeScript, Rust, Swift, and Python. The format isn't a vendor's blob you have to trust \u2014 it's a specification anyone can re-implement from the test vectors." })} ` })} <p>
That&rsquo;s why there are already working versions of the core in four
        languages, and why you could write a fifth. It&rsquo;s why you can fork the
        whole project and your data still reads. The right to leave isn&rsquo;t a
        promise printed on the box; it&rsquo;s a consequence of the box being made
        of glass. <em>That</em> is what the weavers were never given: a machine
        whose workings were open enough that no owner could trap them inside it.
</p> <h2>How this compares to the other escape routes</h2> <p>
xNet isn&rsquo;t the only project trying to pry the web back open, and
        it&rsquo;s worth being clear about how it differs — because mostly,
        it&rsquo;s solving a different problem. The well-known decentralised
        networks (Mastodon, Bluesky, Nostr) are about one shared <em>social
        graph</em>: how servers pass public posts around. xNet is about
<em>storage for everything you make</em> — notes, tasks, a CRM, a wiki —
        with the master copy on your own device. They can happily coexist; they
        just answer different questions.
</p> <div class="overflow-x-auto"> <table> <thead> <tr> <th>System</th> <th>Your identity is…</th> <th>Your data lives…</th> <th>Works fully offline?</th> </tr> </thead> <tbody> <tr> <td>Big-tech cloud</td> <td>an account they issue</td> <td>on their servers</td> <td>No</td> </tr> <tr> <td>Mastodon (ActivityPub)</td> <td>tied to your home server</td> <td>on your home server</td> <td>No</td> </tr> <tr> <td>Bluesky (AT Protocol)</td> <td>a portable DID</td> <td>on a host you pick</td> <td>No</td> </tr> <tr> <td>Nostr</td> <td>a raw key pair</td> <td>on relays you pick</td> <td>No</td> </tr> <tr> <td><strong>xNet</strong></td> <td><strong>a did:key you mint</strong></td> <td><strong>on your device first</strong></td> <td><strong>Yes</strong></td> </tr> </tbody> </table> </div> <p>
The family resemblance is real — Nostr&rsquo;s raw key pair is a cousin of
        xNet&rsquo;s <code>did:key</code>, and Bluesky&rsquo;s portable DID shares
        the instinct. The thing that&rsquo;s distinctly xNet&rsquo;s is the corner
        you&rsquo;ve been standing in this whole essay: the real copy is on the
        edge device, in your hand, and the network is a convenience layered on top
        — not the place your life is kept.
</p> ${renderComponent($$result2, "HonestMachine", $$HonestMachine, {})} <h2>The loom you can read</h2> <p>
Come back to the weavers. The histories now agree that they weren&rsquo;t
        wrong about machines and right about nothing — they were making a precise
        argument about power. A tool that the people using it can understand, own,
        and walk away from leaves them free. A tool that&rsquo;s sealed, rented,
        and built to make them dependent leaves them owned, however shiny it looks
        on the showroom floor. The weavers lost that argument to the factory, and
        we&rsquo;ve been living in the factory&rsquo;s logic online ever since —
        feeding sealed looms our attention and our words and calling the cloth they
        sell back to us &ldquo;our&rdquo; feed.
</p> <p>
None of what you just read is exotic. Hashes, signatures, a tiny merge
        rule, a key for a name, a file on your own disk. It&rsquo;s plain
        engineering, chosen specifically so that the machine can be opened and
        understood — by a developer reading the source, and by you, reading this.
        That openness <em>is</em> the politics. You can&rsquo;t be quietly trapped
        inside a loom whose every thread you&rsquo;re allowed to follow.
</p> <p>
So follow them. <a href="/app">Use the app</a> — it&rsquo;s free, offline,
        and private — and your &ldquo;Buy milk&rdquo; really will take the path you
        just traced. <a href="/build-with">Build something of your own</a> on the
        open protocol, or read <a href="/commitments">the commitments</a> that say,
        in writing and with the receipts to back them, what this loom will and
        won&rsquo;t do. The weavers only ever wanted a machine that was theirs to
        understand and theirs to keep. Two centuries late, here is one.
</p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li>
The real Luddites — skilled, pro-tool, and making an argument about
          autonomy, not machinery:
<a href="https://thereader.mitpress.mit.edu/the-future-encyclopedia-of-luddism/" rel="noopener noreferrer">The Future Encyclopedia of Luddism</a> (MIT Press Reader), and Brian Merchant, <em>Blood in the Machine</em>
(2023), after E.&nbsp;P. Thompson&rsquo;s &ldquo;moral economy.&rdquo;
</li> <li>
The local-first tradition this is built in:
<a href="https://www.inkandswitch.com/essay/local-first/" rel="noopener noreferrer">Kleppmann et&nbsp;al., &ldquo;Local-first software: you own your data,
            in spite of the cloud&rdquo;</a> (Ink &amp; Switch, 2019).
</li> <li>
How the other decentralised networks differ:
<a href="https://soapbox.pub/blog/comparing-protocols" rel="noopener noreferrer">Nostr vs. Fediverse vs. Bluesky</a> and the <a href="https://en.wikipedia.org/wiki/AT_Protocol" rel="noopener noreferrer">AT
          Protocol</a> overview.
</li> <li>
The machine itself, in full: the
<a href="/docs/protocol/overview">protocol spec</a>,
<a href="/docs/concepts/sync-architecture">sync architecture</a>, and
<a href="/docs/guides/identity">identity</a> docs — every claim above
          links back to real, readable source.
</li> <li>
The promises and the receipts behind them:
<a href="/commitments">the Humane Charter</a> and
<a href="/why">xNet — Why</a>. Companion essays:
<a href="/blog/a-great-pirate-age">A Great Pirate Age</a> and
<a href="/blog/the-forest-and-the-field">The Forest and the Field</a>.
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>Code excerpts are trimmed and lightly simplified for reading; the file
          paths point at the real, unabridged source. The Luddite history is used
          as argument, not decoration — the claim that they were pro-tool and
          anti-enclosure is the mainstream historical reading, not a rhetorical
          flourish. All artwork here is original.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "the-loom-you-can-read" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/the-loom-you-can-read.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/the-loom-you-can-read.astro";
const $$url = "/blog/the-loom-you-can-read";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$TheLoomYouCanRead,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
