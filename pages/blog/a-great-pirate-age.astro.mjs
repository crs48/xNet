import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$PirateArt } from '../../chunks/PirateArt_65Lw5iEc.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$PirateHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$PirateHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#080810]"> ${renderComponent($$result, "PirateArt", $$PirateArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-indigo-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 font-mono lowercase text-indigo-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/PirateHero.astro", void 0);

const $$ArticlesMap = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      article: "Every member signs the articles.",
      name: "Own",
      promise: "You hold the master copy. Your data lives on your device first; there is no behavioral surplus to sell."
    },
    {
      article: "A vote, and an equal share of the plunder.",
      name: "Commons",
      promise: "You own your audience and your graph \u2014 not a platform that rents them back to you."
    },
    {
      article: "An elected captain, checked by an elected quartermaster.",
      name: "Consent",
      promise: "Nothing leaves without permission. Telemetry is off by default and scrubbed when you opt in."
    },
    {
      article: "You can leave the crew and keep your share.",
      name: "Exit",
      promise: "Leaving loses nothing. A portable did:key works on any hub; the client runs fully offline."
    },
    {
      article: "No flogging. No compulsion.",
      name: "Calm",
      promise: "No infinite scroll, no engagement ranking, no streaks engineered around loss aversion."
    },
    {
      article: "Skill makes the crew \u2014 not the captain\u2019s whim.",
      name: "Agency",
      promise: "AI scaffolds and cites; you write and own. It makes you more capable, not less."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
A pirate ship ran on written articles. So does xNet.
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
The crew agreed to a short list of binding rules, and everyone signed. xNet’s
<a href="/commitments" class="text-emerald-600 underline decoration-dotted underline-offset-2 hover:text-emerald-500 dark:text-emerald-400">Humane Charter</a>
is the same idea — six commitments, each with a receipt in the source code.
</p> <ul class="mt-6 space-y-4"> ${rows.map((row) => renderTemplate`<li class="grid gap-2 sm:grid-cols-[1fr_1.4fr] sm:gap-6 sm:items-baseline"> <p class="text-sm italic leading-relaxed text-gray-500 dark:text-gray-400">
“${row.article}”
</p> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200"> <span class="font-mono font-semibold text-emerald-600 dark:text-emerald-400"> ${row.name} </span> <span class="mx-1.5 text-gray-300 dark:text-gray-600" aria-hidden="true">—</span> ${row.promise} </p> </li>`)} </ul> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/ArticlesMap.astro", void 0);

const $$HonestPirate = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      isnt: "We won\u2019t pretend pirates were heroes.",
      is: "Many crews still trafficked and sold enslaved people. The black flag was not innocence \u2014 it was defiance, and the two are not the same."
    },
    {
      isnt: "We won\u2019t romanticize the plunder.",
      is: "What\u2019s worth honoring is the self-governance: elected captains, written articles, near-equal shares \u2014 built by sailors fleeing a deadlier order."
    },
    {
      isnt: "We won\u2019t claim leaving the system makes you good.",
      is: "Decentralization frees dissidents and bad actors alike. So xNet hands you the tools to choose your own waters \u2014 labelers, provenance, your own moderation \u2014 not a new authority to decide for you."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
What we take from the pirate story — and what we leave
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
A metaphor that flatters itself is just more marketing. Here’s the honest version.
</p> <ul class="mt-6 space-y-5"> ${rows.map((row) => renderTemplate`<li class="grid gap-3 sm:grid-cols-[1fr_1.3fr] sm:gap-5"> <div class="flex gap-2.5"> <span class="select-none text-gray-400 dark:text-gray-600">✕</span> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${row.isnt}</p> </div> <div class="flex gap-2.5"> <span class="select-none text-emerald-500">✓</span> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.is}</p> </div> </li>`)} </ul> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HonestPirate.astro", void 0);

const $$AGreatPirateAge = createComponent(($$result, $$props, $$slots) => {
  const post = postBySlug("a-great-pirate-age");
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "PirateHero", $$PirateHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-indigo-600 dark:prose-a:text-indigo-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
The most famous age of pirates began, in the story, with an execution. The
        World Government put the Pirate King to death in the public square to make
        an example of him — to end piracy by showing where it led. Instead, his last
        words let slip that his treasure was real, out there for anyone bold
        enough to go and take it. The scaffold meant to close the sea threw it wide
        open. They called what followed the <em>Great Pirate Age</em>.
</p> <p>
That is <em>One Piece</em>, Eiichiro Oda’s thirty-year manga about a boy in a
        straw hat. But strip the rubber arms and sea monsters and the shape of it is
        old and real: a power that tried to control information lost control of it
        the moment the information got out. We are living through a smaller version
        of that right now, and it’s worth taking seriously — because the internet is
        having its own Great Pirate Age, and most people don’t realise they get to
        pick a side.
</p> <h2>Two seas</h2> <p>
Picture the world of the story. Scattered islands, most of them never in
        contact with each other. Treacherous water in between, so ordinary people
        spend their whole lives on the island they were born on. They never sail.
        They never meet anyone who isn’t already like them. Overhead sits a World
        Government that owns the maps, the currency, the news, and the official
        version of history — including the parts it has deleted. There was a whole
        century it scrubbed from the record, and a library of scholars who got too
        close to reading it back. The deepest villainy in the story isn’t the sword
        fights. It’s the <em>erasure</em>: a central power deciding what everyone is
        allowed to know.
</p> <p>
Now look at the internet you actually use. A handful of platforms own the
        maps. Most people never leave the few islands the algorithm sails them to,
        and never meet anyone the feed didn’t already sort them toward. The water
        between platforms — moving your data, your friends, your history from one to
        another — is deliberately treacherous, because every island profits from you
        not being able to leave. It is a controlled sea. It works exactly as
        designed.
</p> <p>
There is another sea. On it, every island is its own — it holds its own
        data, keeps its own log, flies its own flag — and any two islands can choose
        to sail to each other when they want to, because they all speak the same
        language of the sea. No central harbor everyone is forced to dock at. That
        sea is not a fantasy. It’s an architecture, and most of it is already
        written.
</p> <h2>Who the pirates actually were</h2> <p>
Before the metaphor runs away with us, it’s worth asking the honest
        question: who <em>were</em> the real pirates? Because the popular picture —
        bloodthirsty villains, peg-legs and buried gold — is mostly a story the
        people they robbed told afterward.
</p> <p>
The real ones, in the Golden Age of roughly 1650 to 1730, were mostly
        ordinary sailors. Merchant and navy crews of the time lived under conditions
        brutal enough to kill — wages stolen, food rotten, discipline enforced with
        the lash; on the era’s slave ships, crews died at rates that rivaled the
        captives below deck. When pirates captured a merchant
        vessel, part of its crew would often <em>volunteer</em> to join. Navy sailors
        deserted to serve under the black flag. And a large share of pirates — by
        some estimates up to a third of the ten thousand who sailed in that era —
        were formerly enslaved people who had escaped, and who on some ships could
        vote, carry a weapon, and take an equal share of the haul.
</p> <p>
That last part is the surprising one. Aboard, many crews governed themselves
        as something close to a working democracy — more than a century before that
        word was respectable. They <em>elected</em> their captain, and elected a
        quartermaster whose whole job was to check him. They wrote down their rules —
        the ship’s “articles” — and every member signed. They split the plunder
        nearly evenly and even ran a rough insurance scheme for the wounded. The
        historian Marcus Rediker calls it “one of the most egalitarian plans for the
        disposition of resources to be found anywhere in the early eighteenth
        century.” People didn’t flee to piracy only out of greed. A lot of them fled
        a brutal, extractive order toward one where they had a vote and a fair share.
</p> ${renderComponent($$result2, "HonestPirate", $$HonestPirate, {})} <h2>You are the cargo</h2> <p>
Here’s the turn. We think of pirates as people who took what wasn’t theirs.
        But on today’s internet, the respectable, lawful, merchant order is the one
        built on plunder — and the cargo in the hold is <em>you</em>.
</p> <p>
We laid out the receipts on a <a href="/why">separate page</a>, every claim
        cited: over a three-year window, an average person’s data was reported to a
        single platform by roughly <strong>2,230 different companies</strong>. About
<strong>99%</strong> of people can be uniquely identified from their browser
        and device alone, no cookie required. The business of buying and selling
        attention at the checkout counter is worth around <strong>$140 billion</strong>
a year. You are not the customer of that economy. You are the freight it
        moves. So choosing to leave it isn’t theft. It is the opposite: a refusal to
        keep being stolen from. In this sea, raising your own flag is how
        you stop being someone else’s treasure.
</p> <h2>Sign your own log</h2> <p>
A pirate captain kept a log, and signed it. That sounds quaint until you
        notice it’s a precise description of how xNet actually works under the hood.
        It isn’t a metaphor we reached for; it’s the literal architecture.
</p> <ul> <li> <strong>Your own flag.</strong> Your identity is a <code>did:key</code> —
          a cryptographic key pair you generate on your own device. No registry
          issues it. No authority can revoke it. It’s your Jolly Roger, and it works
          on any harbor in the sea.
</li> <li> <strong>Your own log.</strong> Every change you make is signed by you and
          chained to the one before it, so the record can’t be quietly rewritten
          later — not even by us. It’s an append-only ship’s log, and your signature
          is on every line. Old entries stay verifiable even after you’ve sailed on.
</li> <li> <strong>Your choice of port.</strong> Your data lives on your device
          first; the app works at sea with no harbor at all. A sync hub — one you
          host, or our managed one, or none — is a port you choose to dock at, not a
          home you’re bound to.
</li> <li> <strong>A shared language of the sea.</strong> The thing that lets
          independent islands actually sail to one another is an open protocol —
          written down, versioned, and pinned to a corpus of shared test vectors
          that any implementation in any language has to pass. That’s what keeps two
          flags speaking the same tongue. It’s why <a href="/build-with">you can
          build on xNet</a> in Swift, Rust, or Python and still interoperate.
</li> </ul> <p>
And when one island does want to share with another, it does so on purpose —
        a signed grant that says “you may read this cargo,” handed directly from one
        captain to another. No central authority approves the voyage. Two flags, one
        sea.
</p> ${renderComponent($$result2, "ArticlesMap", $$ArticlesMap, {})} <h2>Which pirate to be</h2> <p>
Here’s the trouble with an open sea: it carries everyone. The same freedom
        that lets a dissident publish past a censor lets a genuine villain operate
        too. An honest pitch has to admit that. xNet’s answer is not to crown a new
        World Government to decide what everyone may see — that’s the thing we’re
        sailing away from. It’s to hand you the instruments to choose your own
        waters: labels you opt into, sources you can check, moderation you can run or
        delegate. Freedom <em>and</em> the means to navigate it.
</p> <p>
Which is really a question about what kind of pirate you want to be. The hero
        of <em>One Piece</em> is instructive precisely because he’s not a conqueror.
        Asked what being Pirate King means, Luffy says: “I don’t wanna conquer
        anything. I just think the guy with the most freedom in this whole ocean is
        the Pirate King!” He doesn’t want to rule the sea. He wants to be the freest
        thing on it — and, almost more than that, he wants every one of his friends
        to reach their own dream, and to throw a good party along the way.
</p> <p>
That’s the ethos worth borrowing. Not domination — <em>autonomy</em>, plus
        the wish to see everyone else get theirs too. It’s the difference between
        wanting to own the network and wanting the network to be ownable by anyone.
        xNet is built for the second kind: your audience and your graph belong to
<a href="/commitments">you, not to a platform that rents them back</a>; the
        feed is yours to arrange; the door out is always unlocked, and walking
        through it costs you nothing. We’d rather be the ship people are glad to sail
        on than the empire they can’t leave.
</p> <h2>Raise your own flag</h2> <p>
The Great Pirate Age didn’t start because pirates were powerful. It started
        because a secret got out: the treasure is real, and it’s yours to go and
        take. The same secret is loose about your data now. You don’t have to live on
        the island you were born on. You can hold your own keys, keep your own log,
        and choose who you sail to.
</p> <p>
So: raise your own flag. <a href="/app">Use the app</a> — it’s free, offline,
        and private. Read <a href="/commitments">the articles we sail by</a>. Or, if
        you build things, <a href="/build-with">build on the open sea</a> yourself.
        The water’s open. Set out.
</p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li> <a href="https://onepiece.fandom.com/wiki/Gol_D._Roger" rel="noopener noreferrer">
One Piece Wiki — Gol D. Roger</a> and
<a href="https://gamerant.com/one-piece-the-great-pirate-era-explained/" rel="noopener noreferrer">
Game Rant — The Great Pirate Era, Explained</a> (the in-story premise and the Will of “D.”).
</li> <li> <a href="https://screenrant.com/one-piece-1060-luffy-dream-not-pirate-king/" rel="noopener noreferrer">
Screen Rant — Luffy’s real dream</a> (the Chapter 507 quote and its meaning).
</li> <li> <a href="https://www.rmg.co.uk/stories/maritime-history/pirates-history-golden-age-piracy" rel="noopener noreferrer">
Royal Museums Greenwich — History of the Golden Age of Piracy</a> (who became pirates, and why).
</li> <li> <a href="https://www.historynewsnetwork.org/article/5-ways-pirate-ships-functioned-as-a-true-democracy" rel="noopener noreferrer">
History News Network — 5 Ways Pirate Ships Functioned as a True Democracy</a> and Marcus Rediker, <em>Villains of All Nations: Atlantic Pirates in the
          Golden Age</em> (elected officers, written articles, equal shares).
</li> <li> <a href="https://goldenageofpiracy.org/culture/pirates-and-slavery" rel="noopener noreferrer">
Golden Age of Piracy — Pirates and Slavery</a> (the honest counterweight: emancipation was the exception, not the rule).
</li> <li>
The surveillance figures and their citations: <a href="/why">xNet — Why</a>.
          The architecture and commitments: <a href="/commitments">the Humane Charter</a>.
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>One Piece is created by Eiichiro Oda and published by Shueisha. This is an
          independent essay that references the work as cultural criticism; xNet is
          not affiliated with, authorized by, or endorsed by its creators or rights
          holders. All artwork here is original.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "a-great-pirate-age" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/a-great-pirate-age.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/a-great-pirate-age.astro";
const $$url = "/blog/a-great-pirate-age";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$AGreatPirateAge,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
