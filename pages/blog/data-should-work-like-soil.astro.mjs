import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$MycelialArt } from '../../chunks/MycelialArt_MsmkUcRA.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$MycelialHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$MycelialHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#06080a]"> ${renderComponent($$result, "MycelialArt", $$MycelialArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-emerald-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 font-mono lowercase text-emerald-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/MycelialHero.astro", void 0);

const $$ThreeNervousSystems = createComponent(($$result, $$props, $$slots) => {
  const systems = [
    {
      scale: "A body",
      substrate: "Neurons + the vagus nerve",
      healthy: "Senses, signals, and regulates \u2014 then rests and recovers. Health shows up as steady vagal tone and the ability to return to calm."
    },
    {
      scale: "A company",
      substrate: "One owned data backbone (Tesla\u2019s Warp ERP)",
      healthy: "Every bolt, person, and decision connected on a backbone the company owns and can adapt \u2014 instead of renting it from a vendor who also harvests it."
    },
    {
      scale: "A forest",
      substrate: "The mycorrhizal network",
      healthy: "Water, carbon, and minerals traded root-to-root along fungal threads \u2014 redundant paths, no single point of failure, no central nursery in charge."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
Three nervous systems, one shape
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
A body, a company, and a forest all run on the same idea: a decentralised
      connective substrate — sense, share, adapt, with no dictator in the middle.
</p> <ul class="mt-6 space-y-5"> ${systems.map((s) => renderTemplate`<li class="grid gap-2 sm:grid-cols-[1fr_1.6fr] sm:gap-6 sm:items-baseline"> <div> <p class="font-mono font-semibold text-emerald-600 dark:text-emerald-400"> ${s.scale} </p> <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">${s.substrate}</p> </div> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${s.healthy}</p> </li>`)} </ul> <p class="mt-6 border-t border-border pt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300"> <span class="font-semibold text-gray-900 dark:text-white">The same axis</span>
decides whether any of the three is well or sick:
<span class="text-emerald-600 dark:text-emerald-400">
biodiverse · decentralised · reciprocal · regulated · regenerative
</span>
on one end,
<span class="text-gray-500 dark:text-gray-400">
monoculture · centralised · extractive · dysregulated · brittle
</span>
on the other.
</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/ThreeNervousSystems.astro", void 0);

const $$HonestMycelium = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      isnt: "We won\u2019t claim the forest is a conscious \u201Cinternet of trees.\u201D",
      is: "The romantic version \u2014 wise \u201Cmother trees\u201D knowingly nursing their kin through fungal cables \u2014 outran the field evidence. A 2023 wave of papers showed the popular story was amplified by positive citation bias, and the debate is still live."
    },
    {
      isnt: "We won\u2019t personify the network.",
      is: "What\u2019s real and well-established is the architecture: mycorrhizal symbiosis is nearly universal, the carbon-for-nutrients trade is textbook, and mycelium is one of the planet\u2019s largest living carbon pools \u2014 a vast, redundant, decentralised exchange web."
    },
    {
      isnt: "We won\u2019t pretend a metaphor is a proof.",
      is: "A forest isn\u2019t a database and xNet isn\u2019t a fungus. We borrow the shape \u2014 reciprocal, decentralised, no single point of control \u2014 because the shape is what\u2019s worth building, and decline the parts the evidence can\u2019t carry."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
What the science actually says about the “Wood Wide Web”
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
A metaphor that flatters itself is just more marketing. Here’s the honest version.
</p> <ul class="mt-6 space-y-5"> ${rows.map((row) => renderTemplate`<li class="grid gap-3 sm:grid-cols-[1fr_1.3fr] sm:gap-5"> <div class="flex gap-2.5"> <span class="select-none text-gray-400 dark:text-gray-600">✕</span> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${row.isnt}</p> </div> <div class="flex gap-2.5"> <span class="select-none text-emerald-500">✓</span> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.is}</p> </div> </li>`)} </ul> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HonestMycelium.astro", void 0);

const $$DataShouldWorkLikeSoil = createComponent(($$result, $$props, $$slots) => {
  const post = postBySlug("data-should-work-like-soil");
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "MycelialHero", $$MycelialHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-emerald-600 dark:prose-a:text-emerald-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
Last time, we looked up — at an open sea of scattered islands, and the
        flags a person might fly to stop being someone else’s cargo. This time,
        look down. Under the floor of every healthy forest runs a network older
        than any human one: a living web of fungal threads that laces tree to tree
        to shrub to soil, moving water and food and chemical news through the dark.
        It is the closest thing the planet has to a fibre-optic web, and it was
        here four hundred million years before we strung the first cable.
</p> <p>
We keep reaching for that network to explain ourselves. Our own homepage
        does it: it points at the fact that <em>Tesla built its own nervous
        system</em> — an in-house ERP called Warp wiring together every bolt, every
        person, every decision — and then says, plainly, that beneath every forest
        a mycelial network connects the trees, and that <strong>data should work
        like soil: an open foundation that lets everything grow.</strong> This essay
        is the long version of that thought. It’s about nervous systems — the kind a
        body has, the kind a company has, the kind a forest has — what keeps one
        healthy, what makes one sick, and how you bring a sick one back.
</p> <h2>What’s actually down there</h2> <p>
The threads are fungi. A single thread is a <em>hypha</em>; a mat of them is
<em>mycelium</em>. Most of the fungi we care about here are
<em>mycorrhizal</em> — “fungus-root” — and they live in a partnership with
        plants so common it’s nearly the rule rather than the exception: somewhere
        around <strong>ninety percent of plant species</strong> form these
        associations. The fungus threads into or around a plant’s roots and extends
        its mycelium out into the soil, foraging a volume of earth the roots alone
        could never reach.
</p> <p>
And then they trade. The plant pulls carbon out of the air through
        photosynthesis and hands a generous cut of it — for some partnerships,
<strong>twenty or thirty percent</strong> of the sugar it just made — down to
        the fungus. The fungus, in return, mines the soil for water and the
        minerals plants struggle to get on their own, chiefly nitrogen and
        phosphorus, and delivers them up to the root. Carbon down, minerals up, on a
        standing account. It is one of the oldest economies on Earth, and it is
        built on reciprocity, not extraction.
</p> <p>
The scale is genuinely hard to picture. A single cubic centimetre of forest
        soil can hold up to two kilometres of mycelium. The fine threads don’t just
        move nutrients; they wrap around soil particles and glue them into crumbs,
        building the structure that lets soil hold water and air. Add it all up and
        mycorrhizal fungi turn out to be one of the most overlooked pipes in the
        planet’s carbon cycle — recent work estimates the equivalent of around
<strong>thirteen billion tonnes of CO₂</strong> flows from plants into
        mycorrhizal fungi every year, roughly a third of what humans burn in fossil
        fuels. The life
        cycle that maintains all this is unhurried: a spore germinates, sends out
        hyphae, the mycelium colonises roots and trades for years, occasionally
        throwing up a mushroom — the fruiting body — to scatter the next generation
        of spores. The mushroom is just the part that surfaces. The network is the
        organism.
</p> <p>
Before this runs away with us, the honest part — because the popular
        story about this network has run ahead of the evidence.
</p> ${renderComponent($$result2, "HonestMycelium", $$HonestMycelium, {})} <p>
So we’ll keep what survives the scrutiny, which is plenty: a real,
        reciprocal, decentralised exchange network with no boss and many redundant
        paths. That architecture is the useful part. And it turns out to be the same
        architecture that keeps other living systems well.
</p> <h2>Three nervous systems, one shape</h2> <p>
Step back far enough and a forest’s fungal web, a body’s nervous system, and
        a company’s data backbone start to look like the same machine running at
        three different scales. Each is a <em>connective substrate</em>: a tissue
        whose whole job is to let the parts sense each other, share resources, and
        adapt together — without a single dictator deciding everything from the
        centre.
</p> ${renderComponent($$result2, "ThreeNervousSystems", $$ThreeNervousSystems, {})} <p>
The body’s version is the one we feel from the inside. A well-regulated
        nervous system can ramp up to meet a threat and then, crucially, come back
        down — what physiologists measure as healthy <em>vagal tone</em> and
        heart-rate variability. The forest’s version is the mycelial trade. The
        company’s version is the part our homepage points at: Tesla owns Warp and
        can rewire it on a whim, while most companies <em>rent</em> their nervous
        system from software vendors who bill them for it and quietly harvest it at
        the same time. Same shape, three scales. And the thing about a nervous
        system is that it can go wrong in the same way at every scale, too.
</p> <h2>What dysregulation looks like — and who profits from yours</h2> <p>
A healthy network is biodiverse, decentralised, reciprocal, and able to
        rest. A sick one is the opposite, and you can watch it happen.
</p> <p>
Cut a varied forest down and replant it as a single species in tidy rows,
        and the underground web frays. Study after study finds that monoculture
        plantations carry less <em>fungal</em> diversity than the forests they
        replaced — and that fungal diversity is the single best predictor of whether
        the soil still works. Let the same ground regrow on its own, with its mix of
        species, and the network knits back toward the old composition; hold it as
        monoculture and it mostly doesn’t. The brittleness compounds: less diversity
        below ground means more pests, less drought resistance, acidifying soil, and
        a standing risk of collapse. A monoculture looks orderly and is secretly
        fragile.
</p> <p>
A body does the exact same thing under chronic stress with no recovery. Keep
        the system switched on — alarm without rest — and the wear accumulates as
        what researchers call <em>allostatic load</em>: heart-rate variability
        falls, vagal tone depletes, and the longer it stays revved the harder it
        becomes to climb back down to calm. And one of the most reliable things that
        suppresses a nervous system is <em>isolation</em>; one of the most reliable
        things that restores it is safe connection. A nervous system starved of
        diverse, trusted contact dysregulates — exactly like a forest starved of
        biodiversity.
</p> <p>
Now hold that picture against the internet most of us actually use. It is a
        monoculture: a few enormous platforms in tidy rows, where most people never
        leave the islands the algorithm sails them to. It is the opposite of restful
        by design — an attention economy whose whole engine is to keep your nervous
        system slightly dysregulated, refreshing, never quite at rest. And it runs
        on extraction rather than reciprocity. We
<a href="/why">laid out the receipts on a separate page</a>, every claim
        cited: over three years, an average person’s data was reported to a single
        platform by roughly <strong>2,230 different companies</strong>; about
<strong>99%</strong> of people can be uniquely fingerprinted from their
        device alone. In a forest, the network feeds you. In this one,
<a href="/why"><strong>you are the cargo</strong></a> — the same turn we
        reached in the <a href="/blog/a-great-pirate-age">pirate essay</a>, seen now
        from below the soil instead of above the waves.
</p> <h2>Data should work like soil</h2> <p>
Here’s where the metaphor stops being a metaphor and turns into an
        architecture — the same move the pirate post made with flags and ships’
        logs. If a healthy network is decentralised, reciprocal, and owned by no one
        in the middle, then you can <em>build</em> one. xNet is, almost literally,
        mycelium for your data.
</p> <ul> <li> <strong>A spore of your own.</strong> Your identity is a
<code>did:key</code> — a key pair you generate on your own device. No
          registry issues it and no authority can revoke it. Like a spore, it
          carries everything it needs to start, anywhere.
</li> <li> <strong>Your own roots.</strong> Your data lives on your device first, in
          a local store that works with no network at all. That’s the root ball —
          alive whether or not it’s fused to anything else right now.
</li> <li> <strong>Signed packets along the hyphae.</strong> Every change you make is
          signed by you and chained to the one before it, so the record can’t be
          quietly rewritten later — not even by us. Each change is a packet of
          nutrient travelling a thread, with your mark on it.
</li> <li> <strong>Trade on purpose.</strong> When one root wants to share with
          another, it hands over a signed grant that says “you may draw on this” —
          directly, no central nursery approving the exchange. Carbon down, minerals
          up; reciprocal and permissioned, never extracted.
</li> <li> <strong>A shared biochemistry.</strong> Different species can only trade
          because they speak a shared chemical language. xNet’s version is an open
          protocol, written down and pinned to a corpus of shared test vectors any
          implementation in any language has to pass — which is why you can
<a href="/build-with">build on it</a> in Swift, Rust, or Python and still
          interoperate.
</li> <li> <strong>Soil as a commons.</strong> The data structures themselves —
          schemas — are a shared, extensible substrate, “like npm for data types,”
          so an app you’ve never heard of can grow in the same earth as yours. Open
          foundation; everything grows.
</li> </ul> <p>
That’s what our homepage means by owning your nervous system instead of
        renting it. Tesla had to build Warp to get it. The point of an open protocol
        is that you don’t have to be Tesla — the substrate is there for anyone to
        root into.
</p> <h2>How you bring a network back</h2> <p>
The best part of the forest story is that damage isn’t destiny. You can heal
        a wrecked one — and the way you do it is the same at every scale, which is
        the most hopeful thing in this whole essay.
</p> <p>
You don’t <em>command</em> a forest back to health; you <em>tend</em> it.
        Restoration ecologists will tell you that the moves that work are never a
        single silver bullet: you stop the active harm, you rebuild the soil’s
        structure and its diversity at the same time, and — this is the lovely part
        — you <em>re-inoculate with native fungi</em>, and the inoculants that work
        best are diverse, local consortia, not one heroic species. Reintroduce the
        network and it does the rest: it drives succession, lifts seedling survival
        on poor ground, even helps fend off invasives. Then you wait, because soil
        keeps its own slow time. Diversity, reciprocity, patience. That’s
        permaculture; that’s also just how living networks knit.
</p> <p>
A dysregulated nervous system comes back the same way — not by force but by
        the right conditions: rest, safety, and a return of diverse, trusted connection.
        And a dysregulated internet comes back the same way too, which is the whole
        reason xNet is shaped the way it is. Stop the extraction by
<a href="/commitments">owning your data instead of being it</a>. Restore
        biodiversity by federating — many hubs, many apps, no monoculture, and the
        freedom to choose your own waters rather than crowning a new authority to
        choose for you. Restore reciprocity by making every share a deliberate,
        revocable grant. And restore rest: xNet’s
<a href="/commitments">Humane Charter</a> is enforced in the build itself —
        a check that <em>bans</em> the machinery of compulsion, no infinite scroll,
        no engineered streaks, no behavioural-surplus trackers. It is, quite
        literally, a rule against clear-cutting your attention.
</p> <p>
A forest’s nervous system, a body’s, a company’s, an internet’s: each is
        well when it’s diverse, decentralised, reciprocal, and free to rest, and
        each goes sick when it’s reduced to a monoculture run for someone else’s
        extraction. The good news is that the cure is known, and it’s gentle. Tend
        the soil. Bring back the diversity. Trade fairly. Let it rest. Then watch
        what grows.
</p> <p>
So: root in. <a href="/app">Use the app</a> — it’s free, offline, and
        private. Read <a href="/commitments">the commitments we’re built on</a>. Or,
        if you build things, <a href="/build-with">grow something in the open
        soil</a> yourself. Last essay we set out to sea. This one, we put down
        roots. Same open world — just look down.
</p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li>
The mycology — symbiosis, the carbon-for-nutrients trade, scale and carbon
          storage:
<a href="https://www.spun.earth/networks/mycorrhizal-fungi" rel="noopener noreferrer">
SPUN — Mycorrhizal Fungi Explainer</a>,
<a href="https://hort.extension.wisc.edu/articles/mycorrhizae/" rel="noopener noreferrer">
University of Wisconsin — Mycorrhizae</a>, and
<a href="https://www.cell.com/current-biology/fulltext/S0960-9822(23)00167-7" rel="noopener noreferrer">
“Mycorrhizal mycelium as a global carbon pool,” <em>Current Biology</em> (2023)</a>.
</li> <li>
The honest counterweight — why the “Wood Wide Web” / “mother tree” story
          is contested:
<a href="https://nph.onlinelibrary.wiley.com/doi/10.1111/nph.18935" rel="noopener noreferrer">
Henriksson et al., <em>New Phytologist</em> (2023)</a>, the
<a href="https://www.inverse.com/science/wood-wide-web-debunk-study" rel="noopener noreferrer">
Karst, Jones &amp; Hoeksema review in <em>Nature Ecology &amp; Evolution</em> (2023)</a>, and Suzanne Simard’s
<a href="https://www.frontiersin.org/journals/forests-and-global-change/articles/10.3389/ffgc.2024.1512518/full" rel="noopener noreferrer">
response</a> (the debate is live, not settled).
</li> <li>
Monoculture, fungal diversity, and restoration:
<a href="https://link.springer.com/article/10.1007/s00267-023-01917-7" rel="noopener noreferrer">
monoculture vs. natural regeneration, <em>Environmental Management</em> (2023)</a> and
<a href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4960231/" rel="noopener noreferrer">
arbuscular mycorrhizal fungi in the restoration of degraded lands</a>.
</li> <li>
The body’s nervous system — allostatic load, vagal tone, isolation vs.
          connection:
<a href="https://neuvanalife.com/blogs/blog/allostatic-load-understanding-stress-and-its-effects" rel="noopener noreferrer">
allostatic load</a> and
<a href="https://superpower.com/guides/nervous-system-regulation-what-it-means-and-how-to-do-it" rel="noopener noreferrer">
nervous-system regulation</a>.
</li> <li>
Tesla’s Warp as a company’s “central nervous system”:
<a href="https://grokipedia.com/page/warp-erp-system" rel="noopener noreferrer">
an overview of Warp</a>.
</li> <li>
The surveillance figures and their citations:
<a href="/why">xNet — Why</a>. The architecture and commitments:
<a href="/commitments">the Humane Charter</a>. The companion essay:
<a href="/blog/a-great-pirate-age">A Great Pirate Age for the Internet</a>.
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>This is an independent essay. The “Wood Wide Web” and “mother tree” are
          popular terms for a contested area of active science, used here as
          metaphor, not settled fact. Tesla and Warp are referenced as commentary;
          xNet is not affiliated with, authorized by, or endorsed by Tesla, Inc. or
          any researcher cited above. All artwork here is original.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "data-should-work-like-soil" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/data-should-work-like-soil.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/data-should-work-like-soil.astro";
const $$url = "/blog/data-should-work-like-soil";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$DataShouldWorkLikeSoil,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
