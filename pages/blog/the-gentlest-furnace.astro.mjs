import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$StarArt } from '../../chunks/StarArt_BdL0mG9A.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro$1 = createAstro("https://xnet.fyi");
const $$StarHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$StarHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#060508]"> ${renderComponent($$result, "StarArt", $$StarArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 font-mono lowercase text-amber-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/StarHero.astro", void 0);

const $$HydrostaticBalance = createComponent(($$result, $$props, $$slots) => {
  const systems = [
    {
      name: "A star",
      loop: "Negative feedback (a thermostat)",
      behaviour: "Squeeze the core and it heats, fusion speeds up, and pressure pushes back out. Let it expand and it cools, fusion slows, and gravity pulls it back in. Any nudge is self-corrected \u2014 so it neither explodes nor freezes.",
      tone: "good"
    },
    {
      name: "An attention feed",
      loop: "Positive feedback (no governor)",
      behaviour: "Engagement is rewarded with more engagement: refresh, alert, streak, repeat. Nothing pushes back toward rest, so the system runs hotter and hotter \u2014 the stellar equivalent of a giant that burns blindingly bright and then burns out.",
      tone: "bad"
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
Two ways to wire the same machine
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
A star stays whole because it has a governor. An attention feed stays
      profitable because it doesn't.
</p> <ul class="mt-6 space-y-5"> ${systems.map((s) => renderTemplate`<li class="grid gap-2 sm:grid-cols-[1fr_1.6fr] sm:gap-6 sm:items-baseline"> <div> <p${addAttribute([
    "font-mono font-semibold",
    s.tone === "good" ? "text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"
  ], "class:list")}> ${s.name} </p> <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">${s.loop}</p> </div> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${s.behaviour}</p> </li>`)} </ul> <p class="mt-6 border-t border-border pt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300"> <span class="font-semibold text-gray-900 dark:text-white">The same axis</span>
decides which one you get:
<span class="text-amber-600 dark:text-amber-400">
self-regulating · bounded · long-lived
</span>
on one end,
<span class="text-gray-500 dark:text-gray-400">
runaway · maximal · burns out
</span>
on the other.
</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HydrostaticBalance.astro", void 0);

const $$HonestStar = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      isnt: "We won\u2019t pretend the Sun is serene.",
      is: "Up close it\u2019s violence: a 15-million-kelvin core, a surface that hurls flares and coronal mass ejections. The calm we feel is a gift of scale and ninety-three million miles of distance \u2014 not the absence of fury."
    },
    {
      isnt: "We won\u2019t pretend the balance is forever.",
      is: "Equilibrium is a phase, not a virtue. In a few billion years the Sun swells into a red giant and may swallow the inner planets; Earth\u2019s surface life likely ends far sooner, as the brightening Sun boils the oceans. Stability is something you maintain, then lose."
    },
    {
      isnt: "We won\u2019t say the star \u201Cchose\u201D harmony.",
      is: "A star\u2019s coherence isn\u2019t cooperation \u2014 it\u2019s a trillion-trillion particles blindly obeying one shared law, with no planner and no stakeholders. That\u2019s the part worth borrowing: order from a shared invariant, not from a boss."
    },
    {
      isnt: "We won\u2019t tell you to \u201Cshine as bright as you can.\u201D",
      is: "The brightest stars are the shortest-lived: a heavy star burns out in a few million years, while a small, slow one can last for trillions. The gentle, long-lasting kind is the model \u2014 not the supergiant."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
An honest star
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
A metaphor that flatters itself is just more marketing. Here’s the honest version.
</p> <ul class="mt-6 space-y-5"> ${rows.map((row) => renderTemplate`<li class="grid gap-3 sm:grid-cols-[1fr_1.3fr] sm:gap-5"> <div class="flex gap-2.5"> <span class="select-none text-gray-400 dark:text-gray-600">✕</span> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${row.isnt}</p> </div> <div class="flex gap-2.5"> <span class="select-none text-amber-500">✓</span> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.is}</p> </div> </li>`)} </ul> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HonestStar.astro", void 0);

const $$Astro = createAstro("https://xnet.fyi");
const $$TheGentlestFurnace = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$TheGentlestFurnace;
  const post = postBySlug("the-gentlest-furnace");
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "StarHero", $$StarHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-amber-600 dark:prose-a:text-amber-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
The first time, we looked up — at an open sea of scattered islands, and
        the flags a person might fly to stop being someone else’s cargo. The
        second time, we looked down — under the forest floor, where a fungal
        network older than any human one trades food and news in the dark. This
        time, look up again. All the way up. Past the sea, past the canopy, to
        the thing that has been sitting in our own logo the whole while: a star.
</p> <p>
Here’s the fact that should reorganise how you think about it. The Sun
        pours out the energy of billions of bombs a second, and yet — measured
        where the fusion actually happens, in its core — it produces only about
<strong>276 watts per cubic metre</strong>. That is not the power density
        of a bomb. It’s closer to a <strong>compost heap</strong>, or a reptile’s
        metabolism. A garden bed quietly rotting puts out about as much heat per
        litre as the centre of the Sun. The Sun is overwhelming not because it burns
<em>intensely</em> but because it is <em>vast</em>, and <em>slow</em>, and
        in no hurry at all. Hold onto that, because it turns out to be the whole
        essay: the gentlest furnace in the sky is gentle <em>on purpose</em>, and
        we can learn how it does it.
</p> <h2>Why a star doesn’t explode, and doesn’t freeze</h2> <p>
A star spends almost its entire life in a state physicists call
<em>hydrostatic equilibrium</em>. Two enormous forces are locked against
        each other: <strong>gravity</strong>, crushing every layer inward toward
        the centre, and the outward <strong>pressure</strong> of hot gas and
        radiation, pushing back. At every depth, the two are matched. That alone
        would just be a tense stalemate. What makes it <em>stable</em> — what the
        sun has that a stick of dynamite doesn’t — is that the balance is
<strong>self-correcting</strong>.
</p> <p>
Suppose gravity gets the upper hand for a moment and the core contracts.
        Squeezing it makes it hotter; a hotter core fuses faster; faster fusion
        raises the pressure; and the extra pressure pushes the layers back out.
        Now suppose the opposite — the core puffs up and cools; fusion slows; the
        pressure drops; and gravity pulls it back in. Any nudge toward catastrophe
        triggers the exact response that cancels it. A star is, in the plainest
        engineering terms, a <strong>thermostat</strong>: a loop that pushes back
        toward the middle. That is why, in your words, it doesn’t explode and it
        doesn’t freeze. It isn’t being held still by willpower. It’s being held by
        a governor.
</p> <p>
Engineers have a name for that kind of loop — <em>negative feedback</em> —
        and a name for its evil twin. In <em>positive</em> feedback, a nudge in
        one direction triggers a response that makes the nudge <em>bigger</em>:
        the squeal of a microphone held too close to its own speaker, a stampede,
        a run on a bank. Positive feedback has no middle to return to. It runs
        until it hits a wall. Keep this distinction in your pocket; we’re about to
        meet a machine built entirely out of the second kind.
</p> ${renderComponent($$result2, "HydrostaticBalance", $$HydrostaticBalance, {})} <h2>How information got lighter — and we got heavier</h2> <p>
Step back and look at our species the way you’d look at a star: by its
        energy. For most of history, to move an idea you had to move
<em>matter</em>. You carved it into stone, pressed it into clay, inked it
        onto skin and pulp, bound it into books and carried the books over
        mountains. Information travelled at the speed of a mule, and every copy
        cost a forest of effort. Then the printing press made copies cheap. Then
        we learned to send thought as <strong>electrons</strong> down a copper
        wire — the telegraph, the telephone — and the mule fell away. And now we
        send it as <strong>photons</strong>: pulses of light down hair-thin glass,
        and radio through the open vacuum of space. More than
<strong>99% of the world’s intercontinental data</strong> now travels as
        light through fibre. Each rung of that ladder is faster, subtler, and cheaper
        in energy per bit than the one before.
</p> <p>
It costs less, but it never costs <em>nothing</em>. There’s a beautiful
        law here — <strong>Landauer’s principle</strong> — which says that even to
<em>erase a single bit</em> of information has a minimum, unavoidable
        energy cost, paid out as heat. Information is not some ghostly stuff
        floating above the physical world. Information <em>is</em> physical. It has
        a thermodynamic price, the same as a falling rock or a burning log. We
        have spent ten thousand years learning to pay that price more and more
        cheaply — climbing from atoms to electrons to photons, into the
        fastest-moving, most invisible layer of our own physics.
</p> <p>
And something strange happened on the way up. As information got lighter,
<em>we</em> got heavier. We tapped into that quick, subtle layer of the
        world and wired ourselves directly into it — and our bodies, which still
        keep time in heartbeats and seasons, never got the upgrade. We became more
        mental, more abstract, more <em>anxious</em>. We adapted ourselves to
        loops that consume our attention, our awareness, our hours. We climbed the
        energy ladder of information and left our nervous systems standing at the
        bottom.
</p> <h2>The loop with the governor removed — and who profits from it</h2> <p>
Remember positive feedback — the squeal, the stampede, the system with no
        middle to return to? That is the precise shape of the attention economy.
        An engagement feed is engineered so that the reward for your attention is
        a reason to give <em>more</em> attention: the refresh that loads one more
        post, the notification that pulls you back, the streak you mustn’t break,
        the bottomless scroll designed never to reach an end. There is no force in
        that system pushing you back toward rest. By design, there can’t be —
        rest is the one outcome it can’t afford.
</p> <p>
In stellar terms, the platforms aren’t building you a sun. They’re
        building you a <strong>supergiant</strong>: the rare, massive kind of star
        that blazes thousands of times brighter than ours and pays for it by
        living fast and dying young — burning through in a few million years and
        detonating, where a small, frugal star would have lasted for trillions.
        We even use the star’s own word for what happens to a person run on that
        loop. We call it <em>burnout</em> — and not by accident.
</p> <p>
And the heat is the point, because someone is selling it. The whole engine
        runs on keeping your nervous system a little dysregulated, a little
        revved, a little unable to put the thing down — because a calm person is a
        worse customer. We
<a href="/why">laid out the receipts on a separate page</a>, each one
        cited: over three years, an average person’s data reached a single
        platform from roughly <strong>2,230 different companies</strong>; combining
        the quirks of your browser and device can pick you out of the crowd —
<strong>about 99% of the time</strong> — with no cookie at all. In a star,
        the energy flows outward to warm a whole solar system. In this one, it
        flows the other way: you are the fuel, and
<a href="/why"><strong>you are being burned</strong></a>. It’s the same
        turn we reached in the <a href="/blog/a-great-pirate-age">pirate essay</a>
— there you were the cargo; here you are the fuel — seen now by starlight.
</p> <p>
Before we reach for the star as a model, one honest caveat — because the
        cosy version of the Sun is oversold, the same way the “Wood Wide Web” was.
</p> ${renderComponent($$result2, "HonestStar", $$HonestStar, {})} <p>
So we’ll keep what survives the scrutiny — which is exactly the useful
        part: a <strong>self-correcting governor</strong>, <strong>coherence that
        comes from a shared law rather than a boss</strong>, and
<strong>gentleness that comes from being vast and slow rather than locally
        intense</strong>. Take the mechanism; leave the fairy tale. That’s the
        same discipline the first two essays held to, and it’s the discipline that
        turns a pretty metaphor into something you can actually build.
</p> <h2>Coherence without a commander</h2> <p>
Here is the part that answers the quiet question under all of this: how
        does a star stay so <em>coherent</em>? From outside it looks like chaos —
        a churning, roaring ball of plasma. Inside, it’s astonishingly orderly,
        every layer doing its part, no piece working against the whole. There’s no
        misalignment in there, no committee, no stakeholders pulling in different
        directions. How?
</p> <p>
The answer is almost anticlimactic: <strong>nobody is in charge.</strong>
A star has no central planner negotiating its trillion-trillion particles
        into agreement. They cohere because they all obey the <em>same law</em> —
        gravity, pressure, and the feedback between them — with no exceptions and
        no appeals. The order is <em>emergent</em>. It comes from a shared
        invariant that everything answers to, not from an authority in the middle.
        That’s the deepest lesson the star has for the way we build things
        together: the most stable, least-misaligned systems aren’t the ones with
        the strongest ruler. They’re the ones where everyone is bound by the same
        physics.
</p> <p>
This is the same shape the pirate essay found in the open sea and the soil
        essay found underground, and it’s exactly how xNet is built. The point of
        an <a href="/build-with">open protocol</a> is that it’s a shared law, not a
        landlord. xNet’s wire format is written down once and pinned to a corpus
        of conformance tests that every implementation, in every language, has to
        pass — so independent apps and devices and hubs all stay coherent without
        anyone owning the centre. Coherence from a shared invariant, not from a
        boss. A star needs no king; neither should your data.
</p> <h2>Owning your own furnace</h2> <p>
Once you see the star as a machine, the architecture writes itself. It’s
        the move our homepage makes when it points out that
<em>Tesla built its own nervous system</em> — an in-house backbone called
        Warp wiring together every bolt and decision — and notes that they
<strong>own</strong> theirs while the rest of us <em>rent</em> ours from
        vendors who bill us and harvest us at once. A star owns its furnace. So can
        you.
</p> <ul> <li> <strong>Your own gravity well.</strong> A nebula becomes a star when
          enough scattered matter is pulled into one place to ignite. Your data
          works the same way: it’s gathered first into a store that lives
<em>on your device</em> and works with no network at all. That local
          copy is the master, the way the core is the heart of the star.
</li> <li> <strong>Ignition that needs no registry.</strong> Your identity is a
<code>did:key</code> — a key pair you generate yourself. Nothing issues
          it and nothing can revoke it. A star lights itself; so does your account.
</li> <li> <strong>Conservation laws.</strong> Energy can’t be quietly created or
          destroyed, and neither can your history: every change you make is signed
          by you and chained by hash to the one before it, so the record can’t be
          rewritten after the fact — not even by us. The past is conserved.
</li> <li> <strong>Light that obeys one constant.</strong> Every change travels as a
          signed packet over a single open protocol — the way every photon in the
          universe obeys the same speed of light. The shared constant is what lets
          strangers interoperate.
</li> <li> <strong>Radiation on purpose.</strong> A star gives freely to its whole
          system, but lawfully. When you share, you hand a peer a signed,
          revocable grant — “you may draw on this” — reciprocal and deliberate,
          never extracted behind your back.
</li> <li> <strong>The furnace you choose to orbit.</strong> You pick your sync
          hub — self-host it, use a managed one, or none at all. You are never
          captive to a single star.
</li> </ul> <p>
That’s what owning your nervous system actually means, drawn in starlight:
        a furnace you hold, govern, and can adapt — instead of one you rent from
        someone who’s warming themselves on you.
</p> <h2>Finding the equilibrium — and building for the supernova</h2> <p>
So: how do <em>we</em> find a star’s equilibrium, in a world tuned to keep
        us running hot? The same two ways the star does.
</p> <p> <strong>First, install a governor.</strong> The reason xNet can’t become an
        engagement machine isn’t good intentions — it’s a rule in the build. A
        check runs in our pipeline that <em>bans</em> the machinery of the runaway
        loop: no infinite scroll, no engineered streaks, no guilt-tripping you out
        of leaving, no behavioural-surplus trackers. It’s in the
<a href="/commitments">commitments</a> and it fails the build if someone
        tries to smuggle it in. Then take the compost-heap lesson to heart: you
        don’t have to be locally intense to carry enormous energy. You can be
<em>vast and slow</em>. Local-first software doesn’t need to yank you back
        to a server every few seconds; it can sit quietly, hold everything you
        need, and let you put it down. That is what calm technology feels like
        from the inside — a furnace that warms without consuming the person
        tending it.
</p> <p> <strong>Second, make peace with the life cycle.</strong> Stars are born
        from clouds of gas, live a long bright life fusing light elements into
        heavier ones, and then die — and here is the most important thing a star
        does. When it dies, it doesn’t vanish. It scatters the elements it forged
        back into space, and those ashes become the raw material of the next
        generation of stars, planets, and — eventually — us. The carbon in your
        hands and the iron in your blood were cooked inside a star that died before
        the Sun was born. We are, quite literally,
<strong>made of star stuff</strong>.
</p> <p>
Ideas work like this. Projects work like this. Products work like this.
        They accrete out of scattered raw material, they ignite, they do their
        bright productive work, and then — always — they end. That’s not the
        tragedy; the tragedy is when their elements can’t get out. The only
        question that matters when a thing dies is whether it goes
<em>supernova</em> — scattering what it made back into the commons to seed
        whatever comes next — or whether it collapses into a <em>black hole</em>
that swallows everything it touched and lets nothing escape. A walled
        platform is a black hole for your data. An open one is a supernova. xNet is
        built for the supernova: your identity is portable, your history is an open
        log, your schemas are a shared substrate anyone can grow in, and
<a href="/commitments">leaving loses nothing</a>. The old changes get
        digested and compacted so the network stays light; the parts worth keeping
        scatter outward and seed the next thing. Nothing precious gets trapped in
        the dark.
</p> <p>
A star carries unimaginable energy and still feels gentle from here,
        because it’s governed, because it’s patient, and because it gives more than
        it hoards. That equilibrium isn’t a mystery and it isn’t a miracle — it’s a
        design, and it’s one we can copy. Build the governor in. Be vast and slow
        instead of bright and brief. Let what you make radiate outward instead of
        collapsing inward. Burn long, not hot.
</p> <p>
So: ignite. <a href="/app">Use the app</a> — it’s free, offline, and
        private. Read <a href="/commitments">the commitments we’re built on</a>.
        Or, if you build things, <a href="/build-with">light something of your own</a>
on the open protocol. We set out to sea; we put down roots; and now we’ve
        named the star that was in the logo all along. Same open world — three
        ways of looking at it. Sea, soil, sky.
</p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li>
The gentleness paradox — the Sun’s core power density (~276 W/m³,
          “nearer reptile metabolism than a thermonuclear bomb,” comparable to a
          compost heap):
<a href="https://www.physicsforums.com/threads/power-in-suns-core-comparing-10-26-w-to-276-w-m-3.781399/" rel="noopener noreferrer">Physics Forums discussion of the Sun’s core power density</a>.
</li> <li>
Hydrostatic equilibrium and the self-regulating thermostat:
<a href="https://www.teachastronomy.com/textbook/Properties-of-Stars/Hydrostatic-Equilibrium/" rel="noopener noreferrer">Teach Astronomy — Hydrostatic Equilibrium</a>
and
<a href="https://people.umass.edu/wqd/strobel/starsun/strsunb.htm" rel="noopener noreferrer">
UMass — The Sun and Stellar Structure</a>.
</li> <li>
The life cycle of stars — nebula, main sequence, nucleosynthesis, and
          the elements scattered at death:
<a href="https://imagine.gsfc.nasa.gov/educators/lessons/xray_spectra/background-lifecycles.html" rel="noopener noreferrer">NASA — Life Cycles of Stars</a>
and
<a href="https://courses.lumenlearning.com/suny-earthscience/chapter/stellar-life-cycle/" rel="noopener noreferrer">Lumen Learning — Stellar Life Cycle</a>.
</li> <li>
The honest counterweight — the Sun’s violence, the red-giant ending, and
          why Earth’s surface life ends long before:
<a href="https://www.space.com/22471-red-giant-stars.html" rel="noopener noreferrer">
Space.com — Red giant stars</a>,
<a href="https://theconversation.com/the-sun-wont-die-for-5-billion-years-so-why-do-humans-have-only-1-billion-years-left-on-earth-37379" rel="noopener noreferrer">The Conversation — ~1 billion years left on Earth</a>, and
<a href="https://www.quantamagazine.org/new-clues-for-what-will-happen-when-the-sun-eats-the-earth-20231220/" rel="noopener noreferrer">Quanta — when the Sun eats the Earth</a>.
</li> <li>
Bright-and-brief vs. slow-and-lasting — the mass–lifetime relation
          (massive stars burn out in millions of years; red dwarfs last for
          trillions):
<a href="https://www.space.com/22437-main-sequence-star.html" rel="noopener noreferrer">
Space.com — Main sequence stars</a>
and
<a href="https://www.astronomy.com/science/if-supermassive-stars-burn-their-fuel-in-millions-of-years-and-solar-mass-stars-like-our-sun-last-billions-of-years-then-how-long-is-the-life-of-a-red-or-brown-dwarf-star/" rel="noopener noreferrer">Astronomy.com — red and brown dwarf lifetimes</a>.
</li> <li>
The physics of information — Landauer’s principle (erasing a bit has a
          minimum energy cost; “information is physical”) and the atoms → electrons
          → photons ladder (fibre now carries &gt;99% of the world’s data):
<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC7514250/" rel="noopener noreferrer">
The Landauer Principle (review)</a>
and
<a href="https://www.corning.com/emea/en/innovation/the-glass-age/science-of-glass/how-it-works-optical-fiber.html" rel="noopener noreferrer">Corning — How optical fiber works</a>.
</li> <li>
The surveillance figures and their citations:
<a href="/why">xNet — Why</a>. The architecture and commitments:
<a href="/commitments">the Humane Charter</a>. The companion essays:
<a href="/blog/a-great-pirate-age">A Great Pirate Age for the Internet</a>
and
<a href="/blog/data-should-work-like-soil">Data Should Work Like Soil</a>.
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>This is an independent essay. The “serene, eternal Sun” is a popular
          gloss on a violent, finite object, used here as metaphor, not settled
          cosmology. Tesla and Warp are referenced as commentary; xNet is not
          affiliated with, authorized by, or endorsed by Tesla, Inc. All artwork
          here is original.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "the-gentlest-furnace" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/the-gentlest-furnace.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/the-gentlest-furnace.astro";
const $$url = "/blog/the-gentlest-furnace";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$TheGentlestFurnace,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
