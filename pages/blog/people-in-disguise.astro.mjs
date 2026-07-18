import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$DisguiseArt } from '../../chunks/DisguiseArt_BRUx6vM4.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { $ as $$WatchTheOriginal } from '../../chunks/WatchTheOriginal_DYK7Zf8J.mjs';
import { $ as $$CodeFigure } from '../../chunks/CodeFigure_F2M_f7y-.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$DisguiseHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$DisguiseHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#080611]"> ${renderComponent($$result, "DisguiseArt", $$DisguiseArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-violet-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 font-mono lowercase text-violet-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/DisguiseHero.astro", void 0);

const $$HonestDisguise = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      isnt: "We won\u2019t imply Jaron Lanier endorses xNet.",
      is: "He has never mentioned it, and we have never spoken to him. What this essay does is mark our own homework against his public writing \u2014 a spec anyone can read \u2014 and show the receipts. Convergence is the claim; association is not."
    },
    {
      isnt: "We won\u2019t pretend we built his whole programme.",
      is: "Data dignity, as he and Glen Weyl wrote it, has two halves: inalienable provenance and a market that pays royalties on your data. We built the first half and deliberately refused the second. That refusal is argued in the essay, partly with his own exemption for direct-payment models \u2014 but it is a refusal, and he might well not accept it."
    },
    {
      isnt: "We won\u2019t pretend his critics are wrong about everything.",
      is: "The micropayment sums look trivially small for most people; a data market can legitimise the very harvesting it prices; the \u201CDigital Maoism\u201D essay swung at some collaboration that plainly does have authors. Those critiques are part of why we built the half we built. The famous Kodak-versus-Instagram comparison is his framing of a real shift, not settled economics \u2014 economists have pushed back hard on it."
    },
    {
      isnt: "We won\u2019t pretend to be bystanders.",
      is: "xNet sells a managed cloud tier and metered AI, so we profit when you pay us \u2014 the same insider tension he carries at Microsoft. The defence is structural, not rhetorical: the meter charges for what you actually use \u2014 with the margin modelled in the open in the repository\u2019s own cost tests \u2014 the master copy stays on your device, and the export door means leaving loses nothing. Judge the receipts, not the essay."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
Honest provenance
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
A portrait that flatters its painter is an advert. Here is the honest scope.
</p> <ul class="mt-6 space-y-5"> ${rows.map((row) => renderTemplate`<li class="grid gap-3 sm:grid-cols-[1fr_1.3fr] sm:gap-5"> <div class="flex gap-2.5"> <span class="select-none text-gray-400 dark:text-gray-600">✕</span> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${row.isnt}</p> </div> <div class="flex gap-2.5"> <span class="select-none text-violet-500">✓</span> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.is}</p> </div> </li>`)} </ul> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HonestDisguise.astro", void 0);

const $$PeopleInDisguise = createComponent(($$result, $$props, $$slots) => {
  const post = postBySlug("people-in-disguise");
  const cm = (s) => `<span class="tok-comment">${s}</span>`;
  const ty = (s) => `<span class="tok-type">${s}</span>`;
  const kw = (s) => `<span class="tok-keyword">${s}</span>`;
  const changeCode = [
    `${cm("// packages/sync/src/change.ts \u2014 every edit you make becomes one of")}`,
    `${cm("// these. Note what a change cannot be: anonymous, or unsigned.")}`,
    `${cm("/** Content-addressed hash of this change */")}`,
    `${ty("hash")}: ${kw("ContentId")}`,
    `${cm("/** Hash of the previous change in the chain (null for first) */")}`,
    `${ty("parentHash")}: ${kw("ContentId")} | ${kw("null")}`,
    `${cm("/** DID of the author */")}`,
    `${ty("authorDID")}: ${kw("DID")}`,
    `${cm("/** Ed25519 signature of the hash */")}`,
    `${ty("signature")}: ${kw("Uint8Array")}`
  ].join("\n");
  const works = [
    { year: "1995", title: "\u2018Agents of Alienation\u2019", claim: "you shrink yourself to make the agent look smart" },
    { year: "2010", title: "You Are Not a Gadget", claim: "lock-in: MIDI froze one instrument\u2019s idea of music" },
    { year: "2013", title: "Who Owns the Future?", claim: "siren servers harvest everything, keep the value" },
    { year: "2018", title: "Ten Arguments", claim: "feeds as behaviour modification, rented by the hour" },
    { year: "2023", title: "\u2018There Is No A.I.\u2019", claim: "the model is a mash-up of people \u2014 open the box" }
  ];
  const prescriptions = [
    "keep provenance (two-way links)",
    "no behaviour modification",
    "tools, not creatures \u2014 agents with names",
    "pay with money, not with yourself"
  ];
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "DisguiseHero", $$DisguiseHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-violet-600 dark:prose-a:text-violet-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
Before he was anything else, Jaron Lanier was a musician — the kind who
        collects instruments the way other people collect arguments. He owns
        hundreds of them, many rare, many ancient, and he has a habit of opening
        talks not with slides but with something like a khaen or an oud,
        played properly, while the audience recalibrates its idea of what a
        Microsoft scientist looks like. Keep the instruments in view. They are
        not a personality quirk decorating a technology critic; they are where
        the critique comes from.
</p> <p>
In the early 1980s, musicians and engineers settled on a protocol for
        connecting electronic instruments: MIDI. It was built around the
        gesture its designers had in front of them — a key on a keyboard, going
        down and coming up. Note on, note off. It shipped, it spread, and
        because everything then had to interoperate with everything else, it
        stuck. But a violinist does not play note-on, note-off. A voice slides
<em>between</em> the keys; that is where most of the music lives. A
        protocol built from one instrument’s idea of music became the box every
        instrument had to fit through — and forty years later, it still is.
        Lanier, who could hear exactly what the format dropped, made MIDI his
        life’s cautionary tale: digital systems freeze their designers’
        first guesses into infrastructure, and then the infrastructure quietly
        teaches everyone that the guess was the truth. He gave the pattern a
        name — lock-in — and a warning label that doubles as the thesis of
        everything he has written since: <em>“the most important thing about a
        technology is how it changes people.”</em> </p> <p>
This essay is about him — the forty-year argument he has been making
        from inside the machine, and what it means for what people like us
        should build. We wrote <a href="/blog/clutch-power">an essay two weeks
        ago</a> about the interfaces the web froze too early; this is the
        portrait of the man who heard it happen first, in music, and spent four
        decades warning the rest of us where it leads.
</p> <h2>The forty-year argument</h2> <p>
Most technology criticism dates badly, because most of it is about a
        product. Lanier’s does not, because his subject was never the product —
        it is what the product does to the person using it. Read his work
        chronologically and the same claim arrives every decade wearing new
        clothes.
</p> <p>
Start earlier than most retrospectives do. In 1995 — three decades
        before the current agent boom — he published a short essay called
<em>“Agents of Alienation”</em>, aimed at the era’s clippy-ish software
        agents. The argument was not that agents wouldn’t work. It was worse:
        that they work on <em>you</em>. An agent, he wrote, is <em>“a way of
        using a program, in which you have ceded your autonomy”</em> — and
        since the agent is dumber than you, you meet it in the middle. You
        simplify your requests, flatten your taste, learn its categories, and
        in his four bleakest words, <em>“you make yourself dumb”</em> so the
        agent can look smart. Hold that thought for later; 1995 is not done
        with us.
</p> <p>
By 2000 he had named the ideology he was against — <em>cybernetic
        totalism</em>, the belief that people are, in the end, nothing but
        information patterns — and in 2006, in the essay <em>“Digital
        Maoism”</em>, he attacked its collectivist cousin: the fashionable idea
        that an anonymous hive produces wisdom, and that authorship is a
        quaint inefficiency. In 2010 the argument became his manifesto,
<em>You Are Not a Gadget</em>: lock-in, MIDI, and the observation that
        the templated profile — the multiple-choice identity form — is a MIDI
        for personhood, shrinking what a person is until it fits the database.
<em>“You have to be somebody before you can share yourself,”</em> he
        wrote, and much of the decade since has been an experiment in what
        happens when the order is reversed.
</p> <p>
In 2013, <em>Who Owns the Future?</em> gave the economy of all this a
        name that stuck: <strong>siren servers</strong> — the elite computers
        that lure everyone into interacting for free, harvest the data,
        keep the proceeds, and push the risk back out to everyone else. His
        signature comparison: Kodak at its peak employed more than a hundred
        and forty thousand people; Instagram employed thirteen when it sold
        for a billion dollars. Economists have real objections to that framing
        — we will get to them — but the book’s deepest line is not the
        statistic. It is the ontological one: <em>“digital information is
        really just people in disguise.”</em> There is no such thing as data
        that came from nowhere. Every training set, every graph, every
        recommendation is congealed human effort with the names filed off.
</p> <p>
By 2018 he had stopped being polite about the mechanism.
<em>Ten Arguments for Deleting Your Social Media Accounts Right
        Now</em> introduced BUMMER — his acronym for the machine: “Behaviors of
        Users Modified, and Made into an Empire for Rent.” Advertising, he
        argued, had quietly become <em>“continuous behavior modification on a
        titanic scale”</em>: adaptive algorithms running intermittent
        reinforcement on billions of people, tuned by feedback, rented to
        whoever pays. And because negative emotion is cheaper to trigger than
        positive, the tuning has a direction: <em>“social media is biased, not
        to the Left or the Right, but downward.”</em> Note the precision of the
        target — it was never the internet, never the phone, never even the
        algorithm. It is the business model. Services you simply pay for are,
        in his telling, explicitly exempt.
</p> <p>
Then the models arrived, and the man who had spent thirty years being
        called a pessimist wrote the most level-headed essay of the boom. In
<em>“There Is No A.I.”</em> (The New Yorker, 2023) he refuses both
        available hysterias. The pragmatic position, he argues, is to
<em>“think of A.I. as a tool, not a creature”</em> — and to see the
        tool clearly: a large model is <em>“an innovative form of social
        collaboration”</em>, a mash-up of millions of people’s writing,
        drawing, and judgement. <em>“Big-model A.I. is made of people”</em> —
        and the way to govern it is not mystical alignment but the oldest
        tool in the librarian’s drawer: provenance. Keep track of where things
        came from. <em>“When you lose context, you lose control.”</em> He has
        kept at it since: a 2025 New Yorker essay on AI companions as the next
        behaviour-modification empire, and a 2026 university lecture arguing
        that provenance is not just fairness accounting but epistemic
        infrastructure — the thing that lets a society keep hold of what is
        real.
</p> <p>
He makes this argument, note, from the eleventh floor of the machine:
        he has been at Microsoft for nearly two decades, with the self-mocking title
        “Prime Unifying Scientist” in the CTO’s office, and a standing
        disclaimer that he speaks only for himself. You can read that as
        compromise. We read it the way he seems to: if the argument is that
        technology should be built differently, the place to make it is where
        technology gets built. It is also, we should say plainly, a tension —
        and one we share, further down this page.
</p> ${renderComponent($$result2, "WatchTheOriginal", $$WatchTheOriginal, { "href": "https://www.youtube.com/watch?v=a_ZKYH8v_do", "title": "Neil deGrasse Tyson and Jaron Lanier on the AI Illusion", "author": "StarTalk Plus", "length": "9 min" })} <figure class="not-prose my-10"> <div class="rounded-2xl border border-border bg-surface/30 p-5 dark:bg-surface/40 lg:p-7"> <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"> ${works.map((w) => renderTemplate`<li class="rounded-xl border border-border bg-surface/40 p-3 text-center dark:bg-surface/60"> <p class="font-mono text-xs text-violet-500 dark:text-violet-400">${w.year}</p> <p class="mt-1 text-sm font-semibold leading-snug text-gray-900 dark:text-white"> ${w.title} </p> <p class="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400"> ${w.claim} </p> </li>`)} </ul> <p class="my-3 text-center text-gray-400 dark:text-gray-600" aria-hidden="true">↓</p> <p class="mx-auto max-w-xl rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-center text-sm font-semibold leading-relaxed text-gray-900 dark:text-white">
One claim, five decades: technology changes people — so design for the people.
</p> <p class="my-3 text-center text-gray-400 dark:text-gray-600" aria-hidden="true">↓</p> <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"> ${prescriptions.map((p) => renderTemplate`<li class="rounded-lg border border-border px-3 py-2 text-center text-xs leading-relaxed text-gray-600 dark:text-gray-300"> ${p} </li>`)} </ul> </div> <figcaption class="mt-3 text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
Five decades, one claim. The books look like separate critiques — agents, lock-in,
          siren servers, feeds, models — until you notice they all exit through the same door.
</figcaption> </figure> <h2>The spec hidden in the critique</h2> <p>
Here is the thing about Lanier that separates him from most of the
        genre: underneath the criticism there is a buildable specification. He
        rarely writes “thou shalt not” without an engineering alternative
        attached, and if you collect the alternatives across the corpus they
        form a coherent design brief — one that has been sitting in plain
        sight, largely unimplemented, for decades.
</p> <p> <strong>Keep provenance.</strong> His favourite exhibit is Ted
        Nelson’s Project Xanadu, the 1960s hypertext design the web
        didn’t choose, in which every link ran <em>two ways</em>: content
        always knew where it had been used, and use always pointed back to
        origin. Attribution — and, Nelson hoped, payment — falls out of the
        architecture for free. The web’s one-way link made publishing
        gloriously cheap and made context evaporate; for Lanier this is the
        original sin behind everything from misinformation to the AI
        training-data fight. <strong>Don’t build siren servers</strong> —
        architectures whose economics require one privileged computer to see
        everything. <strong>Don’t do behaviour modification</strong> — no
        adaptive feed whose objective function is your future behaviour.
<strong>Sell things, not people</strong> — his exemption for
        direct-payment services is an instruction, not a loophole. And
<strong>keep agents on a leash with a name tag</strong> — a tool you
        direct, never an anonymous creature you defer to.
</p> <p>
We did not start from this list. xNet’s design brief came out of its
        own history — a decade of watching local-first research, and a
<a href="/commitments">charter</a> arrived at by auditing our own
        architecture against the general critique of extractive software. But
        when we finally read the corpus end to end, the overlap was close
        enough to be embarrassing. Two independent walks ending at the same
        place is not influence. It is something better: evidence that the
        place is real.
</p> <h2>Receipts, not vibes</h2> <p>
So let us mark the homework honestly, spec line by spec line — because
        an essay that admires a critic and then gestures vaguely at “alignment
        with his values” is exactly the kind of writing he has spent forty
        years puncturing.
</p> <p> <strong>Provenance.</strong> This is the deep one. In xNet, every edit
        you make — every keystroke batch, every task ticked, every row changed
        — becomes a small, permanent record with a precise shape:
</p> ${renderComponent($$result2, "CodeFigure", $$CodeFigure, { "code": changeCode, "filename": "packages/sync/src/change.ts", "caption": "One change, four load-bearing fields: hash-chained to its parent, attributed to its author\u2019s DID, signed with the author\u2019s own key. The log of these is the protocol \u2014 there is no other write path." })} <p>
Read those fields as a Xanadu partisan would. Every atom of data in
        the system knows who made it (<code>authorDID</code> — an identity you
        mint yourself, not an account you rent), proves it
        (<code>signature</code>), and knows where it sits in history
        (<code>parentHash</code>, a hash chain). When two people edit the same
        thing, even the tie-break is authorship-aware. There is no anonymous
        blob at the bottom of the architecture into which individual
        contribution dissolves — which is, almost word for word, what the
        “Digital Maoism” essay asked collaborative software to preserve, and
        what <a href="/blog/the-loom-you-can-read">we walked through
        line-by-line in an earlier essay</a>. Context, kept, at the atom.
</p> <p> <strong>No siren servers.</strong> A siren server’s defining property
        is asymmetry: it must see everything, and the value must pool where
        the seeing happens. xNet’s hubs are built to be the opposite — relays
        and meeting points, not observers. The master copy of your workspace
        lives on your own device, in an ordinary SQLite file; a hub you
        choose, rent, or run on a spare machine forwards signed changes it
        cannot forge between your devices and your collaborators. There is no
        behavioural surplus pooling anywhere, because none is collected — and
        that is not a policy promise, it is
<a href="/why">a property you can audit</a>: a continuous check in the
        repository fails the build if anyone wires in a third-party analytics
        or advertising SDK.
</p> <p> <strong>No behaviour modification.</strong> The BUMMER machine needs
        an adaptive feed with an engagement objective. xNet does not have one.
        Feeds are chronological; notifications follow rules you can read, not
        a model of your weaknesses; nothing in the interface is optimising
        you. This is the charter’s Calm axis, and it is enforced the same
        boring way as the rest — in code review and in checks, where dark
        patterns are treated as defects.
</p> <p> <strong>Agents with name tags.</strong> And here 1995 comes back
        around. The current wave of software agents is about to re-run the
        experiment Lanier described — people ceding autonomy to processes
        that act on their behalf — at a scale he could only sketch. xNet’s
        answer is a mechanism we call the agent passport: an agent operating
        in a workspace gets <em>its own</em> cryptographic identity, distinct
        from yours, carrying an explicitly scoped grant of authority. Every
        change an agent writes is signed by the agent’s key — so the
        provenance machinery above applies to the machines too. An agent
        cannot impersonate you, cannot exceed its scope, and cannot act
        without leaving a signed trail; the riskiest capabilities cannot be
        waved through from a chat window at all. A tool with a name, on a
        leash you hold — the 1995 essay, resolved as an access-control
        design.
</p> <h2>The fork in data dignity</h2> <p>
Now the part where we disagree with him — because the portrait is
        worthless without it.
</p> <p>
In 2018, with the economist E. Glen Weyl, Lanier turned the siren-server
        critique into a programme with a name: <strong>data dignity</strong>.
        On StarTalk he compressed its premise into ten words: <em>“data only
        comes from people. Data doesn’t come from angels.”</em> The programme
        has two halves. The first is the provenance half: contribution should
        remain <em>attributed</em> — traceable, inalienable, never laundered
        into an anonymous aggregate. The second is the market half: that
        attributed data should generate <em>royalties</em>, flowing through
        collective-bargaining organisations they call MIDs — mediators of
        individual data, fiduciary unions for your digital exhaust — so that
        the people a model is made of become a paid creative class rather
        than an unpaid substrate.
</p> <p>
We built the first half. We refused the second. And the refusal is not
        a shortcut — it is a position, and it can be argued largely in his own
        terms. The strongest critiques of the market half have been public
        since the week the book shipped: for most people the royalties would
        be pennies, dressed in the costume of empowerment; the accounting
        apparatus would be a surveillance system of its own; and — the
        sharpest one — putting a price on harvested data does not end the
        harvesting, it <em>legitimises</em> it, converting a violation into a
        transaction. A market in your data still requires the mine. It just
        promises you a small cut of the ore.
</p> <p>
xNet’s wager is that dignity comes before the invoice: collect
        nothing, attribute everything, and let the money flow where Lanier
        himself pointed in his exemption — direct payment for things people
        choose to buy. In our corner of the world that means you pay for
        hosting, or run your own; AI is metered by what you actually use, not
        subsidised by what can be extracted from you; and people who build
        things on the platform price their own work. Attribution without a
        data market; commerce without a mine. He might not accept the trade —
        the middle-class economics of <em>Who Owns the Future?</em> wanted
        royalties at society scale, and our answer only covers the software
        we ship. But between a data economy priced by siren servers and one
        with no prices at all, there is a third door, and we think it is the
        one his own exemption points at.
</p> ${renderComponent($$result2, "HonestDisguise", $$HonestDisguise, {})} <h2>People are the answer</h2> <p>
There is a sentence near the end of the 2023 essay that reads like a
        summary of the man: <em>“people are the answer to the problems of
        bits.”</em> It is easy to hear that as sentiment. It is not. It is an
        engineering claim — the same one he has been making since the MIDI
        wars: that every system which forgets it is made of people degrades
        the people it is made of, and every system that keeps the people
        visible — named, attributed, paid or at least asked — stays
        correctable. The claim scales down as well as up. It is true of a
        feed, and of a training set, and of a change log four fields wide.
</p> <p>
The instruments were the point all along. A khaen does not disguise
        the player; it amplifies them — you can hear the breath in it.
        Software can be built like that. The note the protocol couldn’t hear
        was never lost because it was unplayable; it was lost because a
        format shipped without it, and everyone adjusted. Forty years on, the
        adjustment is optional. The formats are still being written — some of
        them by us, in the open, with the author’s name signed on every note.
</p> <p>
If you want to play one: <a href="/app">use the app</a> — free,
        offline, private. Read <a href="/commitments">the commitments</a> and
<a href="/why">the receipts behind them</a>, or
<a href="/build-with">build on the protocol</a> yourself. And read
        Lanier — start with the New Yorker essay, then the books. He has been
        holding this note a long time. It deserves the chord.
</p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li>
The conversation this essay links:
<a href="https://www.youtube.com/watch?v=a_ZKYH8v_do" rel="noopener noreferrer">
StarTalk Plus — <em>Neil deGrasse Tyson and Jaron Lanier on the AI
            Illusion</em></a> (YouTube). The “data doesn’t come from angels” line is from this
          conversation, via the episode’s published transcript.
</li> <li>
The corpus: <em>You Are Not a Gadget</em> (2010);
<em>Who Owns the Future?</em> (2013); <em>Ten Arguments for Deleting
          Your Social Media Accounts Right Now</em> (2018);
<a href="https://www.newyorker.com/science/annals-of-artificial-intelligence/there-is-no-ai" rel="noopener noreferrer">
“There Is No A.I.” — The New Yorker, 2023</a>;
<a href="https://jaronlanier.com/agentalien.html" rel="noopener noreferrer">
“Agents of Alienation” (1995)</a>;
<a href="https://www.edge.org/conversation/jaron_lanier-one-half-a-manifesto" rel="noopener noreferrer">
“One Half a Manifesto” — Edge, 2000</a>;
<a href="https://www.edge.org/conversation/jaron_lanier-digital-maoism-the-hazards-of-the-new-online-collectivism" rel="noopener noreferrer">
“Digital Maoism” — Edge, 2006</a>.
</li> <li>
Data dignity:
<a href="https://hbr.org/2018/09/a-blueprint-for-a-better-digital-society" rel="noopener noreferrer">
Lanier &amp; Weyl — “A Blueprint for a Better Digital Society”,
            Harvard Business Review, 2018</a>
and
<a href="https://www.aeaweb.org/articles?id=10.1257%2Fpandp.20181003" rel="noopener noreferrer">
Arrieta-Ibarra et al. — “Should We Treat Data as Labor?”, AEA
            Papers &amp; Proceedings, 2018</a>. Provenance as epistemic infrastructure:
<a href="https://www.brown.edu/news/2026-04-24/jaron-lanier-cooper-lecture" rel="noopener noreferrer">
Brown University — the 2026 Cooper Lecture</a>.
</li> <li>
The critics engaged above:
<a href="https://www.slate.com/articles/technology/books/2013/05/jaron_lanier_s_who_owns_the_future_review_facebookers_of_the_world_unite.html" rel="noopener noreferrer">
Slate — Will Oremus on micropayments</a>,
<a href="https://www.forbes.com/sites/timworstall/2013/05/15/jaron-laniers-who-owns-the-future-what-on-earth-is-this-guy-talking-about/" rel="noopener noreferrer">
Forbes — Tim Worstall on the Kodak/Instagram comparison</a>,
<a href="https://onezero.medium.com/getting-cash-for-our-data-could-actually-make-things-worse-3793c52ec7e5" rel="noopener noreferrer">
OneZero — Joshua Adams on why paying for data could entrench
            surveillance</a>, and
<a href="https://networkcultures.org/cpov/resources/resources_in_english/response-to-jaron-laniers-digital-maoism/" rel="noopener noreferrer">
Institute of Network Cultures — responses to “Digital Maoism”</a>.
</li> <li>
The architecture and the receipts: <a href="/why">xNet — Why</a> and
<a href="/commitments">the Humane Charter</a>. Companion essays:
<a href="/blog/clutch-power">Clutch Power</a>,
<a href="/blog/the-loom-you-can-read">The Loom You Can Read</a>, and
<a href="/blog/the-vault-and-the-view">The Vault and the View</a>.
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>This is an independent essay about Jaron Lanier’s published work.
          He has no affiliation with xNet and has not reviewed or endorsed
          this essay or this project; quotations are brief, attributed, and
          used as commentary and criticism. Where a quotation comes from an
          episode transcript rather than a text he wrote, the sources above
          say so. All artwork here is original, and this page loads nothing
          third-party.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "people-in-disguise" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/people-in-disguise.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/people-in-disguise.astro";
const $$url = "/blog/people-in-disguise";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$PeopleInDisguise,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
