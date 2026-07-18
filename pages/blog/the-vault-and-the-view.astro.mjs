import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$VaultArt } from '../../chunks/VaultArt_CXxIVagm.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { $ as $$Mermaid } from '../../chunks/Mermaid_D1Kl_hLV.mjs';
import { $ as $$CodeFigure } from '../../chunks/CodeFigure_F2M_f7y-.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$VaultHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$VaultHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#080d1a]"> ${renderComponent($$result, "VaultArt", $$VaultArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sky-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 font-mono lowercase text-sky-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/VaultHero.astro", void 0);

const $$HonestVault = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      isnt: "We won\u2019t pretend two apps agreeing on data is a solved problem.",
      is: "Schema agreement is the hard part \u2014 Solid\u2019s own researchers concluded that apps failed to reuse each other\u2019s data because each one baked in private assumptions about layout. Our answer is not a grand shared ontology; it\u2019s published, versioned schemas plus lenses, overlays, and sidecars that make disagreement cheap. Views can differ about shape without forking the data."
    },
    {
      isnt: "We won\u2019t pretend a general-purpose store is fast for free.",
      is: "Purpose-built silos are quick because they optimise for exactly one access pattern. Making one open substrate feel app-fast took us months of unglamorous engineering \u2014 a dozen pull requests on query batching, hydration, and cold-start alone. The convenience of the vault is real; it just isn\u2019t worth the walls."
    },
    {
      isnt: "We won\u2019t pretend decoupling data from apps removes the need for trust.",
      is: "A view still runs with access to the slice it renders, and a malicious view is still malicious. That\u2019s a different essay \u2014 the previous one, in fact \u2014 but the short version is: every view here declares what it can see and touch, and the declaration is enforced, not promised."
    },
    {
      isnt: "We won\u2019t pretend decentralisation can\u2019t recentralise one layer up.",
      is: "Gordon Brander\u2019s law is real: unbundle the data layer and power tends to reappear at the index, the relay, the host. Our hedge is structural \u2014 the local replica is primary, the hub is an optional peer you can replace, and leaving with everything is a supported, documented act rather than a scraping exercise."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
An honest inversion
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
The graveyard of systems that promised this is well populated. Here’s
      what the residents taught us, and where the romance stops.
</p> <ul class="mt-6 space-y-5"> ${rows.map((row) => renderTemplate`<li class="grid gap-3 sm:grid-cols-[1fr_1.3fr] sm:gap-5"> <div class="flex gap-2.5"> <span class="select-none text-gray-400 dark:text-gray-600">✕</span> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${row.isnt}</p> </div> <div class="flex gap-2.5"> <span class="select-none text-sky-500">✓</span> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.is}</p> </div> </li>`)} </ul> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HonestVault.astro", void 0);

const $$TheVaultAndTheView = createComponent(($$result, $$props, $$slots) => {
  const post = postBySlug("the-vault-and-the-view");
  const kw = (s) => `<span class="tok-keyword">${s}</span>`;
  const st = (s) => `<span class="tok-string">${s}</span>`;
  const cm = (s) => `<span class="tok-comment">${s}</span>`;
  const lensCode = [
    `${cm("// A lens is a treaty between two views of the same nodes.")}`,
    `${kw("const")} taskV1toV2: SchemaLens = {`,
    `  source: ${st("'xnet://xnet.fyi/Task@1.0.0'")},`,
    `  target: ${st("'xnet://xnet.fyi/Task@2.0.0'")},`,
    `  forward: (data) => ({`,
    `    ...data,`,
    `    status: data.complete ? ${st("'done'")} : ${st("'todo'")}`,
    `  }),`,
    `  backward: (data) => ({`,
    `    ...data,`,
    `    complete: data.status === ${st("'done'")}`,
    `  }),`,
    `  lossless: ${kw("false")}`,
    `}`,
    `${cm("// The old view keeps reading v1. The new view reads v2.")}`,
    `${cm("// Nobody migrates anybody. Nobody asks a vendor.")}`
  ].join("\n");
  const inversion = `flowchart LR
  subgraph vaults["The vault era \u2014 data fused to the app"]
    A1["App A<br/>your data inside"]
    A2["App B<br/>your data inside"]
    A1 -. "CSV export<br/>(a brick)" .-> A2
  end
  subgraph views["Apps as views \u2014 data as the ground"]
    LOG["Your substrate:<br/>one signed, hash-chained<br/>change log"] --> STORE[("Schema-typed nodes")]
    STORE -->|lens| T["Tasks view"]
    STORE -->|lens| B["Board view"]
    STORE -->|lens| C["Canvas view"]
    STORE -->|"SchemaLens<br/>v1 \u2194 v2"| N["Next year's view,<br/>generated in an evening"]
  end
  vaults ==>|"the inversion"| views`;
  const twoViews = `sequenceDiagram
  participant You
  participant S as One store of nodes
  participant T as Tasks view
  participant C as Calendar view
  You->>T: tick a task done
  T->>S: append one signed change
  S-->>T: live query update
  S-->>C: live query update
  Note over T,C: two views, one change \u2014<br/>both update, instantly`;
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "VaultHero", $$VaultHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-sky-600 dark:prose-a:text-sky-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
On the first of July, 2013, Google Reader went dark. It was, by most
        accounts, the best feed reader anyone had built — the place where a
        decade of the web’s most attentive readers kept their subscriptions,
        their read history, their starred items, their slow-grown map of who
        was worth listening to. Google gave everyone months of notice and a
        polite export. You could download your subscriptions and walk away
        with a file.
</p> <p>
People did. And then they discovered what the file was. The
        subscription list moved — that part survived. The years of read
        state, the stars, the tags: shaped for one renderer, meaningful to
        one application, and that application no longer existed. The data was technically yours. It had simply been
        formed, like a fossil, in the exact image of the thing that died.
        Wunderlist users got the same lesson in 2020; Sunrise Calendar users
        in 2016; every user of every sunsetted app gets it eventually, and
        the lesson is always the same shape. The researchers at Ink &amp;
        Switch put it precisely: <em>“If the service shuts down, even though
        you might be able to export your data, without the servers there is
        normally no way for you to continue running your own copy of that
        software.”</em> </p> <p>
We have a word for a place that holds your valuables, shows them to
        you through its own little window, on its own hours, and shapes what
        it holds so thoroughly that the contents are worthless anywhere else.
        The word is <strong>vault</strong> — and the modern app is one. This
        essay is about the alternative, which is older than the vault, kept
        alive by a quiet lineage of thinkers, and — we’ll argue — about to be
        forced on the industry by economics whether it likes it or not:
<strong>the application as a view over data you own.</strong> </p> <h2>The twenty-five-year detour</h2> <p>
Here is the strange thing: the vault is the anomaly, not the
        tradition. For most of computing’s history, data and application were
        understood to be different kinds of thing, with different lifespans,
        and the data was the one that mattered.
</p> <p>
In 1970, an IBM researcher named Edgar Codd published the paper that
        gave us the relational database, and its opening line is a manifesto
        for exactly this separation: users of large data banks, Codd argued,
        must be protected from having to know how the data is organised in
        the machine — and, symmetrically, the data must be protected from any
        one program’s opinions about it. He called it
<em>data independence</em>, and the industry found it so obviously
        correct that it fossilised into the vocabulary: to this day, the SQL
        keyword for a derived window onto shared tables is
<code>CREATE VIEW</code>. Unix, the same decade, made the same bet in
        a different idiom — programs are ephemeral, files endure, and any
        program may read any file. Your text didn’t belong to <code>ed</code>
or <code>vi</code>; they were lenses you pointed at it. The desktop
        era inherited the arrangement by default: your documents were
<em>files</em>, on <em>your disk</em>, and when WordPerfect lost to
        Word your letters did not die with it.
</p> <p>
Then software moved into the browser tab, and — for the first time in
        the mainstream — the default inverted. The web application holds the
        only copy, on the vendor’s machines, in the vendor’s schema,
        reachable through the vendor’s screens. The fusion of data and app
        stopped being an architecture choice and became the business model:
        an investor evaluating a startup asks about its <em>moat</em>, and
        for most software businesses the honest answer is “the data our
        users cannot take with them.” Jacky Zhao, in an essay we’ll come back
        to, states the incentive plainly: <em>“The competitive advantage of
        the vast majority of today’s centralized platforms are in their data
        moats and network effects.”</em> </p> <p>
But it would be too easy — and this series tries not to take the easy
        version — to tell it as a story of pure capture. The vault is also
        genuinely convenient to build. A team that owns its schema can change
        it on a Tuesday. A product that answers to no other reader of its
        data can iterate its data model and its interface as one motion, and
        the best products do exactly that. Moxie Marlinspike’s famous
        observation that protocols move slower than platforms is a
        description of this real advantage. The vault wasn’t only imposed on
        us. It was also, for the people building software, the path of least
        resistance — right up until you ask what it costs the person the
        software is for.
</p> <p>
It costs them everything the cold open describes. Five apps, five
        copies of your contacts, none authoritative. Every new tool starting
        from an empty room. Every export a brick. And a strange, low-grade
        powerlessness that previous generations of computer users did not
        have: the sense that your own records — your notes, your plans, your
        correspondence, your numbers — are things you <em>visit</em>, like
        money in someone else’s bank, rather than things you <em>have</em>.
</p> <h2>“Apps become views”</h2> <p>
The clearest early statement of the way out came from inside the
        project trying to build it. In December 2017, Ruben Verborgh — one of
        the architects working with Tim Berners-Lee on
<strong>Solid</strong>, the personal-data-pod project — wrote an
        essay called <em>Paradigm shifts for the decentralized Web</em>. It
        names three shifts. Data and applications separate. End users become
        the controllers of their data. And the shift he gave the phrase this
        essay orbits: <strong>apps become views</strong> — <em>“applications
        as interchangeable views, wherein each Web app provides consistent
        visualizations, interactions, and processing over your personal data
        pod.”</em> </p> <p>
Read his formulation slowly, because every word is load-bearing.
<em>Interchangeable</em>: if two task apps read the same task data,
        switching apps is retargeting a lens, not emigrating. <em>“Applications
        ask rather than store,”</em> he wrote, <em>“and they are able to
        reuse data created by other apps, avoiding vendor lock-in.”</em> And
        underneath it, the quiet redefinition of what decentralisation is
        even for: <em>“Decentralization is about choice: we will choose where
        we store our data, who we give access to which parts of that data,
        which services we want on it, and how we pay for those.”</em> Not
        ideology. Choice — the thing the vault removes.
</p> <p>
Verborgh was honest about the costs in the same essay — that
        querying data scattered across personal pods is genuinely hard
        (<em>“the main challenge with full decentralization of data is
        scalability”</em>), and that unbundling breaks the advertising
        subsidy: <em>“not everything is going to be ‘free’.”</em> Solid got
        funded, incubated, deployed in pilots. And then it spent years
        discovering exactly which parts of the vision were the hard parts.
</p> <h2>What the pods taught everyone</h2> <p>
The autopsy is unusually well documented, partly by Solid’s own
        researchers — which is to the project’s enormous credit, and worth
        saying before the critique: the pods generation did the field the
        favour of being wrong in public, precisely, with footnotes.
</p> <p>
The first and biggest lesson: <strong>the schema problem is the
        whole problem.</strong> Two apps sharing data must agree not just on
        where the bytes live but on what they <em>mean</em> — and Solid, by
        design, declined to referee. Leigh Dodds, a linked-data practitioner
        broadly sympathetic to the goals, wrote in 2024 that a pod has
<em>“no built in understanding of any specific schemas or formats. Or
        recommended ways to structure data”</em> — and concluded, damningly,
        that after a decade <em>“it still all feels very much like an idea
        trying to find a solution.”</em> Solid’s own research team reached
        the same diagnosis in a paper asking, literally,
<em>What’s in a Pod?</em> Their answer: apps failed to reuse each
        other’s data because each app baked in private, implicit assumptions
        about how the pod was laid out. Interoperability wasn’t blocked by
        the protocol. It was blocked by the absence of a cheap way for two
        programs to disagree about shape and both keep working.
</p> <p>
Second lesson: <strong>a substrate without a query layer breeds
        shadow vaults.</strong> Pods stored documents but couldn’t answer
        questions, so every serious app built its own index of pod data on
        its own servers — which is, functionally, app-held data again,
        wearing a decentralisation lanyard. (Bluesky’s AT Protocol, the
        pragmatic descendant of these ideas, at least does this in the open:
        user-owned data repositories underneath, big indexing “app views” on
        top, honestly labelled.)
</p> <p>
Third: <strong>nobody adopts a data layer for its own sake.</strong>
Moxie Marlinspike’s line — people don’t want to run their own
        servers — is usually quoted as a dunk, but it’s really a design
        constraint: self-sovereignty has a UX floor, and a pod that arrives
        before the software you actually wanted is a worse Dropbox. And
        fourth, the deepest one, from Gordon Brander: <em>“If you
        decentralize, the system will recentralize, but one layer up.”</em>
Kill the app silo and power reappears at the index, the relay, the
        host. There is no architecture that makes vigilance unnecessary;
        there are only architectures that give you standing.
</p> <p>
None of these lessons say the vision was wrong. They say the vision
        was <em>right enough to be worth doing properly</em> — and they read,
        in hindsight, like a specification for the next attempt.
</p> <h2>The mechanism generation</h2> <p>
The next attempt came from a different direction: not standards-first
        but <em>software-first</em>. In 2019, Martin Kleppmann and the
        researchers at Ink &amp; Switch published
<em>Local-first software: you own your data, in spite of the
        cloud</em> — the essay that gave this whole movement its name and its
        engineering discipline. Its move was quietly radical: stop arguing
        about where data should live politically, and change where it lives
<em>physically</em>. The copy on your device is the primary copy.
        The cloud, where it exists at all, holds secondary copies — <em>“there
        is no cloud, it’s just someone else’s computer,”</em> as the bumper
        sticker they quote puts it. Collaboration, the one thing vaults
        genuinely did better than files, gets solved in the data structure
        itself (CRDTs — data types designed to merge concurrent edits), and
<strong>sync becomes a separate layer</strong> beneath the app rather
        than the app’s defining feature. Seven ideals, but the load-bearing
        one for this essay is the seventh: you retain ultimate ownership and
        control — which quietly re-founds Codd’s data independence one layer
        down, in your pocket.
</p> <p>
Three years later, Jacky Zhao’s <em>Towards Data Neutrality</em>
joined the diagnosis to the mechanism and gave the end-state its
        cleanest modern statement: <em>“Apps in this new model are now just
        views on top of data rather than a tight coupling of data and
        logic.”</em> He reached back past the web for the design pattern —
<em>“apps and platforms in this model follow the Unix philosophy:
        expect the output of every program to become the input to another, as
        yet unknown, program”</em> — and in his accompanying Rhizome
        proposal, sketched the mechanics (a universal tuple store, capability
        based permissions, CRDTs, an always-on “cloud peer” that is
<em>“not a hosting provider… a different type of a personal
        device”</em>) and wrote down the property the whole argument turns
        on: <em>“If two apps are views on the same data, any change to the
        underlying data will instantly update both apps.”</em> </p> <p>
By this year the idea had a slogan. Guido X Jansen, writing about
        communities that own their data on the AT Protocol, put it on a flag:
<strong>“Apps as Views, Not Vaults”</strong> — <em>“the things you
        make are yours; apps are just the viewers.”</em> Fifty-two years
        after Codd, the argument had completed its lap: out of the database
        textbooks, through the pods, through the sync layer, and back into
        plain English.
</p> ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": inversion, "caption": "The inversion, drawn once. In the vault era, moving apps means an export and a prayer. When apps are views, a new app is a new lens over data that never moves \u2014 including the lens that doesn't exist yet." })} <h2>One substrate, many windows</h2> <p> <a href="/">xNet</a> is our attempt to build the thing this lineage
        describes — with the pod generation’s lessons treated as
        requirements, not trivia. So let us show you how each lesson landed
        in the machinery, honestly, receipts included.
</p> <p>
Start with the ground. Everything you make — tasks, notes, contacts,
        messages, pages, ledgers — lives in one store of schema-typed nodes
        on your own device, written as a signed, hash-chained change log in
        an open, specified format. (We walked one note through that machine,
        byte by byte, in
<a href="/blog/the-loom-you-can-read">The Loom You Can Read</a>.)
        The <a href="/docs/protocol/overview">protocol specification</a>
contains one sentence we are prouder of than most of the features it
        governs: it defines the data — the nodes, the signatures, the
        replication, the authorisation — and then states that it
<em>“deliberately does not specify how an implementation stores,
        indexes, queries, or renders that data.”</em> Read that as the legal
        text of this essay’s thesis. The spec constitutionally cannot
        contain an app. Apps are views; the boundary is normative.
</p> <p>
Above that ground, the view layer is plural on purpose. The same
        store of nodes renders as a table, a board, a list, a gallery, a
        calendar, a timeline — interchangeable lenses registered over the
        same data, switchable at runtime, with form and canvas surfaces
        alongside. The tasks app is a live query over task nodes; the CRM is
        a live query over contacts and deals; the finance view over accounts
        and entries. Zhao’s sentence — change the data, and every view
        updates instantly — isn’t an aspiration we endorse; it is literally
        how the subscription layer works:
</p> ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": twoViews, "caption": "Not a metaphor: one signed change appended to the log, and every subscribed view re-renders. The views never talk to each other \u2014 they have nothing to say. The data is the conversation." })} <p>
Now the pod lessons, one by one. <strong>The schema problem</strong>
we answer not with a grand shared ontology — that’s the mistake the
        semantic desktop died of — but by making disagreement cheap. Schemas
        are published and versioned; a view that wants yesterday’s shape and
        a view that wants tomorrow’s can both read the same nodes through a
<em>lens</em> — a small, bidirectional treaty that translates at read
        time:
</p> ${renderComponent($$result2, "CodeFigure", $$CodeFigure, { "code": lensCode, "filename": "task-lens.ts", "caption": "The schema problem, answered in mechanism rather than committee. Lenses translate between schema versions at read time; overlays and sidecars let a user or plugin extend a shape without forking anything. Two views can disagree about what a task looks like, and both keep working." })} <p> <strong>The shadow-vault problem</strong> we answer by making the
        query layer part of the substrate, not each app’s private burden — a
        view subscribes to a query and gets liveness for free, so no view
        needs to keep its own copy of your life to be fast. <strong>The
        adoption problem</strong> we answer the local-first way: nobody is
        asked to want a substrate. You use an app that is good on day one,
        and the substrate is simply the floor it stands on — your data lands
        in the open store from the first keystroke. And <strong>the trust
        problem</strong> — a view is still code, and code can be hostile —
        was the subject of
<a href="/blog/the-workshop-and-the-walled-garden">the previous
        essay</a>: every view declares what it can see and touch in a
        capability manifest, and the declaration is enforced at the store,
        not requested politely.
</p> <p>
One more receipt, because it’s the kind that only shows up when the
        architecture is real. We recently converged our web and desktop
        canvas — two separately grown implementations — onto a single shared
        core. The interesting number is what was left over: a few hundred
        lines of platform shell each. When the app is genuinely a view, that
        is all an “app” turns out to be — a thin pane of platform glass in
        front of a lens in front of your data. The other four-fifths of the
        code was the view itself, and the view didn’t care whose window
        frame it was mounted in.
</p> ${renderComponent($$result2, "HonestVault", $$HonestVault, {})} <h2>The heirloom inversion</h2> <p>
Everything to this point could have been written last year, or five
        years ago; most of it, as we’ve seen, <em>was</em>. Here is the part
        that couldn’t.
</p> <p>
Every previous attempt at apps-as-views had to argue against
        economics: the vault was where the money was, so the inversion
        stayed a research programme. What changed is the cost of the view.
        A bespoke interface over well-shaped data — the thing that used to
        be a funded team’s quarter — is becoming an evening with an AI
        that can read a schema. We wrote about what that does to
<em>making</em> software in the last essay. What it does to the
<em>economics of holding data</em> is this essay’s closing argument:
        when views are cheap, views stop being the moat. You cannot charge
        rent on a lens anyone can grind in an evening. The only thing left
        to charge rent on is custody of the data itself — and custody-rent
        has a name, and the name is a hostage fee, and everyone can see it
        once the interface stops justifying it.
</p> <p>
Zhao, in the Rhizome proposal, called the endgame years before the
        model prices made it obvious: <em>“Companies of the future should
        derive value from the intelligence they provide on top of existing
        data rather than have the value be just the data.”</em> That is, we
        think, exactly where this settles. Software keeps getting paid for —
        for insight, for craft, for reliability, for taste — but the data
        under it stops being the collateral. Views become
<strong>disposable</strong>: generated, used for a season, regenerated
        better. And the data becomes the opposite of disposable. The store of
        nodes that accumulates your projects and notes and numbers and
        correspondence, in an open format, under your keys, on your device,
        for decades — the right word for that is <strong>heirloom</strong>.
        Heirlooms don’t live in other people’s vaults. They live in your
        house, and you decide which windows to cut.
</p> <h2>Ask for more windows</h2> <p>
A vault and a view are both, in the end, answers to the same
        question: <em>how should you get to look at what’s yours?</em> The
        vault answers: through our window, on our hours, for as long as we’re
        in business. The view answers: it’s your house. The light is yours.
        The walls are wherever you want them, and a new window is an
        afternoon’s work — more light, same rooms, nothing moved.
</p> <p>
The lineage this essay walked — Codd’s independence, Verborgh’s
        pods, Kleppmann’s local-first, Zhao’s neutrality, Jansen’s flag — is
        five decades of people insisting, against the architecture of their
        day, that the data is the ground and the software is the weather. We
        built xNet because we think they were right, and because the tools
        finally exist to be right <em>in production</em>. If you want to
        stand on the ground floor: <a href="/app">use the app</a> — your
        data lands in the open store from the first keystroke. If you build
        things, <a href="/build-with">build a view</a> on the open protocol
        and see how little an “app” needs to be. And if you take one
        sentence from the whole essay, take the deal it proposes: <strong>let
        the apps be weather. Own the ground.</strong> </p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li>
The lineage:
<a href="https://dl.acm.org/doi/10.1145/362384.362685" rel="noopener noreferrer">
E.&nbsp;F. Codd, <em>A Relational Model of Data for Large Shared
            Data Banks</em></a> (1970);
<a href="https://ruben.verborgh.org/blog/2017/12/20/paradigm-shifts-for-the-decentralized-web/" rel="noopener noreferrer">
Ruben Verborgh, <em>Paradigm shifts for the decentralized
            Web</em></a> (2017);
<a href="https://www.inkandswitch.com/essay/local-first/" rel="noopener noreferrer">
Ink &amp; Switch, <em>Local-first software</em></a> (2019);
<a href="https://jzhao.xyz/posts/towards-data-neutrality/" rel="noopener noreferrer">
Jacky Zhao, <em>Towards Data Neutrality</em></a> (Reboot, 2022) and the
<a href="https://jzhao.xyz/thoughts/Rhizome-Proposal" rel="noopener noreferrer">
Rhizome proposal</a>;
<a href="https://gui.do" rel="noopener noreferrer">
Guido X Jansen, <em>Apps as Views, Not Vaults</em></a> (2026).
</li> <li>
The autopsy, much of it first-party:
<a href="https://solidlabresearch.github.io/WhatsInAPod/" rel="noopener noreferrer">
SolidLab, <em>What’s in a Pod?</em></a> (Solid’s own researchers on why pod apps failed to interoperate);
<a href="https://blog.ldodds.com/2024/03/12/baffled-by-solid/" rel="noopener noreferrer">
Leigh Dodds, <em>Confused by SOLID</em></a> (2024);
<a href="https://moxie.org/2022/01/07/web3-first-impressions.html" rel="noopener noreferrer">
Moxie Marlinspike, <em>My first impressions of web3</em></a> (2022);
<a href="https://newsletter.squishy.computer/p/redecentralization" rel="noopener noreferrer">
Gordon Brander, <em>Redecentralization</em></a>.
</li> <li>
Fellow travellers:
<a href="https://atproto.com/" rel="noopener noreferrer">
the AT Protocol</a> (user-owned repositories, lexicon schemas, app-view indexers —
          the tradeoffs made in the open);
<a href="https://stephango.com/file-over-app" rel="noopener noreferrer">
Steph Ango, <em>File over app</em></a>; and the cautionary shelf — WinFS, OpenDoc, the semantic
          desktop — for what happens when the ontology arrives before the
          software.
</li> <li>
The machinery and the receipts:
<a href="/docs/protocol/overview">the xNet protocol
          specification</a> (which specifies the data and deliberately not
          the apps), <a href="/blog/the-loom-you-can-read">The Loom You Can
          Read</a> (one note walked through the signed change log),
<a href="/blog/the-workshop-and-the-walled-garden">The Workshop and
          the Walled Garden</a> (what scoped views make possible, and how
          they’re bounded), and
<a href="/blog/the-right-to-say-no">The Right to Say No</a>
(leaving as a supported act).
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>This is an independent essay. The writers and projects cited are
          summarized as commentary; xNet is not affiliated with or endorsed
          by them. Quotations are verbatim from the linked originals;
          product histories are compressed — follow the citations for the
          fuller, messier versions. The lens excerpt is trimmed for reading;
          the field names match the real source. All artwork here is
          original.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "the-vault-and-the-view" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/the-vault-and-the-view.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/the-vault-and-the-view.astro";
const $$url = "/blog/the-vault-and-the-view";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$TheVaultAndTheView,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
