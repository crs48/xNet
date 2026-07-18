import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$HookArt } from '../../chunks/HookArt_BWsfJnN4.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { $ as $$Mermaid } from '../../chunks/Mermaid_D1Kl_hLV.mjs';
import { $ as $$CodeFigure } from '../../chunks/CodeFigure_F2M_f7y-.mjs';
import { $ as $$Peek } from '../../chunks/Peek_6cp1wh8N.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$HookHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$HookHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#070710]"> ${renderComponent($$result, "HookArt", $$HookArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-indigo-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 font-mono lowercase text-indigo-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HookHero.astro", void 0);

const $$TheTipOfTheHook = createComponent(async ($$result, $$props, $$slots) => {
  const post = postBySlug("the-tip-of-the-hook");
  const kw = (s) => `<span class="tok-keyword">${s}</span>`;
  const ty = (s) => `<span class="tok-type">${s}</span>`;
  const fn = (s) => `<span class="tok-function">${s}</span>`;
  const st = (s) => `<span class="tok-string">${s}</span>`;
  const cm = (s) => `<span class="tok-comment">${s}</span>`;
  const surfaceCode = [
    `${kw("function")} ${fn("Tasks")}() {`,
    `  ${kw("const")} { data: tasks, loading } = ${fn("useQuery")}(${ty("TaskSchema")}, {`,
    `    where: { status: ${st("'todo'")} },`,
    `    orderBy: { createdAt: ${st("'desc'")} }`,
    `  })`,
    `  ${kw("const")} { create } = ${fn("useMutate")}()`,
    ``,
    `  ${cm("// tasks is live, local and already authorised \u2014 no endpoint, no fetch")}`,
    `  ${kw("if")} (loading) ${kw("return")} &lt;${ty("Spinner")} /&gt;`,
    `  ${kw("return")} &lt;${ty("TaskList")} items={tasks}`,
    `    onCreate={(title) =&gt; ${fn("create")}(${ty("TaskSchema")}, { title, status: ${st("'todo'")} })} /&gt;`,
    `}`
  ].join("\n");
  const schemaCode = [
    `${kw("export")} ${kw("const")} ${ty("TaskSchema")} = ${fn("defineSchema")}({`,
    `  name: ${st("'Task'")}, namespace: ${st("'xnet://xnet.fyi/'")},`,
    `  properties: { title: ${fn("text")}({ required: ${kw("true")} }), status: ${fn("select")}({ options: STATUSES }) },`,
    `  authorization: {`,
    `    roles:   { owner: ${fn("role.creator")}(), editor: ${fn("role.property")}(${st("'editors'")}) },`,
    `    actions: {`,
    `      read:   ${fn("allow")}(${st("'editor'")}, ${st("'owner'")}),`,
    `      write:  ${fn("allow")}(${st("'editor'")}, ${st("'owner'")}),`,
    `      delete: ${fn("allow")}(${st("'owner'")})`,
    `    }`,
    `  }`,
    `})`
  ].join("\n");
  const verifyCode = [
    `${cm("// runs before any incoming change touches your database")}`,
    `${kw("if")} (!${fn("verifyChangeHash")}(change)) ${fn("reject")}(${st("'INVALID_HASH'")})    ${cm("// recompute BLAKE3, compare")}`,
    `${kw("if")} (!${fn("verifySignature")}(change)) ${fn("reject")}(${st("'BAD_SIGNATURE'")})  ${cm("// Ed25519, key from the DID")}`,
    ``,
    `${kw("const")} decision = ${kw("await")} evaluator.${fn("check")}(authorDID, change, ${st("'write'")})`,
    `${kw("if")} (!decision.allowed) ${fn("reject")}(decision.reasons)  ${cm("// the rules you declared, enforced")}`
  ].join("\n");
  const subscriptionCode = [
    `${kw("interface")} ${ty("QuerySubscription")}&lt;${ty("P")}&gt; {`,
    `  ${fn("getSnapshot")}(): ${ty("NodeState")}[] | ${kw("null")}      ${cm("// synchronous read from the cache")}`,
    `  ${fn("subscribe")}(cb: () =&gt; ${ty("void")}): () =&gt; ${ty("void")}  ${cm("// React calls this to stay live")}`,
    `}`,
    ``,
    `${cm("// useQuery feeds exactly this to React.useSyncExternalStore \u2014 no more, no less")}`
  ].join("\n");
  const sqliteCode = [
    `${cm("// inside a Web Worker \u2014 never on the thread that paints your UI")}`,
    `${kw("this")}.poolUtil = ${kw("await")} sqlite3.${fn("installOpfsSAHPoolVfs")}({ name: ${st("'opfs-sahpool'")} })`,
    `${kw("this")}.db = ${kw("new")} ${kw("this")}.poolUtil.${ty("OpfsSAHPoolDb")}(dbPath, ${st("'c'")})`,
    `${kw("this")}.${fn("execSync")}(${st("'PRAGMA cache_size = -262144'")})    ${cm("// 256 MB page cache")}`,
    `${kw("this")}.${fn("execSync")}(${st("'PRAGMA mmap_size  = 268435456'")})  ${cm("// fault pages via the OS")}`,
    `${kw("this")}.${fn("execSync")}(${st("'PRAGMA journal_mode = TRUNCATE'")})  ${cm("// fastest durable mode on OPFS")}`
  ].join("\n");
  const schedulerCode = [
    `${kw("const")} LANE_ORDER = [${st("'interactive'")}, ${st("'bulk'")}, ${st("'write'")}] ${kw("as")} ${kw("const")}`,
    ``,
    `${cm("// drained in that order, so a tap never waits behind a bulk import;")}`,
    `${cm("// and two identical reads in flight coalesce into a single execution.")}`
  ].join("\n");
  const noApi = `flowchart LR
  subgraph STACK["The usual way \u2014 a server tier in the middle"]
    direction LR
    A1["Component"] --> A2["fetch /<br/>GraphQL"]
    A2 -->|"network"| A3["API<br/>endpoint"]
    A3 --> A4["Auth<br/>middleware"]
    A4 --> A5["ORM"]
    A5 --> A6["Database<br/>(theirs)"]
  end
  subgraph XN["xNet \u2014 the hook is the API"]
    direction LR
    B1["Component"] --> B2["useQuery(TaskSchema)"]
    B2 --> B3["SQLite on<br/>your device"]
    B3 -.->|"later, optional"| B4["Hub (relay)"]
  end`;
  const materialise = `sequenceDiagram
  participant C as Component
  participant H as useQuery
  participant Br as Bridge + cache
  participant W as Data worker
  participant S as SQLite worker
  C->>H: useQuery(TaskSchema, where status = todo)
  H->>Br: subscribe(descriptor)
  Br->>W: load (first time only)
  W->>S: SELECT \u2026 (off the main thread)
  S-->>W: rows
  W-->>Br: snapshot
  Br-->>H: getSnapshot()
  H-->>C: render
  Note over Br,W: an edit lands (local, or just-synced from a peer)
  W-->>Br: bounded delta \u2014 small change in place, big burst reloads
  Br-->>H: notify
  H-->>C: re-render only the rows that changed`;
  const workerArch = `flowchart TB
  subgraph MAIN["Main thread \u2014 your React app"]
    UI["Components + hooks"] --> BR["Worker bridge (Comlink)"]
  end
  subgraph DW["Data worker"]
    NS["Store + live query subscriptions"]
    SG["sign / verify \u2014 off the UI thread"]
  end
  subgraph SW["SQLite worker"]
    SCH["Priority scheduler<br/>interactive \u2192 bulk \u2192 write"]
    DB["SQLite (WebAssembly)"]
  end
  BR <-->|"RPC"| NS
  NS <-->|"direct MessagePort"| SCH
  SCH --> DB
  DB --> OPFS[("OPFS on your disk<br/>with graceful fallbacks")]`;
  const trustFlow = `sequenceDiagram
  participant U as Your device
  participant Hub as Hub (relay, low trust)
  participant P as Collaborator
  U->>U: useMutate update \u2014 becomes a signed, hash-chained change
  U->>U: write to local SQLite \u2014 your screen updates instantly
  U->>Hub: send the signed change
  Hub->>Hub: verify signature, recompute hash (INVALID_HASH guard)
  Hub-->>P: relay it \u2014 cannot forge it, cannot rewrite the chain
  P->>P: verify, authorise against the schema, then merge (last-write-wins)
  P->>P: the live query deltas the new value into view`;
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "HookHero", $$HookHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-indigo-600 dark:prose-a:text-indigo-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
Sit down to build a task list the normal way and, before you write a
        line of UI, you owe the machine a small bureaucracy. An API endpoint to
        list the tasks. A second to create one. Authentication to know who&rsquo;s
        asking. Authorisation middleware to decide what they&rsquo;re allowed to
        see. An ORM and a database behind that. A client-side cache so the screen
        doesn&rsquo;t flicker, and a pile of code to keep that cache honest when
        the data changes. Only <em>then</em> do you get to render a list.
</p> <p>
In xNet you write this instead — and you&rsquo;re done:
</p> ${renderComponent($$result2, "CodeFigure", $$CodeFigure, { "code": surfaceCode, "caption": "A complete, live, authorised, offline-capable task list. There is no endpoint behind it, because there is no \u201Cbehind it.\u201D" })} <p>
That&rsquo;s the whole feature. <code>tasks</code> is live: edit one on
        your phone and this list updates on your laptop. It&rsquo;s local: it
        reads from a database a few millimetres away, so it&rsquo;s instant and
        works on a plane. It&rsquo;s authorised: a user who isn&rsquo;t allowed
        to see a task never receives it. And you wired up none of that.
</p> <p>
This essay is a tour of the hooks on the surface and a dive into
        everything that one <code>useQuery</code> quietly stands on — a signed
        change log, a real SQL database running in a background thread, a
        scheduler, a sync engine. It&rsquo;s the tip of an iceberg, and the whole
        point of the tour is that you&rsquo;re allowed to look under the waterline.
        There&rsquo;s code along the way; every grey panel is skippable and the
        story still holds — but being able to show you the machine is half the
        argument.
</p> <h2>One: there is no API</h2> <p>
Start with the thing that&rsquo;s missing. In the usual architecture
        there is a tier in the middle — the endpoints, the request handlers, the
        serialisers — whose entire job is to stand between your component and the
        data and mediate every conversation. You design it, version it, secure
        it, deploy it, and pay for it to be awake at 3am.
</p> <p>
xNet deletes that tier. The hook <em>is</em> the interface to your data.
        Your &ldquo;API design&rdquo; becomes a much smaller, friendlier thing:
        which <em>schemas</em> exist, and which hooks read and write them. Both
        live in your client, in TypeScript, fully typed.
</p> ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": noApi, "caption": "The same app, two shapes. The usual way routes every read through a server tier you own and operate. xNet points the hook straight at a database on the device, and treats the network as an optional courier." })} <p>
It sounds reckless the first time you hear it — <em>the client talks
        straight to the database?</em> — and it would be, on the old web, where
        &ldquo;trust the client&rdquo; is a punchline. The rest of this piece is
        really one long answer to why it&rsquo;s safe here. But first, the tour.
</p> <h2>Two: a tour of the hooks</h2> <p>
There are only a handful, and they read like the data tools you already
        know. <code>useQuery</code> reads. Hand it a schema for the whole set, a
        schema and an id for one, or a schema and a filter for a slice —
<code>where</code>, <code>orderBy</code>, <code>limit</code>, and for the
        ambitious, full-text <code>search</code> and <code>spatial</code> windows
        for canvases. What comes back is already live; you don&rsquo;t poll and
        you don&rsquo;t re-fetch.
</p> <p> <code>useMutate</code> writes — <code>create</code>, <code>update</code>,
<code>remove</code>, or several at once in a single atomic
<code>mutate</code>. The change lands in your local database first, so
        the UI updates on the same tick; the network catches up afterwards, if
        it&rsquo;s there at all. <code>useNode</code> is for editing one thing in
        depth: it hands you the node <em>and</em> a collaborative document with
        live cursors and presence, for when two people are in the same paragraph.
        And <code>useInfiniteQuery</code> grows a window rather than freezing
        pages — load more and the earlier rows stay live instead of going stale.
</p> <p>
Notice what the surface snippet didn&rsquo;t contain: no <code>fetch</code>,
        no query keys to invalidate, no loading spinner plumbing beyond a single
        boolean, no websocket. The ergonomics are deliberately the ones a React
        developer already has in their fingers — the backend behind them is just
        no longer someone else&rsquo;s server.
</p> <h2>Three: the schema is the API — authorisation included</h2> <p>
If the hooks are how you read and write, the <strong>schema</strong> is
        where you say what a thing <em>is</em> and who may touch it — and both
        halves live in the same small object. Here is a task whose editors are
        named in a property, whose owner is whoever created it, and whose rules
        are stated right next to its fields.
</p> ${renderComponent($$result2, "Peek", $$Peek, { "label": "Open the panel \u2014 a schema with its authorisation" }, { "default": async ($$result3) => renderTemplate` ${renderComponent($$result3, "CodeFigure", $$CodeFigure, { "code": schemaCode, "filename": "packages/data/src/auth/builders.ts (shape)", "caption": "Roles are resolved from the data itself \u2014 the creator, the DIDs listed in a property, a role inherited from a related node or a Space. Actions name which roles they admit. This block is the access-control policy; there is no second copy on a server." })} ` })} <p>
This is worth dwelling on, because it&rsquo;s where most systems quietly
        split in two. Usually your client has an <em>opinion</em> about
        permissions — it greys out a button — and the server holds the
<em>truth</em>, re-checking everything because the client can&rsquo;t be
        trusted. Two implementations of the same rules, forever drifting apart.
        In xNet there is one declaration. It&rsquo;s what greys out the button
        and it&rsquo;s what&rsquo;s enforced. When you can&rsquo;t work out why
        something was allowed or denied, <code>useAuthTrace</code> will hand you
        the roles, the grants, and the reasons it decided the way it did.
</p> <p>
Which raises the obvious objection, and it deserves a straight answer.
</p> <h2>Four: why you can trust a rule you wrote on the client</h2> <p>
The old web&rsquo;s iron law is &ldquo;never trust the client,&rdquo; and
        it&rsquo;s correct there, because a rule that only runs on a device the
        attacker controls is a suggestion. xNet doesn&rsquo;t trust the client
        either. What it trusts is <em>cryptography</em>, and that changes where
        the rules can safely live.
</p> <p>
Every write becomes a small, signed record — a <strong>change</strong> —
        sealed with a key only you hold (Ed25519) and fingerprinted so the whole
        history forms a tamper-evident chain (BLAKE3). Your identity isn&rsquo;t
        an account some company can switch off; it&rsquo;s a key pair, and your
        public name is literally your public key. (The companion essay,
<a href="/blog/the-loom-you-can-read">The Loom You Can Read</a>, follows
        a single change through that machinery in detail.) The consequence that
        matters here: any device can check, on its own, that a change really came
        from who it claims and wasn&rsquo;t altered — and can run the schema&rsquo;s
        rules against it — <em>before</em> letting it touch the database.
</p> ${renderComponent($$result2, "Peek", $$Peek, { "label": "Open the panel \u2014 the gate every change passes through" }, { "default": async ($$result3) => renderTemplate` ${renderComponent($$result3, "CodeFigure", $$CodeFigure, { "code": verifyCode, "filename": "packages/sync/src/integrity.ts \xB7 packages/data/src/auth/evaluator.ts", "caption": "Verify the fingerprint, verify the signature, then evaluate the very rules you declared in the schema. Only a change that survives all three is applied \u2014 so the policy you wrote on the client is enforced by maths, not by trusting the wire." })} ` })} ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": trustFlow, "caption": "The relay in the middle is barely trusted. It can\u2019t forge your signature and it can\u2019t quietly rewrite your history without breaking the chain. Your collaborator\u2019s device verifies and authorises on its own before merging." })} <p>
So &ldquo;specify your whole API in the client&rdquo; isn&rsquo;t a
        shortcut that trades away safety. The authority has moved from a
        privileged place in the network to a property of the data itself. A rule
        attached to a signed, verifiable object is enforceable anywhere that
        object travels.
</p> <h2>Five: how a view materialises</h2> <p>
Back to that live list. When you call <code>useQuery</code>, it
        doesn&rsquo;t hand React an array; it hands React a <em>subscription</em>
— a way to read the current answer synchronously, and a way to be told
        when the answer changes. That&rsquo;s the exact shape React 18&rsquo;s
<code>useSyncExternalStore</code> wants, which is why the result stays
        tear-free under concurrent rendering without any effort from you.
</p> ${renderComponent($$result2, "Peek", $$Peek, { "label": "Open the panel \u2014 the contract behind a live query" }, { "default": async ($$result3) => renderTemplate` ${renderComponent($$result3, "CodeFigure", $$CodeFigure, { "code": subscriptionCode, "filename": "packages/data-bridge/src/types.ts", "caption": "Two methods: read now, and tell me when it changes. Everything else \u2014 the cache, the worker, the database \u2014 sits behind this tiny interface." })} ` })} <p>
Behind that interface, a cache keeps the materialised result. When data
        changes, the bridge doesn&rsquo;t re-run your query from scratch; it keeps
        a small buffer of spare rows around the edge of your window and applies
        the change <em>in place</em> — slot a new row into its sorted position,
        update one, drop one — only falling back to a full reload when a burst of
        changes is too large to patch. Unchanged rows keep their identity, so the
        components rendering them simply don&rsquo;t re-render.
</p> ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": materialise, "caption": "First call reads from the database once. After that, edits \u2014 yours, or ones that just synced in from someone else \u2014 arrive as small deltas, and only the rows that actually changed re-render." })} <p>
A precise word on &ldquo;live,&rdquo; because honesty is the house style.
        Your queries are live with respect to your <em>local</em> database: any
        change written there flows into the view, and that includes changes that
        arrive from a peer and get merged in locally. A pushier mode — the hub
        streaming results to you as they happen — is designed and named in the
        code but not switched on yet. When it is, it&rsquo;ll slot in behind this
        same subscription, and your <code>useQuery</code> won&rsquo;t change a
        character.
</p> <h2>Six: the layer beneath the waterline</h2> <p>
Now the dive. &ldquo;Reads from a local database&rdquo; is doing a lot of
        quiet work in the sentences above. That database is real SQLite — the
        same engine in your phone — compiled to WebAssembly and run inside a
<strong>Web Worker</strong>, off the thread that paints your UI. It
        persists to a private corner of the browser called the Origin Private
        File System, so your data is still there tomorrow.
</p> ${renderComponent($$result2, "Peek", $$Peek, { "label": "Open the panel \u2014 a real database, tuned, on a background thread" }, { "default": async ($$result3) => renderTemplate` ${renderComponent($$result3, "CodeFigure", $$CodeFigure, { "code": sqliteCode, "filename": "packages/sqlite/src/adapters/web.ts", "caption": "A genuine SQLite database, persisted to disk and tuned for large stores \u2014 a 256 MB page cache, memory-mapped reads, the fastest durable journal mode on OPFS. You didn\u2019t set any of it." })} ` })} <p>
There are actually two workers, and they talk to each other directly
        rather than bouncing every message through your UI thread: one owns the
        store and the live subscriptions, the other owns SQLite. Signing and
        verifying happen out here too, so the cryptography never stutters a scroll.
        A single database connection can only do one thing at a time, so a small
<strong>scheduler</strong> decides the order — and it always lets an
        interactive read jump ahead of a background import.
</p> ${renderComponent($$result2, "Peek", $$Peek, { "label": "Open the panel \u2014 why a tap never waits behind an import" }, { "default": async ($$result3) => renderTemplate` ${renderComponent($$result3, "CodeFigure", $$CodeFigure, { "code": schedulerCode, "filename": "packages/sqlite/src/adapters/worker-scheduler.ts", "caption": "Three lanes, drained in priority order, plus de-duplication of identical in-flight reads. The result: typing stays responsive even while ten thousand rows are importing in the background." })} ` })} ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": workerArch, "caption": "The shape under the surface. Your hooks talk to a bridge; the bridge talks to a data worker; the data worker talks straight to the SQLite worker over a transferred channel. The heavy lifting \u2014 SQL, OPFS I/O, signing \u2014 happens where it can\u2019t freeze the interface." })} <p>
And here&rsquo;s the part that earns the phrase <em>it just works</em>:
        the database layer probes what the device can actually do and adapts. On
        a modern browser it takes fast, exclusive file handles. On an older one,
        or a locked-down webview, it falls back to a slower-but-durable mode, and
        only as a last resort to an in-memory database — loudly, so it&rsquo;s
        never a silent surprise. The same <code>useQuery</code> runs on a
        flagship laptop and a three-year-old phone; the layer underneath quietly
        picks the best engine each one can offer.
</p> <h2>Seven: local first, mirrored to remote</h2> <p>
Because the real copy is on your device, a query is just a query against
        your own SQLite — instant, offline, no permission to ask. For most
        workspaces that&rsquo;s the whole story; everything you own fits happily
        on the device. When a dataset is large, or a request is one only the
        fleet can answer — a full-text search across more than you hold, say — a
        router decides to involve the hub, and can serve the local answer
        immediately while a fuller one refreshes in from the network behind it.
</p> <p>
New data doesn&rsquo;t arrive as a refetch. A peer&rsquo;s signed change
        comes in, gets verified and authorised, and merges into your local
        database by a simple, deterministic rule — last edit wins, with a logical
        clock and the author&rsquo;s key breaking ties, so every device reaches
        the same answer with no server casting a deciding vote. The moment it
        lands locally, the live query from section five deltas it into your view.
        &ldquo;Mirrored against a remote database and merging in new data as
        needed&rdquo; isn&rsquo;t a feature bolted on top; it&rsquo;s what falls
        out of a signed change log meeting a live local query.
</p> <h2>It just works</h2> <p>
Come back up to the surface and look again at the dozen lines we started
        with. Here is an incomplete list of what you did not write to make them
        true: an API endpoint, request handlers, an authentication layer,
        authorisation middleware, an ORM, a database migration runner, a
        client-side cache, the logic to invalidate it, a websocket, an
        offline queue, a background sync worker, a conflict resolver, and a
        connection pool. They&rsquo;re all present. You just didn&rsquo;t have to
        assemble them, and — this is the part that matters — you&rsquo;re allowed
        to open every one.
</p> <p>
It&rsquo;s worth being clear about the company xNet keeps, because it
        isn&rsquo;t alone in wanting this. Several good projects give you reactive
        queries over a local store; most of them keep a server as the root of
        trust.
</p> <div class="overflow-x-auto"> <table> <thead> <tr> <th>Approach</th> <th>Database of record</th> <th>Identity is…</th> <th>Rules enforced by…</th> <th>Offline writes</th> </tr> </thead> <tbody> <tr> <td>TanStack Query / SWR</td> <td>none (a remote cache)</td> <td>the app&rsquo;s server</td> <td>the server</td> <td>No</td> </tr> <tr> <td>Convex / InstantDB</td> <td>a vendor cloud</td> <td>a vendor account</td> <td>the vendor backend</td> <td>Partial</td> </tr> <tr> <td>Replicache / Zero</td> <td>your server</td> <td>your server&rsquo;s auth</td> <td>the server</td> <td>Yes (optimistic)</td> </tr> <tr> <td>ElectricSQL / PowerSync</td> <td>a server Postgres</td> <td>your server&rsquo;s auth</td> <td>the server / rules</td> <td>Yes</td> </tr> <tr> <td><strong>xNet</strong></td> <td><strong>local SQLite (yours)</strong></td> <td><strong>a did:key you mint</strong></td> <td><strong>signed, hash-chained changes</strong></td> <td><strong>Yes, first-class</strong></td> </tr> </tbody> </table> </div> <p>
The family resemblance is real, and the borrowed ergonomics are on
        purpose — if you&rsquo;ve used <code>useQuery</code> from one of these,
        ours will feel like home. What&rsquo;s distinctly xNet&rsquo;s is the
        corner you&rsquo;ve been standing in this whole tour: the master copy is
        on the edge device, the authority is a key in your hands, and the network
        is a convenience layered on top — not the place your work is kept.
</p> <p>
None of the machinery beneath the waterline is exotic. SQLite, a worker,
        a hash, a signature, a tiny merge rule, a subscription. It&rsquo;s plain
        engineering, arranged so that the simple thing on top — a hook you can
        read in one sitting — is also the correct thing, and the openable thing.
        So open it. <a href="/app">Use the app</a>, then read the source the
        excerpts above point at. <a href="/build-with">Build something</a> on the
        hooks and watch your &ldquo;whole API&rdquo; turn out to be a couple of
        schemas and a component. The tip is small on purpose. The iceberg is
        yours to inspect, all the way down.
</p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li>
The tradition this is built in:
<a href="https://www.inkandswitch.com/essay/local-first/" rel="noopener noreferrer">Kleppmann et&nbsp;al., &ldquo;Local-first software: you own your data,
            in spite of the cloud&rdquo;</a> (Ink &amp; Switch, 2019).
</li> <li>
The reactive-query relatives, each solving a nearby problem:
<a href="https://zero.rocicorp.dev/" rel="noopener noreferrer">Rocicorp Zero</a> and
<a href="https://replicache.dev/" rel="noopener noreferrer">Replicache</a>,
<a href="https://docs.convex.dev/" rel="noopener noreferrer">Convex</a>,
<a href="https://www.instantdb.com/" rel="noopener noreferrer">InstantDB</a>,
<a href="https://electric-sql.com/" rel="noopener noreferrer">ElectricSQL</a>,
<a href="https://www.powersync.com/" rel="noopener noreferrer">PowerSync</a>, and
<a href="https://watermelondb.dev/" rel="noopener noreferrer">WatermelonDB</a>.
</li> <li>
The browser primitives the dive relies on:
<a href="https://react.dev/reference/react/useSyncExternalStore" rel="noopener noreferrer">React <code>useSyncExternalStore</code></a>,
<a href="https://sqlite.org/wasm/doc/trunk/persistence.md" rel="noopener noreferrer">SQLite Wasm + OPFS persistence</a>, and
<a href="https://github.com/GoogleChromeLabs/comlink" rel="noopener noreferrer">Comlink</a>
for worker RPC.
</li> <li>
The machine itself, in full: the
<a href="/docs/concepts/sync-architecture">sync architecture</a>,
<a href="/docs/protocol/overview">protocol spec</a>, and
<a href="/docs/guides/identity">identity</a> docs — every claim above
          links back to real, readable source.
</li> <li>
Companion essay: <a href="/blog/the-loom-you-can-read">The Loom You Can
          Read</a>, which follows a single change through the kernel beneath these
          hooks.
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>Code excerpts are trimmed and lightly simplified for reading; the file
          paths point at the real, unabridged source. &ldquo;Live&rdquo; queries
          are live with respect to the local database (including changes synced in
          from peers); the hub-push streaming mode is designed but not yet
          enabled, and is noted as such above. All artwork here is original.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "the-tip-of-the-hook" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/the-tip-of-the-hook.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/the-tip-of-the-hook.astro";
const $$url = "/blog/the-tip-of-the-hook";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$TheTipOfTheHook,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
