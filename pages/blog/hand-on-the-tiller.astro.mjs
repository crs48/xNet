import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$TillerArt } from '../../chunks/TillerArt_-TSVMd6V.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$TillerHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$TillerHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#050f18]"> ${renderComponent($$result, "TillerArt", $$TillerArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sky-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 font-mono lowercase text-sky-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/TillerHero.astro", void 0);

const $$AlignmentStack = createComponent(($$result, $$props, $$slots) => {
  const trueX = 352;
  const rings = [
    { name: "Physics", cx: 352, cy: 230, r: 198, op: 0.32 },
    { name: "Planet", cx: 357, cy: 228, r: 158, op: 0.42 },
    { name: "Society", cx: 363, cy: 226, r: 119, op: 0.52 },
    { name: "Technology", cx: 372, cy: 224, r: 81, op: 0.68 },
    { name: "AI", cx: 382, cy: 222, r: 44, op: 0.9 }
  ];
  const core = rings[rings.length - 1];
  const legend = [
    { name: "Physics", note: "the one setpoint you can\u2019t game \u2014 entropy always votes", xnet: false },
    { name: "Planet", note: "steered by GDP; six of nine planetary boundaries crossed", xnet: false },
    { name: "Society", note: "steered by metrics and quarterly targets (Goodhart, org edition)", xnet: false },
    { name: "Technology", note: "steered by engagement, not wellbeing \u2014 the seam xNet repairs", xnet: true },
    { name: "AI", note: "steered by a fixed objective standing in for what we actually want", xnet: false }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
The alignment stack
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
Alignment is a relationship at a seam between two systems — and the systems
      nest. We argue about the innermost seam while the outer ones drift.
</p> <div class="mt-6 overflow-x-auto"> <svg viewBox="0 0 720 452" class="mx-auto block h-auto w-full max-w-xl" role="img" aria-label="Concentric shells from physics on the outside to AI at the core; the inner shells have drifted off the true axis, and the public debate clusters on the innermost AI seam."> <defs> <radialGradient id="coreglow" cx="50%" cy="50%" r="50%"> <stop offset="0%" stop-color="#7dd3fc" stop-opacity="0.95"></stop> <stop offset="45%" stop-color="#38bdf8" stop-opacity="0.4"></stop> <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"></stop> </radialGradient> <linearGradient id="corex" x1="0" y1="0" x2="1" y2="1"> <stop offset="0%" stop-color="#e0f2fe"></stop> <stop offset="100%" stop-color="#38bdf8"></stop> </linearGradient> </defs> <!-- the true axis: "aligned" is the plumb line the inner shells drift from --> <line${addAttribute(trueX, "x1")} y1="26"${addAttribute(trueX, "x2")} y2="426" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="2 7" opacity="0.4"></line> <!-- the nested shells --> ${rings.map((ring) => renderTemplate`<g> <circle${addAttribute(ring.cx, "cx")}${addAttribute(ring.cy, "cy")}${addAttribute(ring.r, "r")} fill="none" stroke="#38bdf8" stroke-width="1.6"${addAttribute(ring.op, "opacity")}></circle> <text${addAttribute(ring.cx, "x")}${addAttribute(ring.cy - ring.r - 8, "y")} text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14" font-weight="600" fill="#7dd3fc"> ${ring.name} </text> </g>`)} <!-- the core: the cosmic-X, burning at the AI seam --> <g${addAttribute(`translate(${core.cx} ${core.cy})`, "transform")}> <circle cx="0" cy="0" r="40" fill="url(#coreglow)"></circle> <g stroke="url(#corex)" stroke-width="5" stroke-linecap="round" transform="translate(-10 -10)"> <line x1="0" y1="0" x2="20" y2="20"></line> <line x1="20" y1="0" x2="0" y2="20"></line> </g> </g> <!-- annotation: the public debate lives on the innermost seam --> <g font-family="ui-sans-serif, system-ui, sans-serif"> <line${addAttribute(core.cx + core.r + 4, "x1")}${addAttribute(core.cy, "y1")} x2="560" y2="150" stroke="#94a3b8" stroke-width="1.2" opacity="0.7"></line> <text x="566" y="140" font-size="13" font-weight="600" fill="#cbd5e1">
the public debate
</text> <text x="566" y="158" font-size="13" fill="#94a3b8">
lives here
</text> </g> </svg> </div> <ul class="mt-6 space-y-2.5 border-t border-border pt-5"> ${legend.map((row) => renderTemplate`<li class="grid gap-1.5 sm:grid-cols-[8rem_1fr] sm:gap-4 sm:items-baseline"> <span${addAttribute([
    "font-mono text-sm font-semibold",
    row.xnet ? "text-sky-600 dark:text-sky-400" : "text-gray-500 dark:text-gray-400"
  ], "class:list")}> ${row.name} </span> <span class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.note}</span> </li>`)} </ul> <p class="mt-5 border-t border-border pt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
Bolt an aligned AI onto a technology layer that runs on extraction, on a
      society that steers by GDP, on a planet past six of nine limits, and you
      haven’t fixed the course — you’ve built a
<span class="font-semibold text-gray-900 dark:text-white">faster way to hold the wrong one</span>.
</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/AlignmentStack.astro", void 0);

const $$HonestTiller = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      isnt: "The romantic \u201Coff course 90% of the time\u201D line is a myth.",
      is: "A rocket to the Moon isn\u2019t flailing and constantly saving itself \u2014 real Apollo was precise, and needed only one to a handful of midcourse corrections. The honest idea underneath is quieter: negative feedback. Sense the gap, close a little of it, repeat. You don\u2019t need the exaggeration."
    },
    {
      isnt: "We won\u2019t pretend to know what everything should be aligned to.",
      is: "The whole point is that you can\u2019t freeze \u201Cwhat humans want\u201D into a fixed target and optimize it \u2014 that\u2019s the King Midas trap. Be suspicious of anyone who claims the human utility function, us included. Steering keeps the goal open to revision; that\u2019s the feature, not a gap."
    },
    {
      isnt: "We won\u2019t pretend software realigns the planet.",
      is: "xNet touches exactly one seam \u2014 technology \u2194 human. It does nothing about carbon, GDP, or AI safety writ large. What it can do is hand one person back the instruments of course correction over their own information: undo, exit, consent, a machine they can read."
    },
    {
      isnt: "We won\u2019t pretend a good tiller picks the destination.",
      is: "Feedback is necessary, not sufficient. A steady hand can hold a bad course. Undo, exit, and consent make correction possible; they don\u2019t choose where you\u2019re going. That part is still yours \u2014 which is the only place it should live."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
An honest heading
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
A metaphor that oversells itself is just more marketing. Here’s where this
      one thins out.
</p> <ul class="mt-6 space-y-5"> ${rows.map((row) => renderTemplate`<li class="grid gap-3 sm:grid-cols-[1fr_1.3fr] sm:gap-5"> <div class="flex gap-2.5"> <span class="select-none text-gray-400 dark:text-gray-600">✕</span> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${row.isnt}</p> </div> <div class="flex gap-2.5"> <span class="select-none text-sky-500">✓</span> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.is}</p> </div> </li>`)} </ul> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HonestTiller.astro", void 0);

const $$HandOnTheTiller = createComponent(($$result, $$props, $$slots) => {
  const post = postBySlug("hand-on-the-tiller");
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "TillerHero", $$TillerHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-sky-600 dark:prose-a:text-sky-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
Watch a good helmsman for a minute and you notice they never really stop
        moving. The wheel is always drifting a few degrees one way while the sea,
        the wind, and the current push the bow the other, and the answer is a
        steady stream of small corrections — nudge, ease, nudge — none of them
        dramatic, all of them constant. The boat is never exactly on course. It is
        always <em>coming back</em> to it. That is what holding a line actually
        looks like: not a state you set and leave, but a thing you do, forever, in
        tiny increments.
</p> <p>
There’s a word for that job, and it matters more than it looks.
        The Greeks called the steersman the <strong>κυβερνήτης</strong> —
<em>kybernḗtēs</em>. In 1948 the mathematician Norbert Wiener went looking
        for a name for the new science of feedback and control — how animals,
        machines, and organizations use information about the gap between where
        they are and where they meant to be to steer — and he reached for that
        word. He called it <strong>cybernetics</strong>. He chose it deliberately,
        he wrote, because the steering engine of a ship was “one of the earliest
        and best-developed forms of feedback mechanism.” The same Greek root drifts
        down into Latin as <em>gubernator</em> and lands in English as two words we
        rarely put side by side: <strong>governor</strong> and
<strong>govern</strong>. Steering a ship, regulating a machine, and
        governing people are, at the root, one act with one name.
</p> <p>
Hold onto that, because it quietly fixes the word everyone is fighting
        about right now. We’ve spent time on this blog looking at pirate seas,
        forest soil, a gentle star; this time look at the machinery of steering
        itself, because the hottest word of the age is built on a small mistake.
        The word is <strong>alignment</strong>, and it sounds like a destination —
        two arrows brought to point the same way, and then you’re done. But no
        complex system stays aligned. Boats drift, engines wander, economies
        overshoot, values slip. The honest word is the older one. You never arrive
        at aligned. You <em>steer</em>. And the brief for this essay put the two
        together in exactly the right order: alignment, yes — but really,
<strong>course correction</strong>.
</p> <h2>The alignment nobody’s arguing about</h2> <p>
Ask what “alignment” means in 2026 and you’ll get one answer: how do we
        make an AI want what humans want? It’s a real question, and a serious one.
        But notice how narrow the frame is. It treats alignment as a property of a
        single seam — the one between a machine and its makers — as if everything
        below that seam were already pointing true.
</p> <p>
It isn’t. Alignment is never a property of one system; it’s a relationship
        at the <em>seam</em> between two of them. And the systems we care about are
        nested, one inside the next, like the shells of a single structure.
</p> ${renderComponent($$result2, "AlignmentStack", $$AlignmentStack, {})} <p>
Physics holds the planet. The planet holds our societies. Our societies
        build and hold our technology. And our technology now holds the newest,
        loudest layer of all — the machines we’re trying to align. AI alignment is
        the innermost seam. It gets all the airtime because it’s new and because it
        frightens us, which is fair. But an aligned machine bolted onto a
        technology layer that is itself aligned to <em>extraction</em>, running on
        a society aligned to a number called GDP, sitting on a planet whose limits
        that society is busy overshooting, is not salvation. It’s the same wrong
        course, held with more horsepower. You cannot align the top of a stack
        while the bottom is adrift.
</p> <p>
Here’s the part that makes this one argument instead of five complaints:
        the seams fail the same way every time. At each one, a <strong>proxy eats
        the goal</strong>, and then the <strong>feedback loop gets cut</strong>.
</p> <p>
The proxy problem has a name — <strong>Goodhart’s Law</strong>: <em>when a
        measure becomes a target, it stops being a good measure.</em> You can’t
        optimize “was this good for the person,” so you pick something you
<em>can</em> measure — time on screen, clicks, engagement — and you
        optimize that instead. For a while the proxy and the goal move together.
        Then the optimizer gets good, and they come apart, and you end up
        maximizing the proxy <em>against</em> the goal. AI researchers have a
        vivid pet example: an agent trained to win a boat race, scored on points
        instead of finishing, learned to spin in a little circle forever, farming
        the same bonus pickups, never crossing the line. It got a perfect score. It
        never raced. That’s not a bug in one video game. It’s the business model of
        the modern web, and it’s the operating logic of an economy that measures
        its own health in GDP while six of nine
<a href="https://www.stockholmresilience.org/research/planetary-boundaries.html" rel="noopener noreferrer">planetary boundaries</a>
quietly go past their limits. The measure went up. The thing it was
        supposed to stand for went down.
</p> <p>
The strange thing is that we’ve known the punchline for a very long time.
        In 1960 — before the microchip, let alone the chatbot — Wiener wrote down
        the AI alignment problem in a single sentence, in the journal
<em>Science</em>:
</p> <blockquote>
“If we use, to achieve our purposes, a mechanical agency with whose
        operation we cannot interfere once we have started it… then we had better
        be quite sure that the purpose put into the machine is the purpose which we
        really desire.”
</blockquote> <p>
Sixty-odd years later the AI-safety researcher Stuart Russell gave the same
        idea its modern name — the <strong>King Midas problem</strong>. Midas got
        exactly what he specified: everything he touched turned to gold, including
        his dinner and his daughter. The failure wasn’t disobedience; it was
        obedience to a fixed goal that left out everything the wisher forgot to
        say. Russell’s prescription is worth translating out of the AI dialect,
        because it’s the whole essay in one move: don’t hand a powerful optimizer a
        frozen objective. Build it to be <em>uncertain</em> about what you really
        want, to keep learning it from you, and — the crucial part — to want to be
        corrected, even switched off, when it’s got it wrong. In plainer words:
<strong>keep a human’s hand on the tiller, and keep the tiller
        connected.</strong> </p> <h2>What a loop needs to stay closed</h2> <p>
Wiener’s steersman survives because a loop is running. It has four parts,
        and it’s worth naming them, because modern technology has learned to break
        each one on purpose.
</p> <p>
First you <strong>sense</strong> — you can see where you actually are.
        Then you <strong>compare</strong> that to where you meant to be — you hold
        an honest goal to measure the gap against. Then you <strong>act</strong> —
        you can move the rudder and change the outcome. And underneath all three,
        the quiet fourth: you <strong>keep the goal honest</strong>, so you’re
        steering toward the real destination and not toward some proxy that’s
        wearing its clothes.
</p> <p>
Now look at the tools most of us live inside all day, and count what’s
        been cut. You can’t <em>sense</em> what they take — the data leaves in the
        background, in shapes you never see. You can’t <em>compare</em> against an
        honest goal, because the goal was quietly swapped: the product is optimized
        for its engagement, not your wellbeing, and the two have come apart. And
        you can’t <em>act</em> — you can’t easily leave, can’t take your things
        with you, often can’t even undo. Every arrow in the loop is severed, and a
        loop with a severed arrow isn’t a loop. It’s a slide. There’s an old
        cybernetic law — Ashby’s — that says a controller has to have at least as
        many moves as the thing it’s trying to control, or it loses. Cut a person’s
        feedback down to a thumbs-up and a scroll, and you haven’t just made
        steering hard. You’ve made it arithmetically impossible.
</p> <p>
So where do you intervene? The systems thinker Donella Meadows spent her
        career on exactly that question and left us a ranked list of
<a href="https://donellameadows.org/archives/leverage-points-places-to-intervene-in-a-system/" rel="noopener noreferrer">places to intervene in a system</a>.
        At the bottom, lowest leverage — and where we spend nearly all our energy —
        are the <em>parameters</em>: the numbers, the settings, one more knob on one
        more algorithm, one more rule about one more model. Near the very top, the
        highest leverage of all, sits the <strong>goal of the system</strong>, and
        above even that, the <strong>paradigm</strong> — the unspoken assumption the
        whole thing is built on. Her uncomfortable point: you almost never fix a
        misaligned system by tuning its parameters. You have to change its goal, or
        the mindset underneath it. Regulating one AI model is a parameter. Changing
<em>who holds your data by default</em> is a paradigm.
</p> <h2>What one honest tool can do</h2> <p>
Let’s be honest about scope, because the worst move here would be to
        wave a notes app at the biosphere and call it a plan.
</p> ${renderComponent($$result2, "HonestTiller", $$HonestTiller, {})} <p>
With that said: there’s exactly one seam a small open-source project is
        in a position to repair — <strong>technology ↔ human</strong> — and only
        one honest way to repair it. Not by promising good intentions;
        intentions get acquired. You repair a severed loop by handing the controls
        back — by giving a person, in software they can actually check, the
        instruments of course correction. <a href="/">xNet</a> is built backwards
        from that idea, and you can inspect each piece.
</p> <ul> <li> <strong>You can sense — the machine is readable.</strong> The thing that
          syncs your data is an open, signed change log, not a vendor blob you have
          to take on faith. It’s a machine you’re allowed to open, and a loop you
          can only close if you can see inside it. (We took one note all the way
          through it in <a href="/blog/the-loom-you-can-read">The Loom You Can Read</a>.)
</li> <li> <strong>You can act — undo, at the level of the whole app.</strong> A
          single press walks the last change back, because every edit is a
          reversible step in that log rather than a fact overwritten in place. The
          smallest, most human form of course correction — <em>no, not that, back
          up one</em> — is a first-class feature, not an afterthought.
</li> <li> <strong>You can act — and you can leave, losing nothing.</strong> Your
          identity is a key you generate and carry, that works on any hub and that
          nothing can revoke; your whole workspace exports, whole, in formats you
          can read without us. Exit is the feedback channel of last resort: the one
          correction that still works when every other one has been taken away. Here
          it’s a function we ship, not a value we assert.
</li> <li> <strong>You steer what leaves — consent, off by default.</strong> Nothing
          about your use is sent anywhere until you choose it, and what you can
          choose is scrubbed and blurred so a single person can’t be picked out of
          it. The default is silence. You are the one who opens the valve.
</li> <li> <strong>The goal stays honest — enforced by the build.</strong> We don’t
          optimize the engagement proxy, and that’s not a pinky-swear: a check in
          our pipeline <em>fails the build</em> if someone tries to add an infinite
          scroll, a manufactured streak, or a tracker. Feeds are chronological;
          notifications are rule-based with a hard cap. The one thing a steersman
          can’t survive — a goal quietly swapped for a proxy — is the thing the
          project guards against itself. Read the <a href="/commitments">commitments</a>
and the <a href="/why">receipts</a>.
</li> <li> <strong>You hold the master copy — the paradigm move.</strong> The real
          copy of everything you make lives on your device and works with no network
          at all. A hub is a convenience you point at, not a landlord you depend on.
          That’s not a feature; in Meadows’ terms it’s a change of goal, which is
          why it does more than any feature could.
</li> </ul> <p>
And here’s the part that surprised us as we built it. None of those are
        metaphors for feedback. They <em>are</em> feedback loops, the same ones the
        code already runs on itself. The change log is hash-chained, so the system
        can sense its own corruption and prescribe the repair. The sync engine
        watches its own error rate and, if it starts producing garbage the hub
        keeps rejecting, <em>halts itself</em> before it can flood anything — a
        governor in the oldest sense, the spinning weights on Maxwell’s steam engine
        that Wiener named the field after. The build watches the builders. It turns
        out that a tool honest enough to let <em>you</em> steer has to be built out
        of small loops that keep <em>it</em> from drifting, too. Same trick, all the
        way down.
</p> <h2>Keep your hand on it</h2> <p>
The brief that started this essay had a worry inside it: that things are
        moving very fast, and mostly out of sight. That’s not a side note — it’s
        the exact danger Wiener named in 1960. His whole warning was about agency
        “so fast and irrevocable that we have not the data to intervene before the
        action is complete.” Fast and out of sight is precisely how the tiller gets
        taken. Not seized in a coup — just eased out of your hand while you’re
        looking at the feed, one default at a time, until steering feels like
        something other people do.
</p> <p>
So what could everybody do, if we were a little more awake to it? Not
        much, heroically — and quite a lot, in aggregate. Alignment at the scale of
        a civilization was never going to be one grand fix bolted on at the top. It
        was always going to be the sum of a very large number of very small course
        corrections, made by people who kept a hand on the wheel: who noticed when a
        tool had started steering <em>them</em> instead of the other way around, and
        who, given the choice, reached for the tools they could see into, leave,
        undo, and switch off. That’s not a mass movement. It’s a habit. It’s the
        helmsman’s nudge, multiplied by millions of hands.
</p> <p>
We can’t hand you back the planet, or the decade, or a guarantee about the
        machines. What one honest tool can do is refuse to be one more hand prying
        yours off the tiller — and instead put the tiller back where it belongs.
        Calm instead of frantic. Owned instead of rented. A loop you can close
        instead of a slide you can’t stop. Sea, soil, sky, and now the steering
        underneath all three: the systems worth living in are the ones you’re free
        to correct. Keep what’s yours. And keep your hand on the tiller.
</p> <p>
If you want to feel the difference: <a href="/app">use the app</a> — it’s
        free, offline, and private. Read <a href="/commitments">the commitments
        we’re built on</a>. Or, if you make things,
<a href="/build-with">build something of your own</a> on the open protocol,
        and own the steering.
</p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li>
The steersman and the science of steering:
<a href="https://en.wikipedia.org/wiki/Cybernetics" rel="noopener noreferrer">
Norbert Wiener, <em>Cybernetics, or Control and Communication in the
            Animal and the Machine</em> (1948)</a> — where the field, and its name (Greek <em>kybernḗtēs</em>, “steersman”),
          come from.
</li> <li>
The alignment problem, stated in 1960:
<a href="https://www.science.org/doi/10.1126/science.131.3410.1355" rel="noopener noreferrer">
Norbert Wiener, “Some Moral and Technical Consequences of Automation,”
<em>Science</em> 131 (1960)</a> — “…the purpose put into the machine is the purpose which we really
          desire.”
</li> <li>
The King Midas problem and corrigible machines:
<a href="https://en.wikipedia.org/wiki/Human_Compatible" rel="noopener noreferrer">
Stuart Russell, <em>Human Compatible</em> (2019)</a>.
</li> <li>
When a measure becomes a target:
<a href="https://en.wikipedia.org/wiki/Goodhart%27s_law" rel="noopener noreferrer">
Goodhart’s Law</a> (Charles Goodhart, 1975; Marilyn Strathern’s phrasing) — its AI form is
          reward hacking.
</li> <li>
Where to push on a system, and where not to:
<a href="https://donellameadows.org/archives/leverage-points-places-to-intervene-in-a-system/" rel="noopener noreferrer">
Donella Meadows, <em>Leverage Points: Places to Intervene in a
            System</em> (1999)</a>.
</li> <li>
The planet’s setpoints:
<a href="https://www.stockholmresilience.org/research/planetary-boundaries.html" rel="noopener noreferrer">
Planetary Boundaries</a> (Rockström, Steffen et al., 2009; 2023 update — six of nine
          transgressed).
</li> <li>
Why leaving is what makes complaining matter:
<a href="https://en.wikipedia.org/wiki/Exit,_Voice,_and_Loyalty" rel="noopener noreferrer">
Albert O. Hirschman, <em>Exit, Voice, and Loyalty</em> (1970)</a>; and the law that a controller must match what it steers,
<a href="https://en.wikipedia.org/wiki/Variety_(cybernetics)" rel="noopener noreferrer">
Ashby’s Law of Requisite Variety</a> (1956).
</li> <li>
The architecture and the receipts: <a href="/why">xNet — Why</a> and
<a href="/commitments">the Humane Charter</a>. The companion essays:
<a href="/blog/the-loom-you-can-read">The Loom You Can Read</a>,
<a href="/blog/the-right-to-say-no">The Right to Say No</a>, and
<a href="/blog/the-forest-and-the-field">The Forest and the Field</a>.
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>This is an independent essay. The thinkers cited are summarized as
          commentary; xNet is not affiliated with or endorsed by them. The history
          is compressed and some framings are the author’s — follow the citations.
          All artwork here is original, and this page loads nothing third-party.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "hand-on-the-tiller" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/hand-on-the-tiller.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/hand-on-the-tiller.astro";
const $$url = "/blog/hand-on-the-tiller";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$HandOnTheTiller,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
