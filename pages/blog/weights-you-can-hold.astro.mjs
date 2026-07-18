import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$WeightsArt } from '../../chunks/WeightsArt_Bc9BC53X.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { $ as $$WatchTheOriginal } from '../../chunks/WatchTheOriginal_DYK7Zf8J.mjs';
import { $ as $$Mermaid } from '../../chunks/Mermaid_D1Kl_hLV.mjs';
import { $ as $$CodeFigure } from '../../chunks/CodeFigure_F2M_f7y-.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$WeightsHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$WeightsHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#0b0805]"> ${renderComponent($$result, "WeightsArt", $$WeightsArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 font-mono lowercase text-amber-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/WeightsHero.astro", void 0);

const $$HonestWeights = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      isnt: "We won\u2019t claim open models beat the frontier at everything.",
      is: "Benchmark-victory posts age in weeks. The honest claim is smaller and stronger: open-weight models are now good enough for much of what most people actually do, they run on hardware you already own, and the gap closes a little every quarter. That is enough to change who sets the price."
    },
    {
      isnt: "We won\u2019t pretend every exit is a choice.",
      is: "Being priced out of a mortgage is not a philosophy, and a business started because no one is hiring is partly unemployment wearing a trench coat. The exits are real, but some doors were closed before this generation reached them. Both things are true at once."
    },
    {
      isnt: "We won\u2019t pretend to be bystanders.",
      is: "xNet sells a managed cloud AI tier and paid hosting. The difference we can defend is structural: the connector ladder makes our tier compete for you next to your own hardware, and the export door means choosing us is never a one-way turnstile. Judge the receipts, not the cheering."
    },
    {
      isnt: "We won\u2019t pretend the spiral turns itself.",
      is: "The Progressive Era was not a vibe; it was Ida Tarbell doing years of documentary work and reformers building institutions. Booing is a start, and buying differently is better, but the next turn of the spiral gets built by people who make things \u2014 including boring, load-bearing things like protocols."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="not-prose my-12"> <div class="rounded-2xl border border-border bg-surface/30 p-6 dark:bg-surface/40 lg:p-8"> <h3 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
Honest weights and measures
</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
A revolution oversold is just another pitch. Here is the honest scope.
</p> <ul class="mt-6 space-y-5"> ${rows.map((row) => renderTemplate`<li class="grid gap-3 sm:grid-cols-[1fr_1.3fr] sm:gap-5"> <div class="flex gap-2.5"> <span class="select-none text-gray-400 dark:text-gray-600">✕</span> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${row.isnt}</p> </div> <div class="flex gap-2.5"> <span class="select-none text-amber-500">✓</span> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.is}</p> </div> </li>`)} </ul> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/HonestWeights.astro", void 0);

const $$WeightsYouCanHold = createComponent(($$result, $$props, $$slots) => {
  const post = postBySlug("weights-you-can-hold");
  const cm = (s) => `<span class="tok-comment">${s}</span>`;
  const st = (s) => `<span class="tok-string">${s}</span>`;
  const ty = (s) => `<span class="tok-type">${s}</span>`;
  const ladderCode = [
    `${cm("// packages/plugins/src/ai/connectors/detect.ts \u2014 every way this")}`,
    `${cm("// app can reach a model, probed in parallel, ranked, and yours")}`,
    `${cm("// to override. The order is a preference, not a cage.")}`,
    `${ty("managed")}:        ${st("'XNet Cloud (managed, metered)'")}`,
    `${ty("bridge")}:         ${st("'Local bridge (Claude Code / Codex subscription)'")}`,
    `${st("'cloud-key'")}:    ${st("'Cloud API key (Anthropic / OpenAI / OpenRouter)'")}`,
    `${st("'local-server'")}: ${st("'Local model (Ollama / LM Studio)'")}`,
    `${ty("webllm")}:         ${st("'In-browser model (WebLLM, WebGPU)'")}`,
    `${st("'prompt-api'")}:   ${st("'Chrome built-in AI (Gemini Nano)'")}`
  ].join("\n");
  const spiral = `flowchart TB
  A["Gilded Age<br/>railroads, oil, steel \u2014<br/>wealth faster than rules"] -->|"the people who<br/>grew up inside it"| B["Progressive Era<br/>Tarbell \xB7 Addams \xB7<br/>antitrust"]
  B -.same move,<br/>new machines.-> C["WWI + the 1918 flu<br/>the \u2018Lost Generation\u2019"]
  C -->|"the same people,<br/>grown"| D["Roaring Twenties<br/>jazz, modernism,<br/>Tolkien\u2019s answer"]
  D -.same move,<br/>new machines.-> E["Platform decade<br/>feeds, rent, data harvest \u2014<br/>the anxious 2010s"]
  E -->|"the quiet exits<br/>this essay is about"| F["The next turn<br/>(being built now)"]`;
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "WeightsHero", $$WeightsHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-amber-600 dark:prose-a:text-amber-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
In May, at the University of Central Florida, a property-development
        executive stood in front of a stadium of graduates and told them that
        the rise of artificial intelligence is the next industrial revolution.
        The stadium booed her. She paused, visibly recalculating, and offered
        the only honest line of the speech: <em>“Okay. I struck a chord.”</em>
A few weeks later, at the University of Arizona, Eric Schmidt — the
        former chief executive of Google — invoked Time’s person of the year,
        the architects of artificial intelligence, and the boos started before
        he could finish the sentence. To his credit, he didn’t pretend
        otherwise: <em>“I know what many of you are feeling about that. I can
        hear you.”</em> </p> <p>
Two stages, two executives, one sound. If you only read the headlines,
        the sound is easy to file away: the kids hate AI. Two video essays from
        this spring — one from a finance channel called The Exit Manual, one
        from Cole Hastings — sat with that sound longer, and each came back
        with half of a more interesting story. This essay is about what you
        see when you put their halves together, and about the one piece of the
        picture that we work on here.
</p> ${renderComponent($$result2, "WatchTheOriginal", $$WatchTheOriginal, { "href": "https://www.youtube.com/watch?v=MwBwIYAj7_U", "title": "The Gen Z Revolution Is Quietly Happening (and you might miss it)", "author": "The Exit Manual", "length": "14 min" })} <h2>The boo, decoded</h2> <p>
Start with what the boo is not. It is not Luddism, because the people
        booing are the heaviest users of these tools on the planet. The Exit
        Manual puts it with a smirk: <em>“these kids all use Claude Code to
        get through finals.”</em> You do not boo a hammer. You boo a story —
        and the story being sold from those stages has a crack running through
        the middle of it. For several years the same executives have told
        young people two things at once: that AI is so powerful it will make
        them redundant, and that it will make them the most productive workers
        in history. Both cannot be true, and four years in, the measured
        reality is thinner than either. A National Bureau of Economic Research
        survey of nearly six thousand executives across four countries found
        the vast majority reporting <em>no measurable impact</em> from AI on
        productivity or employment; an MIT report put the share of corporate
        generative-AI pilots that fail to reach the profit-and-loss statement
        at about ninety-five per cent.
</p> <p>
Meanwhile the companies on stage need the opposite to be believed,
        urgently and at scale, because trillion-dollar build-outs are being
        financed against it. That is the bluff the stadium is calling. The
        graduates are not saying the machines don’t work. They are saying:
<em>we can hear whose mortgage this speech is paying.</em> And — this
        is the part the headlines miss — they are not stopping at the boo.
</p> <h2>The spiral</h2> <p>
Cole Hastings’ video supplies the frame, and he borrows it from an
        unlikely shelf: the manga <em>Berserk</em>, where a mage explains that
        causality moves not in a circle but in a spiral. Events rhyme with the
        past without repeating it — the observation usually lent to Mark
        Twain. History keeps arriving at the same corner, one storey up.
</p> ${renderComponent($$result2, "WatchTheOriginal", $$WatchTheOriginal, { "href": "https://www.youtube.com/watch?v=3MfsBH32n2g", "title": "Why Gen Z Will Start The Next Revolution", "author": "Cole Hastings", "length": "17 min" })} <p>
His exhibit A is the Gilded Age. From the 1870s to the early 1900s,
        railroads, oil and steel created wealth faster than society could
        write rules for it. By 1910, on Thomas Piketty’s historical series,
        the top tenth of Americans held roughly eighty per cent of the wealth;
        underneath the famous fortunes, children worked the mills. And then
        the spiral turned — not on its own, but because the people who had
        grown up inside that machine came of age and went to work on it. Ida
        Tarbell, whose father’s livelihood was crushed by Standard Oil, spent
        years documenting exactly how the trust operated and published the
        exposé that helped break it. Jane Addams opened Hull House. A
        trust-busting administration won the Northern Securities case. The
        frustrations of one era became the reform energy of the next.
</p> <p>
Exhibit B is grimmer and faster: the generation that walked out of the
        First World War and the 1918 influenza — sixteen million dead in the
        war, tens of millions more from the flu — was labelled the Lost
        Generation, nihilistic and broken. That generation then produced the
        Roaring Twenties: jazz, modernism, Hemingway and Fitzgerald, and — as
        Hastings points out — Tolkien, who answered the despair he had
        marched through with the most stubbornly hopeful story of the
        century.
</p> ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": spiral, "caption": "Not a circle \u2014 a spiral. The generation that comes of age inside somebody else\u2019s boom is the one that writes the rules of the next turn." })} <p>
Now run the parallel forward. The railroads of this turn are
        attention, inference and cloud rent. The trust question of 1904 —
<em>how much power should a railroad have over ordinary life?</em> —
        is the platform question of 2026, with the nouns swapped: how much
        should a feed, a model or a data centre have over culture, attention
        and truth? And the generation being called nihilistic, anxious and
        broke is right on schedule — living inside the machine, learning how
        it works, and starting, quietly, to route around it. Which brings us
        to the other video, and to what the routing-around actually looks
        like. It looks like four exits.
</p> <h2>Exit one: the weights</h2> <p>
The first exit is the one that would have sounded like science fiction
        five years ago: young people are unsubscribing from the AI companies
        and running the models themselves. Open-weight models — Qwen, GLM,
        Llama, DeepSeek and their cousins — can be pulled onto a consumer
        laptop with a single command and run there, on your electricity, with
        your data never leaving the machine. The Exit Manual’s montage of
        self-hosters lands on a young developer’s six-word manifesto:
<em>“My device, my model, my rules.”</em> </p> <p>
Notice what this exit is made of. Not placards; parameters. The same
        cohort that boos the commencement speaker goes home and downloads the
        weights — the literal numbers — and in doing so converts a
        subscription into a possession. The Exit Manual sharpens it into
        strategy: protesting the data centre makes headlines, but
<em>“millions of young people ditching their Claude, ChatGPT, and
        Gemini subscriptions and moving to open-weight models”</em> is what
        actually moves a market that is priced on the assumption you can
        never leave. We would add only this: the point is not that open
        models beat the frontier — most weeks they don’t — it’s that
<em>good enough, owned</em> now competes with <em>best available,
        rented</em>, and every quarter the gap narrows. When the thing you
        rent has a substitute you can hold, the landlord’s pricing meeting
        changes tone.
</p> <h2>Exit two: the deposit</h2> <p>
The second exit runs through the oldest asset there is. Gen Z is the
        first cohort in decades that is, in large numbers, not saving for a
        house deposit at all. Surveys put their average age of first
        investment around nineteen — against the mid-thirties for baby
        boomers — and find crypto held by roughly four in ten young investors.
        Barely a quarter of American Gen Z owns a home, against about eighty
        per cent of baby boomers today. The deposit that previous
        generations fed for a decade has become a brokerage account fed from
        the first pay cheque.
</p> <p>
You can read that as recklessness, and plenty do. But read it the
        other way first: housing’s status as <em>the</em> wealth vehicle is a
        policy outcome, not a law of physics. Tokyo — permissive zoning,
        constant rebuilding, a culture that treats homes as things to live in
        rather than tickets to appreciation — keeps housing in a major world
        city affordable. A generation redirecting its savings from an asset it
        has been priced out of into assets with a lower barrier to entry is
        doing what locked-out people have always done: it is refusing to queue
        at a door that will not open, and building equity somewhere the
        gatekeeper can’t see. Whether that works is genuinely uncertain — we
        get honest about it below — but as a signal it belongs in this list,
        because it is the same move as the weights: <em>stop paying rent on
        the thing; hold the thing.</em> </p> <h2>Exit three: paper</h2> <p>
The third exit looks, at first, like nostalgia for a world this
        generation never lived in. The number of independent bookstores in the
        United States has grown by about seventy per cent since 2020 — from
        roughly 1,900 to over 3,200, with more than four hundred new shops
        opening in 2025 alone. Film photography, left for dead a decade ago,
        is compounding double digits a year, and photographers under
        twenty-five are its largest cohort of new customers. Vinyl grew
        again. Board games grew again. The people driving all of it grew up
        entirely inside the feed.
</p> <p>
The production side explains the pull. In 2024 a reported set of
        Netflix guidelines asked writers to have characters announce what they
        are doing so that “viewers” — meaning people looking at their phones —
        could follow the plot without watching it. Media engineered for your
        half-attention is media that has stopped respecting you; the analogue
        shelf is where the respect went. The Exit Manual gives the trend its
        thesis line, and it deserves quoting whole: <em>“Choosing the things
        that cost you your undivided attention is like choosing a money that
        you can’t print.”</em> A book cannot autoplay. Film cannot be
        A/B-tested after the shutter closes. A generation whose attention has
        been the raw material of the world’s largest companies is
        re-materialising that attention into objects that hold it — and
        cannot be inflated, revoked, or re-ranked by anyone.
</p> <h2>Exit four: the door marked “build your own”</h2> <p>
The last exit has an asterisk on it, and the honest version keeps the
        asterisk. Gen Z is starting businesses at a record clip for its age —
        and part of the reason is that the conventional path has quietly
        stopped existing. Entry-level listings have thinned; worse, a
        remarkable share of what remains isn’t real. In one survey of 650
        hiring managers, four in ten companies admitted posting a fake job
        listing that year, three in ten had fakes up at that moment, and
        seven in ten managers considered the practice morally acceptable —
        for “investor optics” and to keep current staff on their toes. A
        separate analysis put the share of ghost listings at roughly one in
        four. The Exit Manual’s gloss is bleakly perfect: <em>“young people
        are applying to AI-generated fake jobs with an AI-generated fake CV to
        make fake money printed out of thin air.”</em> </p> <p>
So they stop applying and start incorporating: the game studio, the
        fashion label, the liquor store bought at twenty-three by someone who
        doesn’t drink. Some of it is glorious; plenty of it earns below
        minimum wage; all of it teaches the unfakeable curriculum — how an
        idea becomes a thing, how a customer thinks, how to lead before you
        feel ready. A cohort is being force-fed, at scale and young, exactly
        the skills you cannot get from a job description that was never real
        in the first place.
</p> <h2>The same door</h2> <p>
Four exits, one shape. In <a href="/blog/the-right-to-say-no">an
        earlier essay in this series</a> we leaned on Albert Hirschman’s old
        distinction between <strong>voice</strong> — staying and complaining —
        and <strong>exit</strong> — leaving — and on his sharpest point: voice
        only has power when exit is credible. A complaint the other side
        knows you cannot act on is just noise. That essay argued that the
        modern platform economy is, at bottom, a machine for removing exits,
        and that the humane counter-move is to rebuild the door.
</p> <p>
Look again at the stadium. The boo is voice — and on its own, the
        people on stage can wait it out; they have heard worse in earnings
        calls. What makes this generation different is everything that happens
        after the ceremony: the cancelled subscription, the local model, the
        brokerage account, the bookshop, the sole proprietorship. That is
        exit, executed in parallel, across every domain where a chokepoint
        was charging rent — and it is why the channel that catalogued it all
        is called The Exit Manual. The revolution is quiet for the same
        reason it is effective: it doesn’t petition the landlord. It moves
        out.
</p> <h2>The software layer of the exit</h2> <p>
Which brings us to the part of the picture we are responsible for.
        Because there is one domain where “moving out” has historically been
        impossible on purpose: your software, and the data inside it. Your
        notes, your projects, your messages — for two decades the default
        architecture has kept the master copy of your life on someone else’s
        computer, in shapes only their software can read. In that world there
        is no equivalent of downloading the weights. The exit is missing by
        design.
</p> <p> <a href="/">xNet</a> is our attempt to build the missing exit, and the
        essays in this series have walked its architecture from different
        angles: <a href="/blog/the-vault-and-the-view">your data as a vault
        you hold, with every app just a view over it</a>;
<a href="/blog/hand-on-the-tiller">software that leaves your hand on
        the tiller</a>; <a href="/blog/the-workshop-and-the-walled-garden">
authority that is scoped instead of surrendered</a>. The short
        version: the master copy of everything you make lives on your own
        device, signed with an identity you mint yourself, exportable whole,
        syncing through a hub you choose, rent from, or run on your own
        hardware. Leaving loses nothing. That is the deposit, the bookshop
        and the weights, applied to software.
</p> <p>
And on the specific exit this essay opened with — the models — here is
        the receipt, from the code that decides how the app’s assistant
        reaches a brain:
</p> ${renderComponent($$result2, "CodeFigure", $$CodeFigure, { "code": ladderCode, "filename": "packages/plugins/src/ai/connectors/detect.ts", "caption": "The connector ladder: six ways to reach a model, probed in parallel and ranked. On xNet Cloud the managed tier leads; strip the cloud away and the ladder is your own coding-agent subscription, your own key, Ollama on your desk, or a model running inside the browser tab itself." })} <p>
Read the bottom half of that list again. A model served from your own
        machine, or executed entirely inside your browser over WebGPU, is a
        first-class citizen of the app — probed for before it is needed,
        preferred automatically when better options are absent, never
        second-class to the tier we happen to sell. “My device, my model, my
        rules” is a fine slogan; a probe order you can read in the source is
        better.
</p> ${renderComponent($$result2, "HonestWeights", $$HonestWeights, {})} <h2>The generation that reads the terms</h2> <p>
Hastings ends his video with graphs of generational anxiety and a
        question that reframes them: how much further can those lines climb
        before something breaks — and what if the breaking looks less like
        collapse and more like what we are watching? People do not stay
        backed into a corner forever. They boo, and then they leave, and then
        — if the spiral holds — they build the thing that makes the old
        arrangement look absurd in hindsight, the way Tarbell made the trusts
        look absurd, the way the Lost Generation made the pre-war pieties
        unwritable.
</p> <p>
We named this essay for the common thread in everything the exits
        reach for. Open weights. A paid-off asset. A film camera heavy in the
        hand. A business with your own name on the door. Owned things have
<em>weight</em> — you can hold them, carry them out, set them down on
        your own shelf. Rented things weigh nothing, and cost more every
        year. A whole generation, raised weightless, is choosing heavy on
        purpose — and our job, in this small corner of the spiral, is to make
        sure their software can be heavy too.
</p> <p>
If you want to hold some weight today: <a href="/app">use the app</a>
— it’s free, offline, and private. Read
<a href="/commitments">the commitments</a> and
<a href="/why">the receipts behind them</a>. Or
<a href="/build-with">build something of your own</a> on the open
        protocol. The next turn of the spiral is not going to build itself.
</p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li>
The two essays this responds to:
<a href="https://www.youtube.com/watch?v=MwBwIYAj7_U" rel="noopener noreferrer">
The Exit Manual — <em>The Gen Z Revolution Is Quietly Happening (and
            you might miss it)</em></a>
and
<a href="https://www.youtube.com/watch?v=3MfsBH32n2g" rel="noopener noreferrer">
Cole Hastings — <em>Why Gen Z Will Start The Next Revolution</em></a> (YouTube). Watch both; they are better than this summary of them.
</li> <li>
The commencement boos:
<a href="https://www.nbcnews.com/tech/tech-news/former-google-ceo-booed-graduation-speech-ai-rcna345585" rel="noopener noreferrer">
NBC News — Former Google CEO Eric Schmidt booed during graduation
            speech about AI</a> (University of Arizona; the UCF speech is quoted in both videos).
</li> <li>
The measured AI-productivity gap:
<a href="https://fortune.com/article/why-do-thousands-of-ceos-believe-ai-not-having-impact-productivity-employment-study/" rel="noopener noreferrer">
Fortune — on the NBER survey of ~6,000 executives reporting no
            measurable impact</a>
and
<a href="https://fortune.com/2025/08/18/mit-report-95-percent-generative-ai-pilots-at-companies-failing-cfo/" rel="noopener noreferrer">
Fortune — MIT report: 95% of generative-AI pilots failing to reach
            P&amp;L</a>.
</li> <li>
The analogue revival:
<a href="https://www.goodgoodgood.co/articles/independent-bookstores-on-the-rise" rel="noopener noreferrer">
Good Good Good — indie bookstores up ~70% since 2020, with 422 new
            shops in 2025 (ABA data)</a>
and
<a href="https://theconversation.com/why-gen-z-is-falling-in-love-with-film-photography-282454" rel="noopener noreferrer">
The Conversation — why Gen Z is falling in love with film
            photography</a>. The Netflix second-screen guidance was first reported in
<a href="https://www.nplusonemag.com/issue-49/essays/casual-viewing/" rel="noopener noreferrer">
n+1 — “Casual Viewing”</a>.
</li> <li>
Gen Z money:
<a href="https://rpc.cfainstitute.org/sites/default/files/-/media/documents/article/industry-research/Gen_Z_and_Investing.pdf" rel="noopener noreferrer">
CFA Institute &amp; FINRA — <em>Gen Z and Investing</em></a>
and
<a href="https://www.fool.com/money/research/financial-firsts-milestones/" rel="noopener noreferrer">
The Motley Fool — Financial Firsts: when Americans hit their money
            milestones</a>.
</li> <li>
Ghost jobs:
<a href="https://www.resumebuilder.com/3-in-10-companies-currently-have-fake-job-posting-listed/" rel="noopener noreferrer">
ResumeBuilder — 3 in 10 companies currently have fake postings
            listed</a>
and
<a href="https://www.entrepreneur.com/business-news/one-quarter-of-jobs-posted-online-are-fake-ghost-jobs-study/496683" rel="noopener noreferrer">
Entrepreneur — Greenhouse: about 1 in 4 listings are likely ghost
            jobs</a>.
</li> <li>
Exit and voice:
<a href="https://en.wikipedia.org/wiki/Exit,_Voice,_and_Loyalty" rel="noopener noreferrer">
Albert O. Hirschman, <em>Exit, Voice, and Loyalty</em> (1970)</a>; Gilded Age wealth concentration after
<a href="https://en.wikipedia.org/wiki/Capital_in_the_Twenty-First_Century" rel="noopener noreferrer">
Thomas Piketty’s historical series</a>.
</li> <li>
The architecture and the receipts: <a href="/why">xNet — Why</a> and
<a href="/commitments">the Humane Charter</a>. Companion essays:
<a href="/blog/the-right-to-say-no">The Right to Say No</a>,
<a href="/blog/the-vault-and-the-view">The Vault and the View</a>, and
<a href="/blog/the-workshop-and-the-walled-garden">The Workshop and
          the Walled Garden</a>.
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>This is an independent essay. Both videos are referenced and
          summarised as commentary and criticism; xNet is not affiliated with,
          authorised by, or endorsed by either creator. Where the videos’
          statistics could not be traced to a primary source they have been
          softened or attributed to the videos directly — follow the citations
          and watch the originals. All artwork here is original, and this page
          loads nothing third-party.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "weights-you-can-hold" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/weights-you-can-hold.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/weights-you-can-hold.astro";
const $$url = "/blog/weights-you-can-hold";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$WeightsYouCanHold,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
