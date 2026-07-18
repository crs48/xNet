const AUTHORS = {
  crs48: {
    id: "crs48",
    name: "crs48",
    href: "https://github.com/crs48",
    avatar: "/blog/authors/crs48.jpg"
  },
  claude: {
    id: "claude",
    name: "Claude",
    href: "https://claude.com/claude-code",
    avatar: "/blog/authors/claude.svg",
    ai: true
  }
};
const posts = [
  {
    slug: "people-in-disguise",
    title: "People in Disguise",
    description: "For forty years, one man has been making the same argument from inside the machine: a VR pioneer, a working musician, Microsoft’s in-house heretic — insisting that digital information is really just people in disguise. On Jaron Lanier’s long war against the siren servers, what his ideas look like when you actually build them — and the one prescription we deliberately refuse.",
    pubDate: "2026-07-18T17:00:00Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "philosophy", "privacy", "economics"],
    readingMinutes: 14
  },
  {
    slug: "clutch-power",
    title: "Clutch Power",
    description: "On 28 January 1958 the LEGO Group patented not a brick but a coupling — stud and tube, and with them clutch power: a grip firm enough to build with that still comes apart by hand. The web never got a coupling for data, so every app moulds pieces that fit only its own set, and the APIs that promised otherwise were drawbridges. On the four frozen interfaces xNet ships instead — one node shape, one namespace anyone can mint into, one merge rule, one permission algebra — and why the grip matters as much as the snap: nobody plays with your bricks unless you say so.",
    pubDate: "2026-07-14T17:00:00Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "protocol", "decentralization", "philosophy"],
    readingMinutes: 14
  },
  {
    slug: "weights-you-can-hold",
    title: "Weights You Can Hold",
    description: "Graduates are booing AI executives at commencement, then going home to run open-weight models on their own laptops. Two video essays, one quiet revolution: a generation trading rented everything for things it can hold — model weights, assets, film cameras, businesses of its own — and what that exit means for who owns your software.",
    pubDate: "2026-07-10T17:00:00Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "economics", "privacy", "decentralization"],
    readingMinutes: 13
  },
  {
    slug: "timeout",
    title: "Timeout",
    description: "A personal essay on autism, dissociation, and the network I dreamed while I was away from my body. The word has three meanings — the punishment corner, the huddle a team calls for itself, and the quiet that falls when a peer stops answering — and I have lived in all three. On finding out at thirty-five, on the years of taking everything in from a distance, and on discovering that the protocol I built treats going quiet exactly the way I needed to be treated: a timeout is a duration, not a verdict, and when the peer comes back, the log catches it up on everything it missed.",
    pubDate: "2026-07-08T17:00:00Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "personal", "philosophy"],
    readingMinutes: 13
  },
  {
    slug: "the-vault-and-the-view",
    title: "The Vault and the View",
    description: "When Google Reader died, everyone got an export — and discovered the file was a brick, shaped for a renderer that no longer existed. The modern app is a vault: it holds your data and the only window onto it. But the vault is a twenty-five-year detour, not the tradition — from Codd’s data independence through Solid’s pods to local-first and “apps as views, not vaults”, five decades of people have insisted the data is the ground and the software is the weather. On that lineage, why the first pod-shaped attempt stalled, how xNet ships the inversion — and why AI-cheap views make user-owned data the only stable ground left.",
    pubDate: "2026-07-07T21:00:00Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "philosophy", "decentralization", "protocol"],
    readingMinutes: 14
  },
  {
    slug: "the-workshop-and-the-walled-garden",
    title: "The Workshop and the Walled Garden",
    description: "DotA was a custom map. Counter-Strike was a mod. The battle royale came from a photographer tinkering with a military sim. Modding built half of modern gaming — then the modern app welded its doors shut, with reasons that are half sincere and half convenient. On what the walled garden actually costs, why the fix is scoping authority rather than banning code, and what software looks like when the application is just a view over data you own — especially now that anyone can cook.",
    pubDate: "2026-07-05T23:00:00Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "philosophy", "decentralization"],
    readingMinutes: 14
  },
  {
    slug: "hand-on-the-tiller",
    title: "Hand on the Tiller",
    description: "Everyone is arguing about one alignment problem: will the AI want what we want? But alignment is a stack — physics, planet, society, technology, AI — and we are bolting an aligned machine onto a civilization that steers by the wrong stars. The oldest word for the fix is the root of “cybernetics” and “govern”: the steersman, correcting course a hundred times a minute. What it takes to actually hold a course — and the small, real instruments a piece of software can hand back.",
    pubDate: "2026-07-03T15:00:00Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "philosophy", "decentralization"],
    readingMinutes: 15
  },
  {
    slug: "the-tip-of-the-hook",
    title: "The Tip of the Hook",
    description: "You write useQuery(TaskSchema) and get a live, local, cryptographically-authorised, syncing database — with no API endpoint, no auth middleware, and no cache to invalidate. A developer's tour of xNet's React hooks on the surface, then a dive beneath the waterline to the SQLite database running in a worker, the priority scheduler, and the signed change log that make “just trust the client” safe. The tip is small on purpose; the iceberg is yours to open.",
    pubDate: "2026-06-29T17:30:00Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "protocol", "decentralization"],
    readingMinutes: 14
  },
  {
    slug: "the-loom-you-can-read",
    title: "The Loom You Can Read",
    description: "The Luddites didn't fear machines — they refused looms they weren't allowed to open. Follow one note, “Buy milk,” all the way through xNet's internals: a file on your own disk, a signed change log, a name you mint instead of an account, and a three-line merge that settles conflicts with no server in the middle. A guided tour of a machine you're allowed to open — written for developers and everyone else at once.",
    pubDate: "2026-06-29T01:09:07Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "protocol", "decentralization"],
    readingMinutes: 15
  },
  {
    slug: "the-forest-and-the-field",
    title: "The Forest and the Field",
    description: "Industrial farming strips the soil to exhaustion and trucks fertility back in by the ton. Surveillance capitalism does the same to the web. Permaculture is the discipline for growing land that feeds itself — and its principles are, almost furrow for furrow, how you regenerate a digital commons instead of strip-mining one.",
    pubDate: "2026-06-28T23:39:38Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "philosophy", "nature"],
    readingMinutes: 14
  },
  {
    slug: "the-right-to-say-no",
    title: "The Right to Say No",
    description: "A musician on YouTube argues the economy quietly changed from growth to extraction, and the real prize isn't your money — it's your ability to refuse. He's mostly right. Here's the part software can actually give back.",
    pubDate: "2026-06-28T22:10:50Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "philosophy", "economics"],
    readingMinutes: 13
  },
  {
    slug: "the-desert-that-feeds-the-forest",
    title: "The Desert That Feeds the Forest",
    description: "Every year a dead desert blows across an ocean and feeds the most alive place on Earth — replacing almost exactly what the rainforest loses. What Saharan dust, the bees nobody watches, and the maintainers nobody thanks teach us about the invisible substrate the open web runs on.",
    pubDate: "2026-06-28T21:46:46Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "philosophy", "nature"],
    readingMinutes: 13
  },
  {
    slug: "the-gentlest-furnace",
    title: "The Gentlest Furnace",
    description: "A star carries the energy of a billion bombs and still feels calm from here. What hydrostatic equilibrium — the thermostat that keeps a star from exploding or going cold — teaches us about information, attention, and building technology that burns long instead of burning out.",
    pubDate: "2026-06-28T02:27:04Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "philosophy", "cosmos"],
    readingMinutes: 13
  },
  {
    slug: "data-should-work-like-soil",
    title: "Data Should Work Like Soil",
    description: "Beneath every forest runs a fungal network — the original internet. What mycelium, the human nervous system, and Tesla’s Warp teach us about building one worth living in, and how to heal one that’s gone sick.",
    pubDate: "2026-06-28T01:23:39Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "philosophy", "nature"],
    readingMinutes: 12
  },
  {
    slug: "a-great-pirate-age",
    title: "A Great Pirate Age for the Internet",
    description: "What pirates — the real ones, and the ones in One Piece — can teach us about owning your data. An essay on freedom, self-governance, and why you are the cargo.",
    pubDate: "2026-06-28T00:28:34Z",
    authors: ["crs48", "claude"],
    tags: ["essay", "philosophy", "decentralization"],
    readingMinutes: 11
  }
];
function publishedPosts() {
  return posts.filter((p) => !p.draft).sort((a, b) => b.pubDate.localeCompare(a.pubDate));
}
function seriesOrder() {
  return publishedPosts().reverse();
}
function seriesNeighbors(slug) {
  const order = seriesOrder();
  const i = order.findIndex((p) => p.slug === slug);
  if (i === -1) return {};
  return {
    previous: i > 0 ? order[i - 1] : void 0,
    next: i < order.length - 1 ? order[i + 1] : void 0
  };
}
function postBySlug(slug) {
  return posts.find((p) => p.slug === slug);
}
function postAuthors(post) {
  return post.authors.map((id) => AUTHORS[id]);
}
function formatPostDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  });
}

