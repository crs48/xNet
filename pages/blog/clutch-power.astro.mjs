import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$BrickArt } from '../../chunks/BrickArt_tH-4V9S7.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { $ as $$Mermaid } from '../../chunks/Mermaid_D1Kl_hLV.mjs';
import { $ as $$CodeFigure } from '../../chunks/CodeFigure_F2M_f7y-.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$BrickHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$BrickHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#080d1a]"> ${renderComponent($$result, "BrickArt", $$BrickArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sky-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 font-mono lowercase text-sky-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/BrickHero.astro", void 0);

const $$HonestBrick = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      isnt: "We won\u2019t pretend revocation can reach into the past.",
      is: "Once someone has read a piece of data, they have it \u2014 decryption is copying, and no protocol can un-show something. Revoking a grant stops every future change from reaching them; it cannot repossess what they already saw. Anything that promised more would be DRM wearing a nicer coat, and the grip is deliberately not a weld."
    },
    {
      isnt: "We won\u2019t pretend a shared namespace makes people agree.",
      is: "Two apps sharing a Contact still have to agree on what a contact is, and that agreement is social, not technical \u2014 the Semantic Web spent a decade proving it. Lenses, overlays, and sidecars make disagreement cheap enough to live with; they don\u2019t make coordination free. Anyone can mint a schema, which also means anyone can mint a duplicate."
    },
    {
      isnt: "We won\u2019t pretend a frozen interface maintains itself.",
      is: "LEGO froze one moulding geometry and iterates everything else; a protocol pays for that promise continuously. When we hardened one detail of our merge rule, the change rippled through every conformance kernel and golden vector we keep. Backwards compatibility is a standing engineering bill, not a patent you file once."
    },
    {
      isnt: "We won\u2019t pretend a general-purpose substrate is fast for free.",
      is: "A silo optimises for exactly one access pattern; a store that must answer any question about any shape pays a tax the silo never sees. Making the open substrate feel app-fast has taken months of unglamorous query and hydration work, and that ledger is still open."
    },
    {
      isnt: "We won\u2019t pretend nobody has to run anything.",
      is: "Moxie Marlinspike is right that people do not want to run their own servers. Your replica is primary and local, and peers can sync directly \u2014 but an always-reachable relay is what makes sharing feel instant, and someone hosts and pays for it. Ours is optional and replaceable; it is not imaginary."
    },
    {
      isnt: "We won\u2019t pretend permissions solve moderation or discovery.",
      is: "Access control decides who may read and write; it says nothing about what deserves an audience. Spaces give every community its own table and its own rules, which works at the scale of a table \u2014 network-scale discovery, spam, and abuse in a world with no central operator remain honestly unsolved, here and everywhere."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
Where the metaphor stops
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
Six things a universal coupling cannot do, conceded in plain sight —
      because the essays that skip this section are the ones you were right
      not to trust.
</p> <ul class="mt-6 space-y-5"> ${rows.map((row) => renderTemplate`<li class="grid gap-3 sm:grid-cols-[1fr_1.3fr] sm:gap-5"> <div class="flex gap-2.5"> <span class="select-none text-gray-400 dark:text-gray-600">✕</span> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${row.isnt}</p> </div> <div class="flex gap-2.5"> <span class="select-none text-sky-500">✓</span> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.is}</p> </div> </li>`)} </ul> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HonestBrick.astro", void 0);

const $$ClutchPower = createComponent(async ($$result, $$props, $$slots) => {
  const post = postBySlug("clutch-power");
  const kw = (s) => `<span class="tok-keyword">${s}</span>`;
  const st = (s) => `<span class="tok-string">${s}</span>`;
  const cm = (s) => `<span class="tok-comment">${s}</span>`;
  const composeCode = [
    `${cm("// Their brick: a Contact someone else created and governs.")}`,
    `${cm("// Your stud: a field in your own namespace, riding on the")}`,
    `${cm("// node itself \u2014 syncing and merging like any other property.")}`,
    `${kw("await")} update(ContactSchema, contact.id, {`,
    `  [extKey(${st("'acme.example'")}, ${st("'leadScore'")})]: 42`,
    `})`,
    ``,
    `${cm("// Your private brick on their public one: a sidecar \u2014 a")}`,
    `${cm("// separate node with its own permissions (they never see it),")}`,
    `${cm("// addressed deterministically so every device finds the same one.")}`,
    `${kw("await")} create(ContactNotes, {`,
    `  target: contact.id,  ${cm("// relation \u2192 any node, any schema")}`,
    `  body: ${st("'Prefers the 1958 catalogue. Buys in bulk.'")}`,
    `}, sidecarId(me.did, contact.id))`
  ].join("\n");
  const coupling = `flowchart TB
  subgraph couplingBlock["The coupling \u2014 frozen, specified, versioned"]
    N["one node shape<br/>id \xB7 schemaId \xB7 createdAt \xB7 createdBy"]
    IRI["one namespace<br/>xnet://authority/Name@version<br/>(the authority can be you)"]
    LWW["one merge rule<br/>signed change log,<br/>deterministic fold"]
    AUTHZ["one permission algebra<br/>roles \xB7 actions \xB7 grants,<br/>enforced where data moves"]
  end
  subgraph bricks["The bricks \u2014 open-ended"]
    T["a task"]
    C["a contact"]
    M["a message"]
    X["your field on<br/>someone else's node"]
    S["your private notes<br/>on their data"]
    F["an imported silo<br/>(CSV, Slack, feeds)"]
  end
  subgraph players["The players"]
    APP["apps \u2014 views<br/>(the previous essay)"]
    AGT["agents \u2014 same table,<br/>same rules"]
    PPL["people \u2014 names you mint,<br/>links you hand over"]
  end
  bricks -->|snap onto| couplingBlock
  players -->|"play, where permitted"| couplingBlock`;
  const gripNotWeld = `sequenceDiagram
  participant O as Owner
  participant R as Relay
  participant G as Guest
  O->>O: creates a node \u2014 encrypted,<br/>its key wrapped per recipient
  O->>R: publishes the signed change
  Note over R: Guest holds no grant \u2192<br/>nothing is relayed.<br/>No key \u2192 the brick doesn't snap.
  O->>G: hands over a share link<br/>(the secret rides in the URL fragment,<br/>which no server ever receives)
  G->>R: claims it \u2014 a delegation,<br/>attenuated to read-only
  R-->>G: changes for that one resource
  G->>G: unwraps the key. The brick snaps.
  O->>O: revokes the grant
  Note over G: future changes stop arriving.<br/>What was already read is already copied \u2014<br/>a grip, not a weld.`;
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "BrickHero", $$BrickHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-sky-600 dark:prose-a:text-sky-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
On the 28th of January, 1958, Godtfred Kirk Christiansen walked into
        the Danish patent office and filed for protection of a small plastic
        brick. The brick was not new — his family’s company had been moulding
        studded bricks for nearly a decade, and other firms moulded similar
        ones. What was new was underneath: hollow tubes, set so that the studs
        of the brick below would grip them from three sides. The filing
        protected a <em>coupling</em>, not a block. The company came to call
        the property it created <strong>clutch power</strong> — enough
        friction that a model holds together in a child’s hands, little
        enough that the same hands can take it apart, no tools, no
        permission slip, no breakage.
</p> <p>
Two consequences followed, and they built one of the most beloved
        systems of objects on Earth. The first is the famous one:
<strong>everything combines</strong>. A brick from the space set
        snaps to a brick from the castle set, because sets are a marketing
        fiction and the coupling is the product. The geometry has not
        changed since the filing, which is why a brick moulded in 1958 still
        seats perfectly on one moulded this year — sixty-eight years of
        parts, one interface. The second consequence is quieter, and it is
        the one this essay is actually about: <strong>everything comes
        apart</strong>. The coupling grips; it does not weld. Your bricks
        remain yours — recombinable, refusable, removable — <em>after</em>
every combination you make.
</p> <p>
Now look at your data. Your notes are in one company’s set, your
        messages in another’s, your contacts copied inconsistently into
        five more. None of it snaps together, because the web never
        standardised a coupling for data — every app moulds pieces that fit
        only its own kit, and calls the kit a product. This essay is about
        what a coupling for data would even mean, why every previous attempt
        shipped half of one, and how <a href="/">xNet</a> builds both halves:
        the snap, <em>and</em> the grip that lets go.
</p> <h2>The bin we never got</h2> <p>
Anyone who grew up with bricks knows the bin: the big box where
        every set eventually goes, out of which anything can be built. The
        web promised us a bin and delivered a shelf of sealed boxes. It’s
        worth being precise about how, because we tried three different
        lids.
</p> <p>
The first era simply denied the bin. The application owned its
        data outright — its schema, its servers, its screens — and the only
        universal connector on the entire web was copy and paste. (The
        previous essay, <a href="/blog/the-vault-and-the-view">The Vault and
        the View</a>, walked through how that fusion became the business
        model; we won’t re-argue it here.)
</p> <p>
The second era promised the bin and kept the keys. In August 2004,
        Flickr shipped a public API, and for a few giddy years “mashups”
        were the web’s favourite word — data from one service recombined
        with another’s into things neither had planned. It felt like
        composability. It was actually a <strong>drawbridge</strong>:
        access at the platform’s pleasure, revocable at the platform’s
        convenience. And when the platforms worked out that the data behind
        the drawbridge was the asset, up it came. Facebook shut its
        friends-data API on the 30th of April, 2015. Twitter ended free API
        access in February 2023 with roughly a week’s notice, stranding a
        decade’s ecosystem of clients and tools. Reddit repriced its API
        that same year at rates that would have cost Apollo — the beloved
        third-party client one developer had spent a decade polishing —
        millions of dollars a month; Apollo died on schedule, and thousands
        of communities went dark in protest, which changed nothing. The
        lesson generalises: <em>an API is not a coupling. A coupling is a
        property of the pieces. An API is a property of the landlord.</em> </p> <p>
The third era tried to legislate the bin. Europe’s GDPR grants you a
        right to data portability; it does not grant you a format, so in
        practice the right is a ZIP file — technically yours, parseable by
        nothing you own. Below the law, the market priced the missing
        coupling with unusual honesty: an entire industry (Mint, then
        Plaid) was built on users <em>handing over their bank passwords</em>
so software could impersonate them and scrape their own balances
        out of HTML, because no first-class way existed for you to hand a
        program a scoped, revocable slice of your own records. Billions of
        dollars, for want of a stud.
</p> <p>
None of this was for lack of vision. Ted Nelson sketched a universal
        docuverse from 1960 and spent five decades not shipping it. Apple’s
        OpenDoc imagined documents as bins of snap-together parts and died
        in 1997, because it required every vendor to re-mould their
        software around a shared coupling the platform incumbent had no
        reason to bless. The Semantic Web imagined the whole web as
        machine-composable data and stalled on the economics of agreement —
        by 2006 even Tim Berners-Lee was steering the project away from
        grand ontologies towards plain linked data. The pattern across all
        three: <strong>a universal namespace without a shipped substrate is
        a manifesto</strong>, and a substrate without a permission model is
        a strip mine. Sixty years of proposals shipped one half or the
        other. The interesting question was always both.
</p> <h2>The coupling</h2> <p>
So what is the stud-and-tube of data? When we distilled xNet’s
        protocol down to what an independent implementation must honour —
        the way the 1958 filing distilled a toy down to the geometry that
        mattered — it came to four frozen interfaces. Everything else is
        deliberately unfrozen.
</p> <p> <strong>One node shape.</strong> Every piece of data in xNet — a
        task, a contact, a paragraph, a ledger entry, a chess move — is a
        node with exactly four universal fields: an id, a schema reference,
        a creation time, and the cryptographic identity of its author.
        That’s the entire footprint. Everything else about a node is
        declared by its schema, the way everything about a brick beyond its
        coupling — colour, height, whether it’s a wheel or a window — is
        free to vary.
</p> <p> <strong>One namespace.</strong> Every schema has a name of the form
<code>xnet://authority/Name@version</code> — and the authority can
        be our registry, someone’s domain, or <em>any cryptographic
        identity at all</em>. <code>xnet://did:key:z6Mk…/Recipe@1.0.0</code>
is a real, resolvable schema name minted by an individual person,
        no committee, no application form. The built-in catalogue ships
        dozens of schemas — pages, tasks, a full CRM, double-entry
        accounts, channels and messages, canvases, maps — but the
        catalogue holds no privileged position in the namespace. Anyone can
        mould new parts, and the parts carry their maker’s name.
</p> <p> <strong>One merge rule.</strong> Every mutation is a signed,
        hash-chained change record, and any two replicas that hold the same
        changes fold them into byte-identical state — deterministically,
        with no server as referee. We walked one note through that machine
        in <a href="/blog/the-loom-you-can-read">The Loom You Can Read</a>;
        the point here is only that the fold is <em>part of the
        coupling</em>. Sync is not a feature of some app; it is a property
        of the pieces, the way clutch power is in the plastic and not in
        the instruction booklet.
</p> <p> <strong>One permission algebra.</strong> The fourth interface is the
        essay’s second act, so we’ll hold it a moment — but it belongs on
        the list, and the placement is the argument.
</p> ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": coupling, "caption": "The whole design, one picture. Four interfaces are frozen and specified; bricks and players multiply freely on top. The protocol spec defines the coupling and deliberately refuses to define the apps." })} <p>
What snaps on, once the coupling exists? First, <strong>data snaps
        to data</strong>. Any node can hold a relation to any other node,
        of any schema, made by anyone — so a CRM deal can point at the chat
        thread where it was negotiated, which points at the meeting note,
        which points at the contact, and no product manager anywhere
        approved the combination. In the silo world each of those links is
        an integration, a partnership, a roadmap item. On a shared coupling
        each is just… a stud.
</p> <p>
Second — and this is where it gets properly LEGO —
<strong>you can build on bricks you don’t own.</strong> Suppose a
        colleague shares a contact with you. You want a
<code>leadScore</code> field; she doesn’t. You extend her node with
        a field in <em>your</em> namespace — an overlay, riding on the node
        itself, syncing and merging like any core property, no fork, no
        vendor ticket. And if what you want to add shouldn’t be visible to
        her at all — your private notes on her contact — you attach a
<em>sidecar</em>: a separate node that references hers but carries
<em>its own</em> permissions. Here is the real shape of both moves:
</p> ${renderComponent($$result2, "CodeFigure", $$CodeFigure, { "code": composeCode, "filename": "someone-elses-contact.ts", "caption": "Composition across an ownership boundary. The overlay lives in your namespace on their node; the sidecar is your node about their node, private to you. Nobody asked anybody. Nothing forked. (Trimmed for reading; the helpers and their outputs match the real source.)" })} <p>
Third, <strong>the coupling holds across time</strong>. Within a
        schema version, changes must be additive, and every implementation
        is required to carry fields it doesn’t recognise rather than drop
        them — so last year’s client and next year’s client edit the same
        document without either corrupting the other. Across breaking
        versions, bidirectional lenses translate at read time (the previous
        essay showed one in full). This is the discipline the brick teaches:
        backwards compatibility is not sentimentality, it is what makes a
<em>collection</em> possible. A datum you created in xNet’s first
        year is a 1958 brick — it seats on everything we mould later,
        because the spec makes breaking the seat a violation, not a
        release note.
</p> <p>
And fourth, <strong>the players multiply</strong>. Apps become
        interchangeable views — that inversion had its own essay. Developers
        get the whole substrate as
<a href="/blog/the-tip-of-the-hook">a couple of React hooks</a>, and
        third-party code plays inside capabilities it declares up front —
<a href="/blog/the-workshop-and-the-walled-garden">the workshop
        rules</a>. But
        the newest player at the table is the one the silo era simply cannot
        seat: <strong>the agent</strong>. Your workspace exposes itself to
        any AI tool speaking the open model-context protocol — which means
        an assistant can query your tasks, cross-reference your contacts,
        and draft into your pages <em>through the same coupling, under the
        same permission checks, visible in the same audit trail</em> as any
        human collaborator. In the silo world, giving an AI your data means
        uploading your life into yet another vault. On a coupling, the
        agent comes to the bricks, plays with exactly the ones it’s
        handed, and leaves fingerprints.
</p> <h2>Who gets to play</h2> <p>
Every “LEGO for software” essay ever written stops at the snap. But
        ask an actual child the governing question of the actual toy and
        you will not hear a question about combination. You will hear:
<em>whose bricks are these, and who said you could touch them?</em>
The toy works socially because possession is legible and physical —
        your bricks are in your room. The moment data syncs, possession
        stops being physical, and the question has to be answered in the
        architecture or it is answered by whoever holds the servers. We
        have spent this entire series on what that second answer costs.
</p> <p>
So xNet answers it in the architecture, three ways at once.
</p> <p> <strong>The rules ride on the data.</strong> Authorisation in xNet
        is not middleware in some app — it is declared on the schemas and
        nodes themselves, as data: which roles exist, how a subject earns
        one, which of seven actions (<code>read</code>, <code>create</code>,
<code>update</code>, <code>write</code>, <code>delete</code>,
<code>share</code>, <code>admin</code>) each role may take, with
        deny beating allow on every conflict. Because the rules are data,
        they sync like data, and every honest implementation — ours, yours,
        a stranger’s — is required by the spec to reach the <em>identical</em>
allow-or-deny decision on the same graph. Google proved this shape
        of permission system at planetary scale years ago, inside its own
        fence — relationship checks over trillions of sharing rules,
        millions of times a second, across Drive and Photos. The open question was whether the same discipline could
        exist with <em>nobody owning the fence</em>. Making the decision
        semantics a conformance requirement — golden test vectors and all —
        is our answer.
</p> <p> <strong>Handing over bricks is delegation, not surrender.</strong>
When you grant access, the grant is itself a node — who, what,
        which actions, until when — and it can carry a capability token
        that the grantee can <em>attenuate</em> but never amplify: you hand
        a contractor read access to one project, the contractor hands her
        assistant read access to one document, and at no link in the chain
        can anyone mint themselves more than they were given. Three bricks,
        not the crate. A share link is the same machinery folded into a
        URL, with one lovely detail: the secret lives in the link’s
        fragment — the part after the <code>#</code> that browsers never
        transmit — so the relay that delivers your data cannot read the
        key that unlocks it.
</p> <p> <strong>And underneath both, the snap itself is cryptographic.</strong>
Content is end-to-end encrypted with its key wrapped per recipient;
        the relay authorises every subscription and every publish before
        forwarding, but even a malicious relay is holding bricks it cannot
        seat. For a party without the key and without a grant, your data
        doesn’t merely refuse politely. It doesn’t couple. There is nothing
        to play with.
</p> ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": gripNotWeld, "caption": "The whole permission story in one exchange \u2014 including the last beat, which most systems whisper and we would rather say out loud: revocation governs the future, never the past." })} <p>
Put the two halves together and something inverts that the silo era
        trained us to stop noticing. In a silo, every datum you add deepens
<em>the platform’s</em> moat — your photos make their album
        stickier, your contacts fatten their graph. On a shared coupling,
        every datum you add makes <em>your</em> bin more generative: the
        new contact enriches your CRM view <em>and</em> your chat mentions
<em>and</em> whatever view you or your favourite agent builds next
        spring. Network effects don’t disappear. They change beneficiary.
        The compound interest on your own records finally accrues to you.
</p> ${renderComponent($$result2, "HonestBrick", $$HonestBrick, {})} <h2>The weld and the grip</h2> <p>
There is a version of this essay that ends with everything
        connecting to everything, and we don’t believe in it. The box above
        is the reason: a coupling cannot make people agree, cannot repossess
        a secret, cannot moderate a network into kindness, cannot make
        hosting free. What a coupling can do — the only thing it can do,
        and it is enough — is change what kind of thing your data
<em>is</em>: from contents of someone’s set to pieces in your bin.
</p> <p>
The deep insight of 1958 was that the two properties everyone wants
        from their pieces — <em>holds together</em> and <em>comes
        apart</em> — are not in tension. They are the same property, tuned.
        Too little friction and nothing you build survives being picked up.
        Too much and it isn’t a construction toy any more; it’s a weld, a
        sculpture, a thing you were sold that only pretends to be yours.
        The entire silo era, seen from this angle, was a weld sold as a
        toy: your data holds together beautifully — inside the set, with
        the set’s pieces, until the set is discontinued.
</p> <p>
We built the other tuning. One node shape, one namespace anyone can
        mint into, one merge rule, one permission algebra — friction enough
        that what you build holds, and every brick still lifts off in your
        hand: shareable to exactly whom you choose, extendable by people
        you’ve never met, revocable tomorrow, and yours in the only sense
        that has ever mattered with bricks — <em>in your possession,
        combining at your pleasure</em>. If you want to start filling the
        bin, <a href="/app">the app is here</a>, and your first note lands
        as an open, signed, schema-typed node before you’ve thought about
        any of this. If you build software,
<a href="/build-with">mint a schema</a> and mould the part we
        didn’t think of — the catalogue has no gatekeeper. That’s the offer,
        and the whole of it: <strong>bricks, not sets. Grip, not weld. And
        nobody plays with yours unless you say so.</strong> </p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li>
The coupling: the LEGO Group’s own history of
<a href="https://www.lego.com/en-us/history/articles/d-the-stud-and-tube-principle" rel="noopener noreferrer">
the stud-and-tube principle</a> (patent filed 28 January 1958), and the sceptic’s corrective we
          took to heart —
<a href="https://safetydave.net/lego-as-a-metaphor-for-software-reuse-does-the-data-stack-up/" rel="noopener noreferrer"> <em>LEGO as a Metaphor for Software Reuse — Does the Data Stack
            Up?</em></a> (2021), which argues the metaphor only works if the interface is
          actually frozen. Agreed; hence the conformance suite.
</li> <li>
The drawbridge era:
<a href="https://techcrunch.com/2015/04/28/facebook-api-shut-down/" rel="noopener noreferrer">
Facebook’s friends-data API shutdown</a> (2015);
<a href="https://www.engadget.com/twitter-shutting-off-free-api-prepare-174340770.html" rel="noopener noreferrer">
Twitter ending free API access</a> (2023);
<a href="https://techcrunch.com/2024/02/09/social-network-api-apps-twitter-reddit-threads-mastodon-bluesky/" rel="noopener noreferrer">
TechCrunch on the platforms closing ranks</a> (2024); the Reddit repricing that killed Apollo (2023);
<a href="https://www.bai.org/banking-strategies/from-screen-scraping-to-open-banking/" rel="noopener noreferrer">
the screen-scraping years of financial data</a>; and
<a href="https://academic.oup.com/idpl/article-abstract/9/3/173/5529345" rel="noopener noreferrer">
GDPR data portability in practice</a>.
</li> <li>
The half-couplings: Ted Nelson’s
<a href="https://en.wikipedia.org/wiki/Project_Xanadu" rel="noopener noreferrer">
Project Xanadu</a>;
<a href="https://instadeq.com/blog/posts/why-opendoc-failed-and-then-failed-3-more-times/" rel="noopener noreferrer">
why OpenDoc failed</a>; Berners-Lee’s
<a href="https://www.w3.org/DesignIssues/LinkedData.html" rel="noopener noreferrer">
Linked Data note</a> (the 2006 course-correction);
<a href="https://docs.bsky.app/docs/advanced-guides/atproto" rel="noopener noreferrer">
the AT Protocol’s lexicon namespace</a> — the closest shipped cousin, public-by-default while
<a href="https://github.com/bluesky-social/proposals/blob/main/0011-auth-scopes/README.md" rel="noopener noreferrer">
private data remains a proposal</a> — and
<a href="https://en.wikipedia.org/wiki/Google_Zanzibar" rel="noopener noreferrer">
Google Zanzibar</a> (USENIX 2019), fine-grained sharing proven at scale, inside one
          company’s fence.
</li> <li>
The machinery and the receipts:
<a href="/docs/protocol/overview">the xNet protocol
          specification</a> (the four interfaces, their conformance vectors,
          and the schema-evolution rules),
<a href="/blog/the-loom-you-can-read">The Loom You Can Read</a>
(the merge rule, byte by byte),
<a href="/blog/the-tip-of-the-hook">The Tip of the Hook</a> (the
          developer surface),
<a href="/blog/the-workshop-and-the-walled-garden">The Workshop
          and the Walled Garden</a> (how third-party <em>code</em> is
          scoped), and
<a href="/blog/the-vault-and-the-view">The Vault and the View</a>
(apps as views — this essay’s vertical twin).
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>This is an independent essay. LEGO® is a trademark of the LEGO
          Group, which does not sponsor, authorise, or endorse it — the
          bricks appear here as cultural reference, and all artwork on this
          page is original. Product histories are compressed; follow the
          citations for the fuller, messier versions. The code excerpt is
          trimmed for reading; the helper functions and their behaviour
          match the real source.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "clutch-power" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/clutch-power.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/clutch-power.astro";
const $$url = "/blog/clutch-power";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$ClutchPower,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
