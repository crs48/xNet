import { c as createAstro, a as createComponent, m as maybeRenderHead, f as renderComponent, b as addAttribute, d as renderTemplate } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SeriesNav } from '../../chunks/SeriesNav_BZuFNaby.mjs';
import { $ as $$TimeoutArt } from '../../chunks/TimeoutArt_CYFxcC9U.mjs';
import { $ as $$Byline } from '../../chunks/Byline_Cs4LsEpg.mjs';
import { $ as $$Mermaid } from '../../chunks/Mermaid_D1Kl_hLV.mjs';
import { $ as $$CodeFigure } from '../../chunks/CodeFigure_F2M_f7y-.mjs';
import { d as postBySlug, f as formatPostDate } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$TimeoutHero = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$TimeoutHero;
  const { title, deck, date, readingMinutes, tags } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-border bg-surface/20 dark:bg-[#080d1a]"> ${renderComponent($$result, "TimeoutArt", $$TimeoutArt, {})} <div class="relative mx-auto max-w-3xl px-6 pb-14 pt-44 lg:pt-52"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sky-200/80"> <time${addAttribute(date, "datetime")}>${date}</time> <span aria-hidden="true">·</span> <span>${readingMinutes} min read</span> ${tags.map((tag) => renderTemplate`<span class="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 font-mono lowercase text-sky-200"> ${tag} </span>`)} </div> <h1 class="mt-4 text-4xl font-bold tracking-tight text-white drop-shadow lg:text-5xl"> ${title} </h1> <p class="mt-4 max-w-2xl text-lg leading-relaxed text-gray-300">${deck}</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/TimeoutHero.astro", void 0);

const $$Timeout = createComponent(($$result, $$props, $$slots) => {
  const post = postBySlug("timeout");
  const kw = (s) => `<span class="tok-keyword">${s}</span>`;
  const cm = (s) => `<span class="tok-comment">${s}</span>`;
  const providerCode = [
    `${cm("// packages/sync/src/provider.ts \u2014 options I wrote before")}`,
    `${cm("// I understood who they were for.")}`,
    `${cm("/** Connection timeout in milliseconds */")}`,
    `timeout?: ${kw("number")}`,
    `${cm("/** Whether to auto-reconnect on disconnect */")}`,
    `autoReconnect?: ${kw("boolean")}`,
    `${cm("/** Maximum reconnection attempts */")}`,
    `maxReconnectAttempts?: ${kw("number")}`,
    `${cm("/** Reconnection delay in milliseconds */")}`,
    `reconnectDelay?: ${kw("number")}`
  ].join("\n");
  const peerStates = `stateDiagram-v2
  direction LR
  [*] --> Connected
  Connected --> TimedOut: too much, too fast \u2014<br/>no answer within the window
  TimedOut --> Reconnecting: the huddle \u2014<br/>rest, and doing things your own way
  Reconnecting --> Syncing: cables plug back in,<br/>one at a time
  Syncing --> Connected: the offline years merge \u2014<br/>nothing is lost
  note right of TimedOut
    The protocol's view, and now mine:
    a timed-out peer is not exiled.
    It is expected back.
  end note`;
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${post.title} \u2014 xNet`, "description": post.description }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> ${renderComponent($$result2, "TimeoutHero", $$TimeoutHero, { "title": post.title, "deck": post.description, "date": formatPostDate(post.pubDate), "readingMinutes": post.readingMinutes, "tags": post.tags })} <article class="prose prose-lg mx-auto max-w-3xl px-6 py-16 dark:prose-invert prose-headings:tracking-tight prose-a:text-sky-600 dark:prose-a:text-sky-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post })} <p>
I am writing this from a recliner, eyes half-closed, speaking rather
        than typing. If you walked into the room you would see a man doing, as
        far as anyone could tell, nothing. I do a great deal of this. Hours of
        most days, for many months now: sitting nearly still, letting my body
        do something it never got the chance to do — feel what it has been
        holding, and begin to put it down.
</p> <p>
It looks like rest. It is some of the hardest work I have ever done.
        I've started calling this season my <strong>timeout</strong>, and this
        essay is about the three things that word has meant to me — because
        I've come to believe the third one is the reason xNet exists. The
        other eleven essays on this blog argue for a way of building software.
        This one is about where the argument came from. It is a personal
        essay, not a manifesto, and definitely not medical advice; it's one
        person's account, told from a chair.
</p> <h2>The corner</h2> <p>
The first meaning is the one we all learn as children. A timeout is a
        punishment. You did something wrong — or something in you was too
        much for the room — and you are sent to sit apart from everyone until
        you can behave.
</p> <p>
I'm autistic, and I have ADHD. I found out at thirty-five. Which
        means that for thirty-five years the world arrived at my nervous
        system at an intensity I had no name for — louder, brighter, faster,
        more, always more — and my body did the only wise thing available to
        a system with no better options: it turned the volume down on itself.
        The clinical word is dissociation. From the inside it feels less
        dramatic than the word sounds: a gradual stepping back from the
        surface of your own skin, the way you'd step back from a speaker
        that's too loud — except the speaker is everything, and the distance
        becomes where you live.
</p> <p>
There is careful research on this now, and it says something I find
        strangely hopeful. The felt sense of the body — hunger, heartbeat,
        warmth, the weather of emotion before it has a name — is called
<em>interoception</em>, and studies of autistic adults keep finding
        the same curious pattern: the difficulty reading those signals
        travels with a trait called alexithymia, common alongside autism but
<a href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4962768/" rel="noopener noreferrer">not intrinsic to it</a> — and people like me often turn out to be
<a href="https://www.frontiersin.org/journals/psychiatry/articles/10.3389/fpsyt.2025.1573263/full" rel="noopener noreferrer">confident about their bodily signals and
        inaccurate</a>. The signal was arriving the whole time. It was the reading that
        was hard. I knew about my body the way you can know about a country
        from books. At some point too early to remember, I had been sent to
        sit apart from it — a timeout from my own skin, served, as far as I
        can tell, since birth.
</p> <p>
But here is the thing about the corner: you can see the whole room
        from it. The years I spent away from sensation, I spent receiving
        everything else. In school I got to try almost every way humans make
        things — theatre, animation, filmmaking, sculpture, drawing, mixed
        media, electronic sculpture, computer art. And I took in stories the
        way other people take in air: film and music, anime and manga,
        science fiction and romance and horror, every genre, every register —
        thousands of hours of other people's ways of being alive, studied
        from a safe distance.
</p> <p>
I moved through the world the same way. I grew up in Connecticut and
        Maryland, went to school in Rhode Island, and then went looking: New
        York, Berlin, an island in the middle of the Atlantic, a forest, the
        tropics, San Diego, and now San Francisco. I started businesses and
        closed them. I made friends everywhere. If I wasn't going to live in
        my body, I was going to live everywhere else — and somewhat
        disconnected from my own signal, I became very good at picking up
        everyone else's. Surfing the ether. Collecting vibes the way other
        people collect souvenirs.
</p> <p>
And I went deep on connection with one person. I met my wife just
        after college — two nervous systems that had each been wanting touch
        for a long time, recognising each other. For fifteen years we met
        that want in each other, and we grew each other up. We're divorcing
        now; she is still my best friend. I don't know how to compress
        fifteen years into a paragraph of an essay about anything else, so I
        will only say this: most of what I know about connection that was
        worth building into software, I learned there.
</p> <h2>The called timeout</h2> <p>
The second meaning of the word comes from games, and it took me
        embarrassingly long to notice that it inverts the first one. In a
        game, a timeout is not a punishment. It is called <em>by your own
        team</em>. The game is running away from you; someone makes a T with
        their hands; the clock stops. Nobody is sent away. You huddle. You
        breathe. You look at each other and re-plan.
</p> <p>
The diagnosis at thirty-five was the hand going up. What I had been
        privately calling failure — the exhaustion that sleep didn't touch,
        losing capacities I used to have, tolerating less and less of the
        world — turns out to have a name and a literature. Researchers who
        finally asked autistic adults directly define
<a href="https://pubmed.ncbi.nlm.nih.gov/32851204/" rel="noopener noreferrer">autistic burnout</a> as long-term exhaustion, loss of function, and reduced tolerance to
        stimulus, arising from years of demands that outstrip capacity
        without adequate support. And when they asked what recovery looked
        like, the answers were not heroic: time off. Reduced expectations.
        Acceptance and support. Doing things in your own autistic way instead
        of performing someone else's. In other words — the recliner. The
        thing that looks like nothing is the documented intervention.
</p> <p>
The stillness has content, too. Somatic therapists describe how a
        nervous system that mobilised enormous survival energy and never got
        to complete the motion will hold it — for years, in the muscles, as a
        kind of standing clench — and they describe
<a href="https://traumahealing.org/se-101/" rel="noopener noreferrer">discharge</a>: the body, given enough safety and enough time, releasing that
        charge in trembling, heat, tears, the long exhale — the way animals
        shake after a near miss and then simply carry on. So I sit still, and
        my body finishes sentences it started decades ago, at whatever pace
        it chooses, in whatever order. Sensation is coming back — much more
        slowly than I would like. The image I keep reaching for is plugging
        the cables of a nervous system back in, one at a time, and waiting
        for each connection to hold before touching the next.
</p> <p>
(I care enough about this that I keep a small, free
<a href="https://crs48.github.io/nervous-system-healing/" rel="noopener noreferrer">site about nervous-system work</a> — no products, no accounts — where the careful version lives, with
        evidence ratings and crisis resources. This essay is a story, not
        advice; if any of it rhymes with your life, that site is the gentler
        front door, and a good clinician is a better one.)
</p> <h2>The dream in the dissociation</h2> <p>
So what was the rest of me doing all those years, while my body
        waited in the corner? It was dreaming. xNet is the dream it had.
</p> <p>
I don't mean that as decoration. I mean it as provenance. This
        project is an amalgamation — on rougher days I've called it an
        excretion — of everything the corner years took in: the stories, the
        art forms, the cities, the businesses, the thousand borrowed ways of
        being a person. It formed while I was somewhat disembodied, floating
        closer to the collective signal than to my own. For a long time I
        thought that was the whole story: I absorbed a lot, and I made a
        thing.
</p> <p>
Then, somewhere in this timeout, lying still enough to finally
        notice, I actually looked at what the dream insists on. Every peer
        keeps its own complete copy of what matters to it; the primary copy
        of your life lives with you, at home. Peers connect as equals,
        without dissolving into a centre. Consent is structural. Leaving is
        a supported act. And then there is the part I can't stop looking at —
        what the protocol thinks a <em>timeout</em> is.
</p> ${renderComponent($$result2, "CodeFigure", $$CodeFigure, { "code": providerCode, "filename": "provider.ts", "caption": "From the sync provider's options, verbatim. Somewhere in here I wrote down what I needed: a timeout is a duration, not a verdict; reconnection is assumed; absence is a state you return from." })} <p>
In a network, a timeout is what happens when a peer doesn't answer
        within the window. It is the coldest word in the vocabulary — the
        moment a system decides someone isn't there. And look what the dream
        wrote down about it. A timeout is a <em>number of milliseconds</em>,
        not a judgement. Auto-reconnect is a first-class option, sitting
        right beside it. And the first thing the interface offers a
        returning peer is a method whose documentation reads, in the
        driest possible voice, <em>“useful for catching up after
        reconnection”</em>: everything you missed, requested and merged.
        Because the substrate is an append-only, signed change log, a peer
        can be gone for an hour or a year, and what it did while it was away
        isn't discarded or rebased into shame — it merges. The whole system
        is built on the assumption that going quiet is ordinary, and that
        coming back is expected.
</p> ${renderComponent($$result2, "Mermaid", $$Mermaid, { "code": peerStates, "caption": "The state machine I apparently needed someone to draw for me. It was in the protocol the whole time." })} <p>
I built a network that treats going quiet the way I needed to be
        treated. I designed my own re-entry and called it architecture. The
        disembodied part of me spent those years drawing, in the only
        notation it trusted, a diagram of the connection it was missing —
        peers that stay whole while they touch; absence without exile; a
        homecoming protocol. I thought I was designing for data. I was
        writing a self-portrait in TypeScript.
</p> <h2>Lower resolution</h2> <p>
Now I have to tell you the complicated part, because founder essays
        usually don't, and the omission is exactly what makes them
        untrustworthy. Some days I don't entirely want to build xNet.
</p> <p>
Not because I stopped believing it — the previous eleven essays are
        the believing, and I stand behind every one. It's stranger than
        that. As sensation returns, I can feel — not conclude,
<em>feel</em> — how much lower resolution the dream is than the
        thing it was standing in for. One minute of actually inhabiting this
        body — the weight of hands, breath moving the ribs, the exact
        texture of an emotion arriving before its name — carries more
        information than any protocol I will ever specify. The nervous
        system I dissociated from turns out to be the highest-bandwidth
        instrument I own, and I am only now learning to read it. Next to
        that, the platform I dreamed while I was away is a beautiful,
        earnest, <em>coarse</em> thing. Coming back online makes the avatar
        feel small.
</p> <p>
For a while that frightened me. If xNet was the avatar of the
        disembodied me, does reconnecting to my body mean abandoning it? But
        the project already contains its own answer, and it's the first
        principle this whole blog keeps returning to: <strong>the primary
        copy lives at home.</strong> Not in the cloud — the cloud holds
        replicas. And the primary copy of <em>me</em> does not live in xNet.
        It lives in the body in this recliner. The software is a secondary
        copy of some things I believe, rendered at the resolution software
        can manage. That is not a demotion; it's the correct entry in the
        replication table. The right size for this project in my life is
        not a self. It's a tool — a good one, worth finishing well, that
        helps other people keep their primary copies at home too.
</p> <p>
And there's a safeguard here I only now fully appreciate: we built
        this thing so that it doesn't need to be anyone's whole self. The
        protocol is open and specified. The data is yours, on your device,
        under your keys. Leaving is a supported act —
<a href="/blog/the-right-to-say-no">we wrote a whole essay about
        that</a>. A project designed so its users can survive its founder
        having a body is exactly the kind of software I would want to depend
        on — and it means I get to say all of this out loud without it being
        a resignation letter. The work continues. It just doesn't get to be
        me.
</p> <h2>The peer that went quiet</h2> <p>
From the recliner, then, one more look at the word. The corner
        taught me that a timeout was something done to you. The huddle
        taught me it was something you call for yourself. The network taught
        me the rest: that a well-designed system expects its peers to go
        quiet sometimes, holds their place without resentment, and treats
        the return not as an apology tour but as a sync — <em>here is
        everything that happened; merge it in; carry on.</em> </p> <p>
The cables keep reconnecting, one at a time, at the body's pace and
        nobody else's. And when I follow them forward, past the platform,
        the dream keeps going: food forests with geodesic dome homes grown
        into them; networks of communities, all over the earth, regenerating
        the land they stand on; people more connected to each other and to
        nature — a mesh again, I notice, peers again, just made of gardens
        and neighbours instead of nodes. The dream was never only software.
        Software is the part I could build from a chair.
</p> <p>
Nothing that happened while I was away is lost. That's the property
        the whole architecture guarantees, and it turns out to be the
        property I most needed to believe about a life: the stories, the
        cities, the friendships, the businesses, the art, the fifteen years
        — the entire log of the offline decades merges back in, and becomes
        the substrate the next thing is built on. These days I mostly
        practise letting the energy move, and following the feeling my
        values make when something is aligned — that quiet, unmistakable
        reading of <em>goodness</em> and <em>rightness</em> that I now get
        to receive directly, in the body, at full resolution.
</p> <p>
A timeout, I understand now, was never a room you get left in. It's
        a window, and a window has a duration, and the duration ends. The
        peer syncs. The log merges. The clock restarts. <strong>I'm coming
        back online.</strong> </p> <hr> <h3 id="sources">Sources</h3> <ul class="text-base"> <li>
On autistic burnout:
<a href="https://pubmed.ncbi.nlm.nih.gov/32851204/" rel="noopener noreferrer">
Raymaker et&nbsp;al., <em>“Having All of Your Internal Resources
            Exhausted Beyond Measure and Being Left with No Clean-Up Crew”:
            Defining Autistic Burnout</em></a> (Autism in Adulthood, 2020) — the definition and the recovery
          factors summarised above; see also the
<a href="https://www.autism.org.uk/advice-and-guidance/professional-practice/autistic-burnout" rel="noopener noreferrer">National Autistic Society's overview</a>.
</li> <li>
On interoception and alexithymia:
<a href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4962768/" rel="noopener noreferrer">
Shah et&nbsp;al., <em>Alexithymia, not autism, is associated with
            impaired interoception</em></a> (Cortex, 2016), and a
<a href="https://www.frontiersin.org/journals/psychiatry/articles/10.3389/fpsyt.2025.1573263/full" rel="noopener noreferrer">2025 systematic review and
          meta-analysis</a> of interoception in autism.
</li> <li>
On discharge and the body's completion of stress responses:
<a href="https://traumahealing.org/se-101/" rel="noopener noreferrer">
Somatic Experiencing International, <em>SE&nbsp;101</em></a> (Peter Levine's framework — titration, pendulation, discharge).
</li> <li>
The gentler front door:
<a href="https://crs48.github.io/nervous-system-healing/" rel="noopener noreferrer">
nervous-system healing</a> — a free, no-account educational site I maintain, with evidence
          ratings and crisis resources.
</li> <li>
The machinery quoted:
<code>packages/sync/src/provider.ts</code> in the
<a href="https://github.com/crs48/xNet" rel="noopener noreferrer">xNet repository</a>
(the sync provider's reconnection options and the
          “catching up after reconnection” interface), and
<a href="/docs/protocol/overview">the protocol specification</a> —
          the append-only signed change log that makes long absence
          mergeable. For how the log works, see
<a href="/blog/the-loom-you-can-read">The Loom You Can Read</a>;
          for leaving as a supported act,
<a href="/blog/the-right-to-say-no">The Right to Say No</a>.
</li> </ul> <p class="text-sm text-gray-400 dark:text-gray-500"> <em>This is a personal essay, not medical advice — autism,
          ADHD, dissociation and burnout look different in every body, and
          nothing here is a protocol for yours. The research cited is
          summarised in one sentence each; follow the links for the fuller,
          messier versions. If you are in crisis, please reach for real
          support: in the US, call or text 988. The code excerpt is verbatim
          from the source; the essay around it is one person's reading. All
          artwork here is original.</em> </p> </article> ${renderComponent($$result2, "SeriesNav", $$SeriesNav, { "slug": "timeout" })} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/timeout.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/timeout.astro";
const $$url = "/blog/timeout";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Timeout,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