const SITE_URL = "https://xnet.fyi";
const BLOG_URL = `${SITE_URL}/blog`;
function postUrl(post) {
  return `${BLOG_URL}/${post.slug}`;
}
function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function buildBlogRss(posts) {
  const items = posts.map((post) => {
    const url = postUrl(post);
    const pubDate = new Date(post.pubDate).toUTCString();
    const categories = post.tags.map((t) => `      <category>${escapeXml(t)}</category>`).join("\n");
    const creators = postAuthors(post).map((a) => `      <dc:creator>${escapeXml(a.name)}</dc:creator>`).join("\n");
    return [
      "    <item>",
      `      <title>${escapeXml(post.title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `      <description>${escapeXml(post.description)}</description>`,
      creators,
      `      <pubDate>${pubDate}</pubDate>`,
      categories,
      "    </item>"
    ].filter(Boolean).join("\n");
  }).join("\n");
  const lastBuild = posts.length > 0 ? new Date(posts[0].pubDate).toUTCString() : (/* @__PURE__ */ new Date(0)).toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>xNet Blog</title>
    <link>${BLOG_URL}</link>
    <atom:link href="${BLOG_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Essays on local-first software, data ownership, and the open web.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

export { postUrl as a, buildBlogRss as b, publishedPosts as c, postBySlug as d, formatPostDate as f, postAuthors as p, seriesNeighbors as s };
