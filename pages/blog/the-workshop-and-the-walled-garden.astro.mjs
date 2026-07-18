import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$WorkshopArt } from '../../chunks/WorkshopArt_CYvETef9.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { $ as $$Mermaid } from '../../chunks/Mermaid_D1Kl_hLV.mjs';
import { $ as $$CodeFigure } from '../../chunks/CodeFigure_F2M_f7y-.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$WorkshopHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$WorkshopHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#080d1a]"> ${renderComponent($$result, "WorkshopArt", $$WorkshopArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sky-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 font-mono lowercase text-sky-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/WorkshopHero.astro", void 0);

const $$HonestWorkshop = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      isnt: "We won\u2019t pretend mod ecosystems are safe by default.",
      is: "In 2023 the fractureiser malware rode compromised accounts into popular Minecraft mods \u2014 packs with millions of downloads \u2014 and stole credentials from the people who trusted them. Distribution trust alone is not enough. That\u2019s exactly why the answer here is capability scoping at runtime, not \u201Cit\u2019s open, so it\u2019s fine.\u201D"
    },
    {
      isnt: "We won\u2019t pretend the platforms locked down out of malice.",
      is: "A reviewed app store and a narrow extension API genuinely shrink the attack surface; that\u2019s a real engineering argument, not a smokescreen. Our claim is narrower: it\u2019s a false trade. You can bound what code can touch instead of banning what code can exist."
    },
    {
      isnt: "We won\u2019t pretend bespoke software is free.",
      is: "A view you build is a view you keep. AI collapses the cost of writing and much of the cost of maintaining it, but not to zero \u2014 \u201Cas bespoke as possible\u201D comes with \u201Cwithin reason\u201D attached. The substrate\u2019s job is to make the reasonable region as large as it can honestly be."
    },
    {
      isnt: "We won\u2019t pretend our workshop is crowded yet.",
      is: "What exists today is the architecture \u2014 the manifest, the guards, the trust ladder, the licence layer \u2014 and the first-party views built on it. The bustling mod scene this essay wants is an invitation, not an inventory. We\u2019re describing the door, and it is genuinely open."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
An honest workshop
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
An argument for opening things up has to be straight about why they were
      closed. Here’s where the romance stops.
</p> <ul class="mt-6 space-y-5"> ${rows.map((row) => renderTemplate`<li class="grid gap-3 sm:grid-cols-[1fr_1.3fr] sm:gap-5"> <div class="flex gap-2.5"> <span class="select-none text-gray-400 dark:text-gray-600">✕</span> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${row.isnt}</p> </div> <div class="flex gap-2.5"> <span class="select-none text-sky-500">✓</span> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.is}</p> </div> </li>`)} </ul> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HonestWorkshop.astro", void 0);

const $$TheWorkshopAndTheWalledGarden = createComponent(($$result, $$props, $$slots) => {
  const post = postBySlug("the-workshop-and-the-walled-garden");
  const kw = (s) => `<span class="tok-keyword">${s}</span>`;
  const fn = (s) => `<span class="tok-function">${s}</span>`;
  const st = (s) => `<span class="tok-string">${s}</span>`;
  const cm = (s) => `<span class="tok-comment">${s}</span>`;
  const manifestCode = [
    `${cm("// A mod, in xNet, is a view plus a consent form.")}`,
    `${kw("export")} ${kw("default")} ${fn("defineFeatureModule")}({`,
    `  id: ${st("'com.you.focus-board'")},`,
    `  name: ${st("'Focus Board'")},`,
    `  version: ${st("'1.0.0'")},`,
    `  capabilities: {`,
    `    schemaRead:  [${st("'task'")}, ${st("'note'")}],  ${cm("// sees your tasks and notes\u2026")}`,
    `    schemaWrite: [${st("'task'")}],          ${cm("// \u2026may tick tasks off\u2026")}`,
    `    network:     [],                ${cm("// \u2026and never phones home.")}`,
    `    secrets:     []                 ${cm("// no tokens \u2014 nothing to leak")}`,
    `  }`,
    `})`
  ].join("\n");
  const modLineage = `flowchart TD
  AOS["Aeon of Strife<br/>a StarCraft custom map"] --> DOTA["Defense of the Ancients (2003)<br/>a Warcraft III custom map"]
  DOTA --> LOL["League of Legends (2009)<br/>its co-author, hired by Riot"]
  DOTA --> D2["Dota 2 (2013)<br/>its maintainer, hired by Valve"]
  QK["Quake (1996)"] --> TF["Team Fortress<br/>a mod"] --> TF2["Team Fortress Classic \u2192 TF2<br/>the modders, hired by Valve"]
  HL["Half-Life (1998)"] --> CS["Counter-Strike (1999)<br/>a mod"] --> CS2["CS \u2192 CS:GO \u2192 CS2<br/>the mod, acquired by Valve"]
  A2["ARMA 2: DayZ<br/>itself a mod"] --> BRM["PlayerUnknown's<br/>battle-royale mods"] --> PUBG["PUBG (2017)<br/>the modder, hired by Krafton"]`;
  const viewsOverData = `flowchart LR
  subgraph yours["Your substrate \u2014 on your device, in the open"]
    LOG["Signed, hash-chained<br/>change log"] --> STORE[("One store of nodes:<br/>tasks, notes, contacts,<br/>accounts, messages")]
  end
  subgraph views["Views \u2014 interchangeable, each scoped to a slice"]
    T["Tasks view"]
    C["CRM view"]
    F["Finance view"]
    P["Your mod:<br/>'Focus Board'"]
  end
  STORE -->|"tasks + projects"| T
  STORE -->|"contacts + deals"| C
  STORE -->|"accounts + entries"| F
  STORE -->|"tasks + notes,<br/>nothing else"| P`;
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "WorkshopHero", $$WorkshopHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-sky-600 dark:prose-a:text-sky-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
In 2003, somewhere on the internet, a modder known only as
<strong>Eul</strong> sat down with the map editor that shipped in the box
        with <em>Warcraft III</em> and made a custom map. It wasn’t even an
        original idea — he was reworking a concept from <em>Aeon of Strife</em>,
        a fan-made StarCraft map from a few years earlier. Two teams, three
        lanes, one hero per player. He called it
<strong>Defense of the Ancients</strong>.
</p> <p>
Eul eventually drifted away, the way hobbyists do. Other pseudonymous
        hands picked the map up — first a modder called <strong>Guinsoo</strong>,
        then one called <strong>IceFrog</strong> — each rebalancing and extending
        it, shipping new versions to a community that play-tested every change by
        the hundred thousand. No studio green-lit any of this. No product manager
        wrote a roadmap. It was a mod, passed from hand to hand like a group
        project with no teacher.
</p> <p>
You may know how it ends. Guinsoo was hired by a startup called Riot
        Games, where the thing he built next was <em>League of Legends</em> —
        for years the most-played PC game on Earth. Valve hired IceFrog and
        built <em>Dota 2</em> around him. The custom map became a genre — the
        MOBA — an e-sports economy measured in billions, and the direct
        employer of thousands of people. One of the largest categories of
        entertainment on the planet started life as <strong>a file someone made
        with the editor that came in the box</strong>.
</p> <p>
Here is the question this essay is actually about: <em>when was the last
        time anything like that could have happened to the software you use for
        work?</em> </p> <h2>The pattern, and where it went</h2> <p>
DotA isn’t a fluke; it’s the most famous example of a pattern that built
        half of modern gaming. <em>Doom</em> shipped in 1993 with its levels and
        art in separate <code>WAD</code> files — id Software deliberately made
        the data moddable without touching the engine, and then released the
        engine’s source code outright in 1997. <em>Team Fortress</em> began in
        1996 as a Quake mod; Valve hired its makers. <em>Counter-Strike</em>
began in 1999 as a Half-Life mod by two hobbyists, Minh Le and Jess
        Cliffe; Valve bought it, hired them, and it remains one of the
        most-played games in the world a quarter-century later. The battle
        royale — the defining genre of the last decade — came from Brendan
        Greene, a photographer modding a military simulator’s zombie mod. And
        Minecraft’s mod ecosystem recently passed <strong>one hundred billion
        downloads</strong> on a single hosting site.
</p> ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": modLineage, "caption": "The genealogy of genres: every box on the right is an industry; every box on the left is a hobbyist modifying software they were allowed to open." })} <p>
Notice what the pattern requires. Not open source, in most cases — Doom
        was the exception, not the rule. What it requires is humbler:
<strong>the data separable from the engine, and permission to put your
        own thing where the old thing was.</strong> A WAD file. A custom map. A
        model folder the game loads at startup. The vendor kept the engine;
        the players owned the worlds; and the seam between them was documented
        and load-bearing.
</p> <p>
Old desktop software had the same seam in a dozen humble forms —
        plugins, macros, extensions, a <code>Scripts</code> folder the app would
        slurp at launch. Then software moved into the browser tab and the app
        store, and the seam was welded shut. Apple’s App Review Guidelines say
        it in one clause — an app <em>“may not download, install, or execute
        code which introduces or changes features or functionality of the
        app”</em> — which is a precise legal description of what a mod
<em>is</em>. On the web, Chrome’s Manifest V3 removed the blocking
        network API that content blockers are built on; uBlock Origin, with
        tens of millions of users, could only ship a reduced “Lite” version,
        and the full one was switched off with the rest of the old extension
        platform. The SaaS app is the purest case: the program runs on someone
        else’s computer entirely, and the moddable surface is whatever the
        vendor’s API team got around to.
</p> <p>
We didn’t stop wanting to mod our tools. The DotA community didn’t run
        out of Euls. The doors got locked — politely, gradually, and with
        reasons that sound perfectly sensible read one at a time.
</p> <h2>In fairness to the wall</h2> <p>
And some of those reasons <em>are</em> sensible, so let’s make the
        strongest version of the other side’s case before arguing with it.
</p> <p>
In June 2023, malware researchers untangled <strong>fractureiser</strong>:
        attackers had compromised accounts on the biggest Minecraft mod-hosting
        sites and injected a credential-stealing payload into popular mods and
        modpacks — including packs with millions of downloads — where it
        self-propagated into other mod files and stole browser logins, Discord
        tokens, and Microsoft credentials from players. Some of the compromised
        accounts had two-factor authentication turned on. The oldest, freest
        modding culture on the internet shipped professional malware to its
        most enthusiastic members through its most trusted channel.
</p> <p>
That is the real argument behind Apple’s clause 2.5.2 and Chrome’s
        narrowed APIs, and it deserves to be stated without a sneer:
<strong>once code is running with your authority, it can do anything
        you can do.</strong> If installing a mod means handing it your file
        system, your cookies, your saved passwords, and your network — then
        yes, a review board and a welded seam genuinely protect people. The
        walled garden is not a conspiracy. It is a reasonable response to a
        catastrophic default.
</p> <p>
But look at the shape of the response. The catastrophic default —
<em>all code gets all authority</em> — was treated as a law of nature,
        and the fix was to ban the code. Nobody banned the default. There was
        always a second door out of the problem: <strong>scope the authority
        instead of the code.</strong> Let the mod exist, and bound what it can
        touch. This isn’t hypothetical — it’s how every system that still dares
        to run other people’s code does it. Figma runs plugins inside a
        JavaScript interpreter compiled to WebAssembly, with a hand-picked list
        of APIs. Deno makes a program declare, on the command line, which
        directories and hosts it may touch, and denies everything else. VS
        Code — host to tens of thousands of extensions, the liveliest modding
        scene in software today — runs them in a separate, killable process.
        Security researchers have a name for the underlying principle,
<em>object capabilities</em>: code should hold authority the way your
        hand holds keys — only the ones you were given, and it can’t forge the
        rest.
</p> <p>
The platforms chose the ban because, for them, the ban was cheaper —
        and, not incidentally, because a welded seam has commercial upside:
        nobody mods the feed you monetize. But for <em>you</em>, the ban has a
        cost that compounds. It’s every workflow that stays broken because the
        vendor’s backlog doesn’t know you exist. It’s every genre of tool that
        never gets its DotA, because the map editor never shipped.
</p> <h2>You can’t mod what you can’t read</h2> <p>
There’s a precondition hiding under all the modding stories, so obvious
        it’s easy to miss. Doom mods were possible because the levels lived in
        a <em>file</em>, in a documented format, separable from the engine.
        DotA was possible because the map was <em>data</em> the game would load
        from anyone, not just from Blizzard. The moddable era’s real invariant
        was never a licence — it was that <strong>the thing you wanted to
        change was legible and yours to swap.</strong> </p> <p>
Flip that around and you have a diagnosis of the present. The modern
        app is unmoddable, at root, because your data is trapped inside it —
        on the vendor’s servers, in the vendor’s schema, reachable only through
        the vendor’s screens. You can’t mod what you can’t read. The app and
        the data are fused, so wanting a different app means begging the vendor
        or leaving your life behind.
</p> <p>
A quiet lineage of thinkers has been circling the way out for twenty
        years. In 2004, Clay Shirky described <em>situated software</em> —
        software “designed in and for a particular social situation,” built by
        and for a group of dozens, thriving precisely because it ignored every
        rule about scale. In 2020, Robin Sloan built a messaging app just for his
        family and called it
<em>a home-cooked meal</em> — “I am the programming equivalent of a
        home cook,” he wrote, and the app never needed to be a restaurant. The
        Obsidian community distilled the durability half of the idea into three
        words — <em>file over app</em>: your notes should be files you own, in
        a format anything can read, so the app is replaceable and your writing
        outlives it. And in 2025, researchers at Ink &amp; Switch published the
        fullest statement of the vision, <em>malleable software</em>: computing
        as a dynamic medium people can reshape to their own needs, rather than
        a collection of rigid, locked-down applications — with a gentle slope
        from using a tool to remaking it.
</p> <p>
Different decades, one inversion: <strong>stop treating the app as the
        home of your data, and start treating your data as the ground the apps
        stand on.</strong> Own the substrate. Swap the views. That single move
        is what turns “moddable” from a nostalgic adjective back into an
        architecture.
</p> <h2>The application is a view over your data</h2> <p>
This is the bet <a href="/">xNet</a> is built on, so let us show you the
        machinery — honestly, including the parts that exist as architecture
        rather than as a crowded bazaar.
</p> ${renderComponent($$result2, "HonestWorkshop", $$HonestWorkshop, {})} <p>
In xNet, everything you make — tasks, notes, contacts, messages,
        ledgers — lives in one store of nodes on your own device, written as a
        signed, hash-chained change log in an open format. (We walked one note
        all the way through that machine in
<a href="/blog/the-loom-you-can-read">The Loom You Can Read</a>.) No
        app owns the store. Apps <em>subscribe</em> to it. The tasks app is a
        query over task nodes; the CRM is a query over contact and deal nodes;
        the finance view is a query over accounts and entries. Three
        “applications,” one substrate — and each is, in the game modder’s
        exact sense, a <em>skin over the save file</em>. Replace any of them
        and your data doesn’t move an inch.
</p> ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": viewsOverData, "caption": "One substrate, many views. Each view \u2014 including yours \u2014 receives only the slice it declared, enforced at the query layer, not by politeness." })} <p>
That last clause is where safety comes back into the story, because
        “your mod” in that diagram is doing something the walled garden says
        must never happen: running code the vendor never reviewed, against your
        real data. Here is the entire trick that makes it tolerable — the mod
        arrives with a manifest, and the manifest is a consent form:
</p> ${renderComponent($$result2, "CodeFigure", $$CodeFigure, { "code": manifestCode, "filename": "focus-board/module.ts", "caption": "The whole security model in a dozen legible lines. What it doesn't declare, it doesn't get \u2014 reads and writes are gated per schema, network calls are gated per domain, and API tokens are brokered by the hub so they never enter plugin code at all." })} <p>
Those declarations aren’t documentation; they’re walls — just walls in
        the right place. A guarded store hands the plugin only the schemas it
        declared, and the authorisation layer scopes reads further to the
        spaces you’ve shared with it — the mod sees the project you pointed it
        at, not your whole life. A guarded fetch refuses any network call to a
        domain outside the manifest — and an empty list means <em>offline,
        provably</em>. Secrets are brokered: a connector that syncs your RSS
        feeds or your Slack history gets the rows it produced, never the token
        that produced them. And every plugin carries its provenance — built-in,
        written by you, generated by an AI, installed from the marketplace,
        or synced from a friend — and a trust ladder maps that provenance to a
        sandbox tier and decides when you must be re-asked for consent. A mod
        your friend shares with you doesn’t inherit your friend’s permissions;
        it arrives quarantined and asks <em>you</em>.
</p> <p>
This is the Figma/Deno lesson, applied to the software you live in
        rather than the software you design in: <strong>don’t review the code —
        scope the authority.</strong> The fractureiser payload was
        catastrophic because a Minecraft mod runs with all the authority of the
        player’s whole machine. The identical attack against a capability-scoped
        view is a mod that can tick tasks in one shared project and cannot open
        a socket. Malicious, still — bounded, by construction.
</p> <p>
And because a workshop where nobody can make a living stays a hobby
        shop, the last piece is economic: plugins can carry licences —
        cryptographically bound to your identity key, verifiable offline, so a
        mod-maker can charge for their work without a platform sitting in the
        middle setting the terms and taking the toll. The marketplace
        distributes and stamps provenance; it doesn’t own the door.
</p> <h2>The home-cooked age</h2> <p>
Everything so far would have been true five years ago. What’s new is
        who can cook.
</p> <p>
The researcher Geoffrey Litt — one of the authors of that malleable
        software essay — called large language models “a step change in tool
        support for end-user programming”: the barrier between a fuzzy personal
        need and working code is collapsing, for everyone, all at once. You’ve
        felt this if you’ve asked an AI for a script and gotten one. Sloan’s
        home-cooked meal stops being a metaphor for the few people who happen
        to be home cooks and becomes a plain description of anyone with an
        appetite and an evening.
</p> <p>
But notice what the AI does <em>not</em> change. A vibe-coded view is
        still code you didn’t review, running against your real life —
        generated by a model that can be confused, prompted maliciously, or
        just wrong. Handing it the catastrophic default — all your data, all
        your authority — is fractureiser with extra steps. The age of
        home-cooked software doesn’t lower the value of a safe kitchen; it
        raises it to the whole game. The scarce thing is no longer the ability
        to write your bespoke view. It’s a place where a bespoke view can
<em>run</em> — against your real data, with a bounded blast radius,
        where “what can this thing touch?” has a checkable answer in twelve
        lines.
</p> <p>
That’s the kitchen we’re building. Your data already on your device, in
        one legible store. A manifest that turns “trust me” into a consent
        form. A trust ladder that treats AI-generated code as exactly what it
        is — a provenance, with its own sandbox tier. There’s even a
        development bridge so your own coding agent can build against your
        workspace in a scratch copy, behind validation gates, instead of
        pasting your life into a chat window. Why wouldn’t your software be as
        bespoke as your notebook? Within reason — and the whole job of the
        substrate is to make “within reason” a wide, well-lit room.
</p> <h2>Leave the door open</h2> <p>
This blog has walked through pirate seas, forest soil, a gentle star, a
        loom you’re allowed to open, a hand on the tiller. The workshop is the
        same argument wearing overalls: systems worth living in are the ones
        their inhabitants are free to reshape.
</p> <p>
The DotA story is usually told as a business parable — genius found in
        the wild, hired by the smart companies. Told that way, it flatters the
        walls. The truer telling is about the door: a big studio shipped a
        world editor in the box, defaulting to <em>yes</em>, and a
        photographer, a student, and a string of pseudonyms built genres in
        the space it left open. The talent was always there. The talent is
<em>still</em> there — in your company, in your group chat, in you —
        and it now has a compiler that speaks English. What it mostly doesn’t
        have is a single piece of load-bearing software that defaults to yes.
</p> <p>
So the question we’d leave you with is the one the walled garden is
        designed to keep you from asking: <strong>what’s <em>your</em> DotA?</strong>
What’s the view — the tiny, situated, home-cooked, one-team-shaped
        tool — that doesn’t exist because the app that holds your data won’t
        let you build it? The genre that never happened because the editor
        never shipped?
</p> <p>
If you want to stand in the workshop: <a href="/app">use the app</a> —
        your data lands in the open store from the first keystroke, so
        everything here applies to it. If you make things,
<a href="/build-with">build a view of your own</a> on the open
        protocol, or browse the <a href="/plugins">plugin catalogue</a> to see
        the manifest-and-consent flow for real. The bench is lit. The tools
        are on the board. The door, on purpose, has a handle on your side.
</p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li>
The map that became a genre:
<a href="https://en.wikipedia.org/wiki/Defense_of_the_Ancients" rel="noopener noreferrer"> <em>Defense of the Ancients</em></a> (Eul, 2003, from the StarCraft custom map <em>Aeon of Strife</em>;
          continued by Guinsoo and IceFrog) and the
<a href="https://en.wikipedia.org/wiki/Multiplayer_online_battle_arena" rel="noopener noreferrer">
MOBA genre</a> it founded — League of Legends (2009), Dota 2 (2013).
</li> <li>
The pattern before and after:
<a href="https://en.wikipedia.org/wiki/Doom_modding" rel="noopener noreferrer">
Doom’s WAD files</a> (1993; engine source released 1997),
<a href="https://en.wikipedia.org/wiki/Team_Fortress_Classic" rel="noopener noreferrer">
Team Fortress</a> (Quake mod, 1996),
<a href="https://en.wikipedia.org/wiki/Counter-Strike_(video_game)" rel="noopener noreferrer">
Counter-Strike</a> (Half-Life mod, 1999),
<a href="https://en.wikipedia.org/wiki/PlayerUnknown" rel="noopener noreferrer">
Brendan Greene’s battle-royale mods</a> (ARMA 2 DayZ mod → PUBG, 2017), and
<a href="https://en.wikipedia.org/wiki/Minecraft_modding" rel="noopener noreferrer">
Minecraft modding</a> (100&nbsp;billion CurseForge downloads, 2025).
</li> <li>
The enclosure:
<a href="https://developer.apple.com/app-store/review/guidelines/" rel="noopener noreferrer">
Apple App Review Guidelines, §2.5.2</a>; Chrome’s
<a href="https://ublockorigin.com/" rel="noopener noreferrer">
Manifest V3 and uBlock Origin</a> (see also the
<a href="https://www.eff.org/deeplinks" rel="noopener noreferrer">EFF’s coverage</a>).
</li> <li>
The honest counterexample:
<a href="https://github.com/trigram-mrp/fractureiser" rel="noopener noreferrer">
the fractureiser incident</a> (June 2023) — malware distributed through compromised accounts in
          Minecraft mods and modpacks.
</li> <li>
The intellectual spine:
<a href="https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html" rel="noopener noreferrer">
Clay Shirky, <em>Situated Software</em></a> (2004);
<a href="https://www.robinsloan.com/notes/home-cooked-app/" rel="noopener noreferrer">
Robin Sloan, <em>An app can be a home-cooked meal</em></a> (2020);
<a href="https://stephango.com/file-over-app" rel="noopener noreferrer">
Steph Ango, <em>File over app</em></a>;
<a href="https://www.inkandswitch.com/essay/malleable-software/" rel="noopener noreferrer">
Ink &amp; Switch, <em>Malleable software</em></a> (2025) and
<a href="https://www.inkandswitch.com/essay/local-first/" rel="noopener noreferrer"> <em>Local-first software</em></a> (2019); the
<a href="https://malleable.systems/" rel="noopener noreferrer">
Malleable Systems Collective</a>.
</li> <li>
Scoping authority instead of banning code:
<a href="https://www.figma.com/blog/how-we-built-the-figma-plugin-system/" rel="noopener noreferrer">
Figma’s plugin sandbox</a> (2019);
<a href="https://docs.deno.com/runtime/fundamentals/security/" rel="noopener noreferrer">
Deno’s permission model</a>;
<a href="https://extism.org/" rel="noopener noreferrer">Extism</a>;
<a href="https://en.wikipedia.org/wiki/Object-capability_model" rel="noopener noreferrer">
the object-capability model</a> (Mark S. Miller).
</li> <li>
The home-cooked age:
<a href="https://www.geoffreylitt.com/2023/03/25/llm-end-user-programming.html" rel="noopener noreferrer">
Geoffrey Litt, <em>Malleable software in the age of LLMs</em></a> (2023).
</li> <li>
The machinery and the receipts:
<a href="/blog/the-loom-you-can-read">The Loom You Can Read</a> (the
          signed change log, walked end to end),
<a href="/blog/the-tip-of-the-hook">The Tip of the Hook</a> (the
          developer’s view of the same machine),
<a href="/build-with">Build with xNet</a>, and the
<a href="/plugins">plugin catalogue</a>.
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>This is an independent essay. The writers and projects cited are
          summarized as commentary; xNet is not affiliated with or endorsed by
          them. The game histories are compressed — follow the citations for
          the fuller, messier versions. The manifest excerpt is trimmed for
          reading; the field names match the real source. All artwork here is
          original.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "the-workshop-and-the-walled-garden" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/the-workshop-and-the-walled-garden.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/the-workshop-and-the-walled-garden.astro";
const $$url = "/blog/the-workshop-and-the-walled-garden";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$TheWorkshopAndTheWalledGarden,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
