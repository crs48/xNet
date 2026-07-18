import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$ForestArt } from '../../chunks/ForestArt_yhl_gdQF.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$ForestHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$ForestHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#070d09]"> ${renderComponent($$result, "ForestArt", $$ForestArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-emerald-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 font-mono lowercase text-emerald-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/ForestHero.astro", void 0);

const $$PrincipleWheel = createComponent(($$result, $$props, $$slots) => {
  const cx = 240;
  const cy = 150;
  const R = 112;
  const wheel = Array.from({ length: 12 }, (_, i) => {
    const a = (-90 + i * 30) * Math.PI / 180;
    return { n: i + 1, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  const movements = [
    {
      title: "Store what you grow",
      rows: [
        { p: "Catch & store energy", x: "Your device holds the master copy \u2014 your harvest, in your barn, working offline" },
        { p: "Produce no waste", x: "No behavioral surplus to harvest; nothing stranded when you export and leave" },
        { p: "Use renewable resources", x: "Open standards over proprietary lock-in: a did:key you mint, a signed open log" }
      ]
    },
    {
      title: "Let it regulate itself",
      rows: [
        { p: "Observe & interact", x: "Telemetry off by default \u2014 observed only with consent, scrubbed so it can\u2019t fingerprint" },
        { p: "Self-regulation & feedback", x: "No infinite scroll or engagement ranking; a build check fails on dark patterns" },
        { p: "Small & slow solutions", x: "Local-first, run-it-yourself hubs, a calm motion vocabulary \u2014 the small web" }
      ]
    },
    {
      title: "Plant a polyculture",
      rows: [
        { p: "Use & value diversity", x: "Any framework, many languages \u2014 and the freedom to fork; only the name is protected" },
        { p: "Integrate, don\u2019t segregate", x: "Federation and interop by shared rules, not a wall around the commons" },
        { p: "Patterns before details", x: "One open protocol is the pattern; every app and feature is a detail grown on top" }
      ]
    },
    {
      title: "Tend the edges, design for change",
      rows: [
        { p: "Use edges & the marginal", x: "The edge is your device \u2014 that\u2019s where the data and the compute live" },
        { p: "Respond to change", x: "The right to leave: when a platform turns, you walk out with everything intact" },
        { p: "Obtain a yield", x: "Not a manifesto \u2014 working software today; the yield is your own audience and space" }
      ]
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
Twelve principles, one design
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
Holmgren's twelve permaculture principles, grouped into four movements — and
      what each one becomes when you build a web instead of a garden.
</p> <div class="mt-6 grid items-center gap-6 md:grid-cols-[300px_1fr]"> <!-- the wheel: twelve numbered nodes spoked to the cosmic-X hub --> <svg class="mx-auto w-full max-w-[300px]" viewBox="0 0 480 300" role="img" aria-label="A twelve-spoke wheel: the twelve permaculture principles arranged around a central cosmic-X hub."> <defs> <radialGradient id="pwhub" cx="50%" cy="50%" r="50%"> <stop offset="0%" stop-color="#fde68a" stop-opacity="0.9"></stop> <stop offset="55%" stop-color="#34d399" stop-opacity="0.18"></stop> <stop offset="100%" stop-color="#34d399" stop-opacity="0"></stop> </radialGradient> <linearGradient id="pwx" x1="0" y1="0" x2="1" y2="1"> <stop offset="0%" stop-color="#fde68a"></stop> <stop offset="100%" stop-color="#34d399"></stop> </linearGradient> </defs> <g stroke="#34d399" stroke-width="1.2" opacity="0.35"> ${wheel.map((w) => renderTemplate`<line${addAttribute(cx, "x1")}${addAttribute(cy, "y1")}${addAttribute(w.x, "x2")}${addAttribute(w.y, "y2")}></line>`)} </g> <circle${addAttribute(cx, "cx")}${addAttribute(cy, "cy")}${addAttribute(R, "r")} fill="none" stroke="#34d399" stroke-width="1" opacity="0.25"></circle> ${wheel.map((w) => renderTemplate`<g> <circle${addAttribute(w.x, "cx")}${addAttribute(w.y, "cy")} r="16" class="fill-emerald-50 dark:fill-[#0e1f15]" stroke="#34d399" stroke-width="1.6"></circle> <text${addAttribute(w.x, "x")}${addAttribute(w.y + 4.5, "y")} text-anchor="middle" font-size="13" font-weight="700" class="fill-emerald-700 dark:fill-emerald-300"> ${w.n} </text> </g>`)} <!-- the cosmic-X hub: the brightest node --> <circle${addAttribute(cx, "cx")}${addAttribute(cy, "cy")} r="40" fill="url(#pwhub)"></circle> <g stroke="url(#pwx)" stroke-width="5" stroke-linecap="round"${addAttribute(`translate(${cx - 11} ${cy - 13})`, "transform")}> <line x1="0" y1="0" x2="22" y2="26"></line> <line x1="22" y1="0" x2="0" y2="26"></line> </g> </svg> <!-- the mapping: four movements, three principles each --> <div class="space-y-5"> ${movements.map((m) => renderTemplate`<div> <h4 class="text-sm font-semibold tracking-tight text-emerald-700 dark:text-emerald-300"> ${m.title} </h4> <ul class="mt-2 space-y-2"> ${m.rows.map((row) => renderTemplate`<li class="grid gap-1 sm:grid-cols-[1fr_1.5fr] sm:gap-4 sm:items-baseline"> <p class="text-sm font-medium leading-snug text-gray-900 dark:text-white">${row.p}</p> <p class="text-sm leading-snug text-gray-600 dark:text-gray-300">${row.x}</p> </li>`)} </ul> </div>`)} </div> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/PrincipleWheel.astro", void 0);

const $$HonestGarden = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      isnt: "We won\u2019t pretend code is scarce the way soil is.",
      is: "A field obeys thermodynamics; software copies for free. So \u201Cyield\u201D and \u201Cwaste\u201D are borrowed words here, not equations. The yield we mean is problems solved and people served; the waste we refuse is the behavioral exhaust harvested from you \u2014 not a deprecated library, which costs nothing to leave lying around."
    },
    {
      isnt: "We won\u2019t pretend software ecosystems heal themselves.",
      is: "A forest self-regulates over evolutionary time. A package registry does not \u2014 left-pad, the XZ Utils backdoor, and Log4Shell are what \u201Cself-healing\u201D actually looks like in software: it doesn\u2019t, without funded, vigilant maintenance. The commons is real, but its upkeep is finite and depletable, and calling it \u201Cfree\u201D is how it gets strip-mined."
    },
    {
      isnt: "We won\u2019t let the metaphor launder power.",
      is: "Calling a dominant platform a \u201Cclimax species\u201D makes capture sound like nature taking its course. It isn\u2019t. Monopoly is built from network effects, acquisitions, and regulatory capture \u2014 choices, not succession. The forest is a model to design by, not an alibi for who\u2019s already won."
    },
    {
      isnt: "We won\u2019t oversell permaculture itself.",
      is: "Its productivity claims are thinner on peer-reviewed evidence than its confidence suggests, and it carries some guru-and-certificate baggage. We\u2019re borrowing a way of thinking about regenerative design \u2014 store, recycle, diversify, decentralize \u2014 not claiming a settled science."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
An honest garden
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
A metaphor that flatters itself is just more marketing. Here’s where the
      land-to-software analogy actually strains.
</p> <ul class="mt-6 space-y-5"> ${rows.map((row) => renderTemplate`<li class="grid gap-3 sm:grid-cols-[1fr_1.3fr] sm:gap-5"> <div class="flex gap-2.5"> <span class="select-none text-gray-400 dark:text-gray-600">✕</span> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${row.isnt}</p> </div> <div class="flex gap-2.5"> <span class="select-none text-emerald-500">✓</span> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.is}</p> </div> </li>`)} </ul> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HonestGarden.astro", void 0);

const $$TheForestAndTheField = createComponent(($$result, $$props, $$slots) => {
  const post = postBySlug("the-forest-and-the-field");
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "ForestHero", $$ForestHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-emerald-600 dark:prose-a:text-emerald-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
A few of these essays have wandered underground and overhead — into the
        soil a forest quietly talks through, into the dust a dead desert sends
        across an ocean to feed a living one. This one stays at eye level, on an
        ordinary patch of ground, and asks a plainer question. Not <em>how does a
        living system work</em>, but <em>how does a person sit down and grow one
        on purpose?</em> Because there is a discipline for exactly that, and once
        you’ve seen it, you can’t un-see it in the web.
</p> <h2>Two pieces of land</h2> <p>
Picture a field of corn. A thousand identical rows running to the horizon,
        every plant the same height, the same age, the same genes. It is the
        image most of us carry of a farm, and it is, by one measure, a triumph:
        more calories per acre, per hour of human labor, than almost anything in
        history. It is also a patient on life support. The bare soil between the
        rows washes away with every rain. A single crop is a single feast laid
        out for a single pest. And the fertility doesn’t rise from the ground —
        the ground is close to dead — it arrives in a truck, as nitrogen brewed
        from natural gas, and it leaves again in the harvest, so it has to be
        bought back next season, and the season after, forever. The field
<em>looks</em> like abundance. It runs on dependency.
</p> <p>
That field is the business model of the modern web. The crop is your
        attention, planted in dead-straight rows and harvested on a schedule. The
        soil is you — your behavior, tilled for the one nutrient the operation
        actually wants. The fertility that keeps the whole thing green is sold
        back to whoever planted you, as ads, as reach, as a ranking you can rent.
        It is enormously productive, for a while, for someone else. And like any
        monoculture, it is quietly sterilizing the ground it grows in: the open
        link, the interoperable feed, the small independent site — the very things
        the platforms first grew <em>out of</em> — are dying off, row by row, and
        we’ve started, sadly, to call the result the <em>dead internet</em>.
</p> <p>
Now picture the second piece of land. It doesn’t look like a farm at all.
        It looks like a young forest gone slightly feral: fruit trees over berry
        bushes over herbs over ground cover, vines threading up through all of it,
        seven layers deep, nothing in rows. Bees and birds and fungi do half the
        work. Nobody trucks in fertility, because the system makes its own —
        leaves fall, roots fix nitrogen, everything that dies feeds something that
        lives. It needs less every year instead of more. And here is the part
        worth sitting with: that tangle is not wild. It was <em>designed</em>,
        every inch of it, by someone following a discipline with an ugly
        portmanteau for a name — <strong>permaculture</strong>.
</p> <h2>The other way to farm</h2> <p>
Permaculture — <em>permanent</em> + <em>agriculture</em>, and later
<em>culture</em> — was set down in the 1970s by two Australians, Bill
        Mollison and David Holmgren, watching industrial farming strip the
        topsoil off their continent. Their wager was that you could get a real
        yield from land by designing it to run the way a healthy ecosystem already does:
        diverse, layered, self-renewing, mostly self-maintaining. It rests on
        three ethics that fit on a seed packet — <strong>earth care</strong>,
<strong>people care</strong>, and <strong>fair share</strong> (return
        what’s surplus to the system instead of hoarding it) — and on twelve
        design principles underneath them.
</p> <p>
The whole thing turns on one distinction that most “green” technology
        just misses. Being <strong>sustainable</strong> means doing less harm — a
        slower death is still a death. Being <strong>regenerative</strong> means
        leaving the land <em>richer</em> than you found it. A monoculture, at its
        very best, is sustainable: you can tune it to deplete the soil a little
        more slowly. A forest is regenerative: it builds soil it never had. The
        question permaculture asks of a piece of land is the question worth asking
        of a technology, and almost nobody asks it: not <em>“how do we extract
        from this a bit more responsibly,”</em> but <em>“how do we build a thing
        that leaves the commons better off for having existed?”</em> </p> <p>
That question is the whole of <a href="/commitments">xNet’s
        commitments</a>, and it turns out the twelve principles map onto them
        almost furrow for furrow. Suspiciously well, in fact — so we’ll be honest
        about that further down. But take them in four movements first.
</p> <h2>One: store what you grow</h2> <p>
The first cluster of principles is about <em>where the good stuff
        lives</em>. <strong>Catch and store energy</strong> — make hay while the
        sun shines — means capturing abundance at the source and keeping it
        somewhere you can reach it later, rather than letting it run off. The
        monoculture web does the opposite: your data is the harvest, and it’s
        trucked off your land the instant it’s made, to be stored in someone
        else’s silo and rented back to you as a “sync.” xNet keeps the harvest in
        your barn. Your data lives <a href="/why">on your device first</a>, as the
        master copy, working with no network at all. You caught it; you keep it.
</p> <p> <strong>Produce no waste</strong> — waste is just a resource in the wrong
        place — is the principle the extractive web most spectacularly violates,
        and the violation has a name. Shoshana Zuboff called it
<em>behavioral surplus</em>: the exhaust data scraped from your every tap
        that you never agreed to hand over, the runoff the whole industry was
        built to capture. xNet produces none of it — there is no place in the
        architecture to put it, and a check in the build <em>fails</em> if anyone
        tries to add one. And waste isn’t only what’s harvested; it’s also what’s
        stranded. On a plantation, leaving means losing your crop. Here, you can
        export everything and walk, and nothing rots in the ground behind you.
</p> <p> <strong>Use and value renewable resources.</strong> A permaculturist
        reaches for the input that refills itself — sunlight, not fossil fuel.
        Proprietary formats are fossil fuel: dig them up once, and you’re locked to
        a single supplier who can change the price. Open standards are sunlight.
        Your identity on xNet is a <code>did:key</code> you mint yourself — nothing
        issues it, nothing can revoke it — and your history is an open, signed,
        hash-chained log any implementation can read. Renewable, portable, and not
        anyone’s to switch off.
</p> <h2>Two: let it regulate itself</h2> <p> <strong>Observe and interact</strong> — understand a system before you act
        on it. The extractive web has perfected the dark inversion of this
        principle: it observes you obsessively, but only in order to act
<em>on</em> you. xNet flips it back the right way round.
<a href="/commitments">Telemetry is off by default</a>; nothing about you
        is observed until you choose to share it, and even then it’s scrubbed and
        bucketed so a single person can’t be picked out of the crowd. Observation
        in service of the gardener, not the harvest.
</p> <p> <strong>Apply self-regulation and accept feedback.</strong> A forest
        doesn’t grow without limit; it finds a balance, and when something is off,
        the feedback is loud and the system adjusts. The monoculture web is
        engineered to ignore exactly this signal — to override your “enough” with
        one more autoplay, one more infinite scroll, one more streak you’ll lose
        if you sleep. xNet writes the limits into the code instead of leaving them
        to willpower: notifications are rule-based with a hard cap, feeds are
        chronological, there’s no engagement ranking and no loss-baited streak —
        and a build check fails if a dark pattern or a manipulative animation
        tries to sneak in. The system accepts feedback by refusing to ship the
        thing it promised not to build.
</p> <p> <strong>Use small and slow solutions.</strong> Big and fast is fragile;
        small and slow is what lasts and what a human can actually tend. The whole
        architecture is small and slow on purpose — local-first, hubs modest
        enough to <a href="/build-with">run yourself</a>, a deliberately calm
        motion vocabulary. Not the hyperscale web. The small one, built to be
        kept.
</p> <h2>Three: plant a polyculture</h2> <p> <strong>Use and value diversity.</strong> Monoculture’s fatal flaw is that
        it is one bad day — one blight, one pest, one outage — from total
        collapse; a polyculture routes around the damage because something else is
        always thriving. A web owned by five companies is a monoculture in exactly
        this sense. xNet is built to be a polyculture: it runs under
<a href="/build-with">any framework</a> and speaks several languages, and
        — the deepest diversity guarantee there is — you can fork it. The only
        thing held back is the name, and only so that no one can impersonate you;
        the code itself is yours to replant anywhere.
</p> <p> <strong>Integrate rather than segregate.</strong> In a garden the work
        gets done in the <em>relationships</em> between things — the nitrogen-fixer
        feeding the fruit tree, the flower drawing the pollinator. A silo, by
        definition, has no relationships; that’s the whole idea of a wall. The
        extractive web’s instinct is to wall you in and meter the door. xNet
        federates instead: bring your own hub, connect it to others, interoperate
        by a shared set of rules rather than a shared set of fences.
</p> <p> <strong>Design from patterns to details</strong> — get the big shape right
        before you fuss over the specifics. xNet’s big shape is a single open
        protocol: a signed, hash-chained change log that everything else is grown
        on top of. The apps and the features are details — important ones, but
        details — rooted in a pattern that doesn’t belong to any one of them. Get
        the soil right and many things can grow in it.
</p> <h2>Four: tend the edges, and design for change</h2> <p> <strong>Use edges and value the marginal.</strong> The most alive place in
        any landscape is the <em>edge</em> — the ecotone where forest meets meadow,
        where species from both worlds mingle and new ones appear. The web has an
        edge too, and it’s your device, sitting at the far margin of every network
        diagram. That margin is precisely where xNet puts the data and the work.
        It’s also a quiet reminder to value what the center overlooks — the people
        a platform won’t bother to serve, and the maintainers nobody thinks to
        thank, who turn out to be holding the whole thing up.
</p> <p> <strong>Creatively use and respond to change.</strong> Change is not a
        threat to design around; it’s the one thing you can count on, so you build
        to bend with it. The deepest version of this is the right to leave. Platforms
        turn — they almost always turn — and when yours does, you should be able to
        respond by simply walking out with everything intact. A portable identity
        and an open log turn a platform going bad from a sentence you serve into a
        problem you solve in an afternoon.
</p> <p>
And finally, the principle that keeps the other eleven honest:
<strong>obtain a yield.</strong> A design that doesn’t actually feed the
        people tending it won’t be tended; beautiful, useless idealism composts
        back into nothing. This is the one most “ethical tech” forgets, and it’s
        why xNet is not a manifesto but <a href="/app">working software you can use
        today</a>. The yield it returns is the very thing the monoculture rents
        back to you at a markup: your own audience, your own space, your own data,
        kept.
</p> ${renderComponent($$result2, "PrincipleWheel", $$PrincipleWheel, {})} <p>
If that felt a little too neat — six commitments and twelve principles
        clicking together like rows in a furrow — good. It should make you
        suspicious, and the honest version is worth more than the tidy one.
</p> ${renderComponent($$result2, "HonestGarden", $$HonestGarden, {})} <h2>The commons isn’t doomed. It’s being fenced.</h2> <p>
There’s one objection left, and it’s the oldest one. In 1968 a biologist
        named Garrett Hardin published an essay called <em>The Tragedy of the
        Commons</em>, and its logic has been used to justify enclosure ever since:
        a shared pasture, he argued, is always overgrazed, because each herder
        gains from adding one more animal while the cost of the ruin is spread
        across everyone. Anything held in common is therefore doomed, and the only
        cures are to privatize it or police it. For fifty years that’s been quoted
        as a law of nature.
</p> <p>
It isn’t one. The economist <strong>Elinor Ostrom</strong> won a Nobel
        Prize for showing it isn’t. She went and looked — at irrigation systems,
        fisheries, alpine pastures, forests held in common for centuries — and
        found communities governing shared resources perfectly well without either
        a landlord or a state, using rules they wrote and enforced themselves.
        Hardin had described a commons with <em>no</em> governance and mistaken it
        for all of them. Ostrom described what happens when people actually tend
        the thing they share.
</p> <p>
And some commons don’t even face the tragedy — they run the other way. The
        legal scholar <strong>Carol Rose</strong> named it the <em>comedy of the
        commons</em>: resources that get <em>more</em> valuable the more people
        share them. A language. A road network. A protocol. The open web is one of
        these — every person who adopts an open standard makes it worth more to
        everyone already on it. For a comedy commons, the danger was never that
        we’d use it up. The danger is that someone fences it and starts charging at
        the gate.
</p> <p>
So xNet’s commons aren’t a charity drive; they’re governance, in Ostrom’s
        sense. The code is forkable. The hubs are yours to run. The rules are
<a href="/commitments">written down</a> and meant to be shared and argued
        with. That’s not idealism about human nature — it’s the boring,
        well-evidenced machinery that lets a shared thing stay shared instead of
        getting quietly enclosed while everyone was looking at the canopy.
</p> <h2>Plant the forest</h2> <p>
You do not reform a monoculture by standing at the fence and arguing with
        it. The field can’t hear you; it’s busy being a field. You reform it the
        way nature reforms a clear-cut — you plant something diverse and slow and
        alive at the edge of it, and you tend that, and you wait. The field wins
        the first few seasons. It always does; that’s what the chemicals are for.
        But the field is spending soil it has to keep buying back, and the forest
        is building soil it gets to keep, and of those two stories only one of them
        gets richer every single year.
</p> <p>
So plant the forest. <a href="/app">Use the app</a> — it’s free, offline,
        and private — or <a href="/build-with">build something of your own</a> on
        the open protocol and add a species to the canopy. Read
<a href="/why">what the monoculture actually costs you</a>, then go grow a
        web that feeds itself. The whole discipline comes down to one instruction,
        and it’s the same on land as it is online: <strong>leave it richer than you
        found it.</strong> </p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li>
The framework — three ethics and twelve design principles:
<a href="https://permacultureprinciples.com/principles/" rel="noopener noreferrer">
permacultureprinciples.com</a>, after David Holmgren, <em>Permaculture: Principles &amp; Pathways
          Beyond Sustainability</em> (2002), and Bill Mollison,
<em>Permaculture: A Designer’s Manual</em> (1988).
</li> <li>
Permaculture applied to computing, where much of this thinking has been
          worked out already:
<a href="https://permacomputing.net" rel="noopener noreferrer">permacomputing.net</a>
and the
<a href="https://100r.co" rel="noopener noreferrer">Hundred Rabbits</a> collective.
</li> <li>
The commons — that sharing isn’t doomed:
<a href="https://www.cambridge.org/core/books/governing-the-commons/A8BB63BC4A1433A50A3FB92EDBBB97D5" rel="noopener noreferrer">
Elinor Ostrom, <em>Governing the Commons</em> (1990)</a>; Carol M. Rose, <em>The Comedy of the Commons</em> (1986); and the
          essay it answers, Garrett Hardin, <em>The Tragedy of the Commons</em>
(1968).
</li> <li>
The invisible, depletable labor under the open web:
<a href="https://www.fordfoundation.org/media/2976/roads-and-bridges-the-unseen-labor-behind-our-digital-infrastructure.pdf" rel="noopener noreferrer">
Nadia Eghbal — Roads and Bridges (Ford Foundation, 2016)</a>.
</li> <li>
“Behavioral surplus,” the runoff this whole web was built to capture:
          Shoshana Zuboff, <em>The Age of Surveillance Capitalism</em> (2019).
</li> <li>
The architecture and the receipts behind every claim here:
<a href="/commitments">the Humane Charter</a> and
<a href="/why">xNet — Why</a>. Companion essays:
<a href="/blog/data-should-work-like-soil">Data Should Work Like Soil</a>
and
<a href="/blog/the-desert-that-feeds-the-forest">The Desert That Feeds the Forest</a>.
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>This is an independent essay. Permaculture is used here as a design
          analogy, not a settled agricultural science; the land-to-software
          mapping is meant to be useful, not literal, and its limits are spelled
          out above. All artwork here is original.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "the-forest-and-the-field" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/the-forest-and-the-field.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/the-forest-and-the-field.astro";
const $$url = "/blog/the-forest-and-the-field";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$TheForestAndTheField,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
