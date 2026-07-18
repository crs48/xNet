import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$DustArt } from '../../chunks/DustArt_DrFB-vOR.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$DustHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$DustHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#0a0806]"> ${renderComponent($$result, "DustArt", $$DustArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 font-mono lowercase text-amber-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/DustHero.astro", void 0);

const $$DustBridge = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      eco: "A desert that looks dead",
      web: "Open protocols, RSS, email, DNS \u2014 and the maintainers nobody thanks. The boring, inert-looking substrate."
    },
    {
      eco: "~22,000 tons of phosphorus a year, lofted across an ocean",
      web: "Standards, specs, and unpaid labor flowing upward into everything that looks alive."
    },
    {
      eco: "\u2248 exactly what the forest loses to rain",
      web: "The commons silently replacing what the platforms strip-mine out of it."
    },
    {
      eco: "Cut the dust and the forest starves \u2014 slowly, and far from the cause",
      web: "Enclose the commons and the web decays \u2014 quietly, years later, blamed on everything else."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
The forest isn't self-sufficient. Neither is the web.
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
A dead lakebed in Chad fertilizes the most alive place on Earth — replacing
      almost exactly what the rainforest loses. The visible web runs on the same
      kind of subsidy, from a substrate it never pays for.
</p> <!-- schematic: desert → wind → forest, with the runoff that closes the loop --> <svg class="mt-6 w-full" viewBox="0 0 720 150" role="img" aria-label="Saharan dust lofts across the Atlantic and settles on the Amazon, replacing the phosphorus the rainforest loses to rain runoff."> <defs> <marker id="db-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"> <path d="M0 0 L10 5 L0 10 z" fill="#d9a441"></path> </marker> <marker id="db-loss" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"> <path d="M0 0 L10 5 L0 10 z" fill="#94a3b8"></path> </marker> </defs> <!-- the desert --> <g> <rect x="20" y="78" width="150" height="40" rx="6" fill="#c2842f" opacity="0.18"></rect> <text x="95" y="102" text-anchor="middle" class="fill-amber-700 dark:fill-amber-300" font-size="13" font-weight="600">
Bodélé dust
</text> <text x="95" y="133" text-anchor="middle" class="fill-gray-500 dark:fill-gray-400" font-size="10.5">
fossil diatoms
</text> </g> <!-- the crossing --> <path d="M178 86 Q360 18 542 86" fill="none" stroke="#d9a441" stroke-width="2" stroke-dasharray="3 4" marker-end="url(#db-arrow)"></path> <text x="360" y="34" text-anchor="middle" class="fill-gray-500 dark:fill-gray-400" font-size="10.5">
~27.7M tons / year across the Atlantic
</text> <!-- the forest --> <g> <rect x="550" y="78" width="150" height="40" rx="6" fill="#1f6b3f" opacity="0.18"></rect> <text x="625" y="102" text-anchor="middle" class="fill-emerald-700 dark:fill-emerald-300" font-size="13" font-weight="600">
Amazon canopy
</text> <text x="625" y="133" text-anchor="middle" class="fill-gray-500 dark:fill-gray-400" font-size="10.5">
phosphorus-poor soil
</text> </g> <!-- the loss that closes the loop --> <path d="M625 118 q70 6 78 -34" fill="none" stroke="#94a3b8" stroke-width="1.6" stroke-dasharray="2 4" marker-end="url(#db-loss)" opacity="0.8"></path> <text x="712" y="78" text-anchor="end" class="fill-gray-400 dark:fill-gray-500" font-size="10">
lost to rain
</text> </svg> <ul class="mt-6 space-y-4 border-t border-border pt-6"> ${rows.map((row) => renderTemplate`<li class="grid gap-2 sm:grid-cols-[1fr_1.4fr] sm:gap-6 sm:items-baseline"> <p class="text-sm font-medium leading-relaxed text-amber-700 dark:text-amber-300">${row.eco}</p> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.web}</p> </li>`)} </ul> <p class="mt-6 border-t border-border pt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300"> <span class="font-semibold text-gray-900 dark:text-white">The forest can't see the desert</span>
that feeds it, so it's easy to mistake the canopy for the whole story. The web
      makes the same mistake — and the substrate is depletable.
</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/DustBridge.astro", void 0);

const $$HonestDesert = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      isnt: "We won\u2019t pretend the bees grew a rainforest.",
      is: "The video that started this \u2014 millions of \u201Cfrozen bees\u201D airlifted into the Sahara to make it bloom \u2014 is fiction, AI-narrated for the click. You can\u2019t do that, and nobody did. The real marvels are quieter and far better documented: the dust bridge, and the keystone bee."
    },
    {
      isnt: "We won\u2019t pretend the balance is exact.",
      is: "\u201CThe dust delivers exactly what the Amazon loses\u201D is a headline. The phosphorus figure (~22,000 tons/yr) is a satellite-era estimate with real error bars, and how much of it plants can actually use is still debated. It\u2019s close enough to be astonishing \u2014 not an accountant\u2019s match."
    },
    {
      isnt: "We won\u2019t say \u201Csave the bees\u201D and mean the honeybee.",
      is: "The honeybee is a managed, semi-domesticated mascot with great PR. The load-bearing pollination is done by thousands of solitary species with none \u2014 and they\u2019re the ones quietly disappearing while the mascot gets the posters."
    },
    {
      isnt: "We won\u2019t pretend open protocols run themselves.",
      is: "The commons is real but it isn\u2019t free. Maintainer attention is finite and depletable; calling open infrastructure \u201Cfree\u201D is precisely how it gets strip-mined. A substrate you don\u2019t replenish is one you\u2019re spending down."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
An honest desert
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
A metaphor that flatters itself is just more marketing. Here’s the honest version.
</p> <ul class="mt-6 space-y-5"> ${rows.map((row) => renderTemplate`<li class="grid gap-3 sm:grid-cols-[1fr_1.3fr] sm:gap-5"> <div class="flex gap-2.5"> <span class="select-none text-gray-400 dark:text-gray-600">✕</span> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${row.isnt}</p> </div> <div class="flex gap-2.5"> <span class="select-none text-amber-500">✓</span> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.is}</p> </div> </li>`)} </ul> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HonestDesert.astro", void 0);

const $$TheDesertThatFeedsTheForest = createComponent(($$result, $$props, $$slots) => {
  const post = postBySlug("the-desert-that-feeds-the-forest");
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "DustHero", $$DustHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-amber-600 dark:prose-a:text-amber-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
The first time, we looked up — at an open sea of scattered islands and the
        flags you might fly to stop being someone else’s cargo. The second time, we
        looked down — under the forest floor, where a fungal network older than any
        human one trades food and news in the dark. The third time, we looked all
        the way up, to the star that was in our logo the whole while. This time,
        look <em>across</em> — at the wind, and at a thing it carries that almost
        nobody has ever noticed.
</p> <p>
I got here by way of a video with a thumbnail engineered for your thumb:
<em>“They Dropped Millions of Frozen Bees into the Sahara. 1 Year Later, the
        Results Are Unbelievable!”</em> More than a million people have watched it.
        It is, to be blunt, fiction — an AI-narrated “documentary” about an
        experiment that never happened, with fake chapters and a premise that falls
        apart the moment you poke it. You cannot airlift frozen bees into the
        deadliest desert on Earth and get a jungle. But clumsy as it was, it was
<em>pointing</em> at something — two real things, actually — and the real
        things are stranger and lovelier than the lie. That’s the whole essay, so
        let’s say it once, plainly: <strong>the important thing is almost never the
        thing on the surface.</strong> It’s the part nobody optimised for a
        thumbnail.
</p> <h2>The most lifeless place on Earth feeds the most alive one</h2> <p>
Here is the fact that should rearrange how you see a map. Every year, on the
        order of <strong>27.7 million tons</strong> of Saharan dust ride the wind
        clear across the Atlantic and settle onto the <strong>Amazon rainforest</strong>
— the share that finishes the crossing, out of the roughly 182 million tons
        that lift off the desert in all. Not a stray gust: a planetary conveyor belt,
        measured from orbit by NASA’s CALIPSO satellite across seven years of data.
        So the most lifeless place on the planet is quietly raining fertiliser on
        the most alive one, four thousand miles away.
</p> <p>
And it isn’t just dirt. The Amazon sits on ancient, weather-beaten soil that
        is desperately short of <strong>phosphorus</strong> — the one nutrient a
        forest can’t grow without — because the heavy rains that make a rainforest a
        rainforest also wash the phosphorus out, year after year. The dust carries
        roughly <strong>22,000 tons of phosphorus</strong> with it, and here is the
        part that sounds invented: that’s close to the <em>exact amount the forest
        loses to the rain</em>. The desert refills the leak. Cut off the dust, and
        the greatest forest on Earth would slowly, quietly begin to starve — and it
        would happen so far from the cause that nobody watching the trees die would
        ever think to blame a desert.
</p> <p>
Now follow the dust back to its source, because this is where it stops being
        a nice fact and starts being a parable. The richest of it comes from one
        place: the <strong>Bodélé Depression</strong> in Chad, a cracked white
        wasteland that was, within the last several thousand years, the bed of a vast
        freshwater lake. The phosphorus is so concentrated there because the dust is
        made largely of <strong>diatoms</strong> — the skeletons of microscopic
        creatures that lived and died in that lake before recorded history. So the
        true story is this: <strong>the fossils of life that died millennia ago,
        blown off the floor of a lake that no longer exists, are what keep a living
        rainforest breathing today.</strong> Death feeds life. The wasteland is the
        supply line. And not one creature in that forest has the faintest idea.
</p> ${renderComponent($$result2, "DustBridge", $$DustBridge, {})} <h2>The bee nobody watches</h2> <p>
The video was wrong about the bees, but it was wrong in an interesting
        direction, because there <em>are</em> desert bees, and they are their own
        small miracle of the invisible. When you picture a bee, you picture the
        honeybee: the hive, the honey, the waggle dance, the mascot on the “save the
        bees” tote bag. But the honeybee is the exception. <strong>Most bees are
        solitary</strong> — no hive, no colony, no honey, no brand. And the desert
        species are the most patient creatures you’ll never see: they wait out the
        drought sealed underground, sometimes for years, and emerge only when the
        rare rains bring a bloom worth pollinating.
</p> <p>
They work like a <strong>keystone species</strong> — small in
        number, invisible in operation, catastrophic in absence. The pollination
        they do quietly holds up the wildflowers, which hold up the insects, which
        hold up the birds and the lizards and everything above them. Pull the
        keystone and the arch comes down. And yet they get no posters. The
        charismatic, managed honeybee is the face of the cause; the unbranded
        solitary bees do an enormous share of the actual work — and they are the
        ones genuinely, quietly vanishing. We are very good at noticing the mascot.
        We are terrible at noticing the worker.
</p> <p>
Hold those two pictures together — the dust you can’t see and the bee you
        never watch — because they’re the same picture. <strong>A visible, thriving
        world resting on an invisible substrate that gets no credit and no
        protection.</strong> Once you’ve seen that shape in the desert, you start
        seeing it everywhere. Including in the thing you are reading this on.
</p> <h2>The web is a forest that forgot its desert</h2> <p>
The internet you actually touch — the apps, the feeds, the five glassy
        platforms where most people now spend their hours — feels gloriously
        self-sufficient. It looks like the Amazon: lush, busy, obviously alive. But
        it is not self-sufficient, any more than the forest is. It is fed, every
        second, by a substrate almost nobody looks at: the <strong>open
        protocols</strong>. HTTP and DNS and TCP/IP and email and RSS — the plain,
        unglamorous, decades-old agreements that let a message from anywhere arrive
        anywhere. Nobody owns them. Nobody monetises them directly. They are the
        dust on the wind, and the entire visible web grows in them.
</p> <p>
And like the dust, they have a source made of patient, half-forgotten
        labor. A researcher named Nadia Eghbal wrote the definitive account of it,
        and her title says it all: <em>Roads and Bridges: The Unseen Labor Behind
        Our Digital Infrastructure</em>. The open-source maintainers who keep the
        world’s code alive, she argued, are <strong>the keystone species of digital
        infrastructure</strong> — there it is again — doing work that is, in her
        words, <em>“invisible precisely because it works.”</em> You only ever see it
        when it breaks. The whole web shuddered when a single under-funded encryption
        library sprang the <strong>Heartbleed</strong> bug; for one news cycle
        everyone learned that the padlock in their browser had been quietly held up,
        for years, by a tiny handful of volunteers. Then the cycle ended and we
        forgot again. The dust kept blowing. Nobody thanked it.
</p> <p>
So what is Big Tech, in this picture? It is the <strong>monoculture</strong>.
        A walled platform is a plantation: from a distance, dense and green and
        productive — and up close, a system that strip-mines the substrate it grows
        in and puts nothing back. It takes the open protocols, the free labor, the
        shared standards, and the public square of human conversation, and it
        encloses them — wraps a fence around the commons and sells you a ticket back
        in. For a while the plantation thrives, because the soil it inherited was
        rich. But a monoculture sterilizes its own ground. It kills the link, the
        open API, the small independent site, the interoperable feed — the very
        dust that fed it — and the loss is slow and deniable, the way a far-off
        forest starves long after the wind has stopped. We have a name for the
        result already. People call it the <em>dead internet</em>, and they say it
        sadly, and they mostly blame the trees.
</p> <p>
Now for the honest part, because the cosy version of this — “the noble open
        web versus the wicked platforms” — is oversold the same way the “frozen bees”
        were.
</p> ${renderComponent($$result2, "HonestDesert", $$HonestDesert, {})} <p>
Keep what survives the scrutiny, because it’s the useful part: a
<strong>visible world standing on an invisible substrate</strong>, and that
        substrate is <strong>depletable</strong> — you can spend it down to nothing
        if you only ever extract from it. That’s not a fairy tale; that’s an
        engineering problem. And engineering problems have solutions.
</p> <h2>Build like the dust, not like the plantation</h2> <p>
Here is the choice, drawn as plainly as the desert draws it. You can build
        like the <strong>plantation</strong> — enclose what you didn’t make, extract
        until the ground is dead, and call the green months “growth.” Or you can
        build like the <strong>dust</strong> — be the substrate that travels freely,
        asks for nothing, and quietly refills the leak so the living thing
        downstream keeps breathing. xNet is a bet, with receipts, on the second one.
</p> <ul> <li> <strong>You hold the master copy.</strong> Your data lives on your device
          first and works with no network at all; there is no behavioural surplus
          harvested behind your back, because there’s no place in the architecture
          to put it. The plantation’s whole economy is harvesting you. The dust
          doesn’t harvest anyone — you can read that in our
<a href="/commitments">commitments</a>, and a check in the build fails if
          anyone tries to smuggle a tracker in.
</li> <li> <strong>Leaving loses nothing.</strong> Your identity is a
<code>did:key</code> you generate yourself — nothing issues it, nothing
          can revoke it, and it works on any hub. Your history is an open, signed,
          hash-chained log, not a vendor blob. You can take everything and go, the
          way dust owes no allegiance to the desert it left. A platform that makes
          leaving cost you is a fence; an open one is the open sky.
</li> <li> <strong>Coherence from a shared law, not a landlord.</strong> Every change
          travels as a signed packet over one
<a href="/build-with">open protocol</a>, pinned to a corpus of conformance
          tests every implementation has to pass. Strangers interoperate because
          they obey the same rules, not because they rent the same server. That’s
          how dust from one continent nourishes a forest on another: a shared
          chemistry, not a contract.
</li> <li> <strong>Calm on purpose.</strong> No infinite scroll, no engagement
          ranking, no streaks engineered around the fear of losing them. We don’t
          compete for your time; we compete for your wellbeing. The dust isn’t
          trying to keep you scrolling — it’s trying to leave the ground better than
          it found it.
</li> </ul> <p>
None of that is charity, and none of it is new. It’s just the oldest pattern
        in the living world, the one the Sahara has been running on the Amazon since
        before there were people to miss it: <strong>give more than you take, freely,
        to something that can’t see you doing it.</strong> A forest that’s fed that
        way doesn’t owe the desert. It just gets to keep being a forest.
</p> <h2>Notice the invisible thing</h2> <p>
We went looking, half as a joke, in a clickbait video about frozen bees. We
        found a dead lake in Chad keeping the Amazon alive, a bee that waits years
        underground for one good rain, and a handful of unpaid maintainers holding
        up the padlock on every page you visit. The lesson is the same in all three,
        and it’s the lesson the open web most needs us to learn: <strong>the thing
        doing the most important work is usually the thing you can’t see, can’t
        name, and never thank.</strong> The dust. The bee. The protocol. The
        maintainer. The commons.
</p> <p>
So notice it. Read <a href="/why">the receipts</a> on what the visible web
        actually costs you — over three years, the average person’s data reached a
        single platform from roughly <strong>2,230 different companies</strong>;
        your device’s quirks alone can pick you out of the crowd about
<strong>99%</strong> of the time. Then go build, or use, or fund something
        that <em>feeds</em> the forest instead of farming it. <a href="/app">Use the
        app</a> — it’s free, offline, and private. Or
<a href="/build-with">build something of your own</a> on the open protocol,
        and become a little more dust on the wind.
</p> <p>
We set out to sea; we put down roots; we named the star in the logo; and now
        we’ve followed the wind across an ocean to a forest that doesn’t know what
        keeps it alive. Same open world — four ways of looking at it. Sea, soil,
        sky, and the sand that crosses between them.
</p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li>
The dust bridge — ~27.7 million tons of Saharan dust reaching the Amazon
          each year, carrying ~22,000 tons of phosphorus, close to what the forest
          loses to runoff, measured by the CALIPSO satellite:
<a href="https://www.nasa.gov/centers-and-facilities/goddard/nasa-satellite-reveals-how-much-saharan-dust-feeds-amazons-plants/" rel="noopener noreferrer">NASA Goddard — How much Saharan dust feeds the Amazon’s plants</a>
and
<a href="https://www.sciencedaily.com/releases/2015/02/150224102847.htm" rel="noopener noreferrer">
ScienceDaily — Saharan dust fertilises the Amazon (Yu et al., 2015)</a>.
</li> <li>
The Bodélé Depression — an ancient lakebed whose phosphorus-rich dust is
          largely the fossils of freshwater diatoms:
<a href="https://earthsky.org/earth/saharan-dust-feeds-amazon-rainforest-perfectly/" rel="noopener noreferrer">
EarthSky — Saharan dust feeds the Amazon, perfectly</a>
and
<a href="https://news.mongabay.com/2015/03/how-the-sahara-keeps-the-amazon-rainforest-going/" rel="noopener noreferrer">
Mongabay — How the Sahara keeps the Amazon going</a>.
</li> <li>
Solitary desert bees as invisible keystone pollinators (most bees are not
          honeybees; desert species lie dormant and emerge after rain):
<a href="https://tellus.ars.usda.gov/stories/articles/specialized-bees-power-desert-ecosystems" rel="noopener noreferrer">
USDA-ARS — Specialized bees power desert ecosystems</a>.
</li> <li>
The invisible labor under the web — open-source maintainers as the
          “keystone species” of digital infrastructure, “invisible precisely because
          it works,” and the Heartbleed wake-up:
<a href="https://www.fordfoundation.org/media/2976/roads-and-bridges-the-unseen-labor-behind-our-digital-infrastructure.pdf" rel="noopener noreferrer">
Nadia Eghbal — Roads and Bridges (Ford Foundation, 2016)</a>
and
<a href="https://xkcd.com/2347/" rel="noopener noreferrer">xkcd 2347 — “Dependency.”</a> </li> <li>
The surveillance figures and their citations:
<a href="/why">xNet — Why</a>. The architecture and commitments:
<a href="/commitments">the Humane Charter</a>. The companion essays:
<a href="/blog/a-great-pirate-age">A Great Pirate Age for the Internet</a>,
<a href="/blog/data-should-work-like-soil">Data Should Work Like Soil</a>,
          and <a href="/blog/the-gentlest-furnace">The Gentlest Furnace</a>.
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>This is an independent essay. The “frozen bees in the Sahara” video is
          referenced as the sensational surface that pointed, accidentally, at real
          science; the dust-bridge and pollinator figures are real but rounded, and
          are used here as metaphor, not as a precise ecological model. All artwork
          here is original.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "the-desert-that-feeds-the-forest" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/the-desert-that-feeds-the-forest.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/the-desert-that-feeds-the-forest.astro";
const $$url = "/blog/the-desert-that-feeds-the-forest";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$TheDesertThatFeedsTheForest,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
