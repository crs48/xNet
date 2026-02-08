# Landing Page Redesign for Developer Pre-Release

> **Date**: February 2026
> **Status**: Exploration
> **Goal**: Transform the xNet landing page from a generic project overview into a compelling developer recruitment tool for pre-release contributors

---

## Executive Summary

The current landing page is a solid technical overview, but it reads like documentation — not like an invitation. For a pre-release aimed at recruiting developers to build on and contribute to xNet, we need a page that makes them _feel_ something: the excitement of local-first, the simplicity of the hooks API, the ambition of the vision, and the immediacy of "I could start building with this today."

This exploration catalogs specific improvements across content, structure, visual design, and interactive elements — informed by analysis of eight leading DevTools landing pages (Vite, Turborepo, Linear, Convex, Zero, ElectricSQL, Triplit, DXOS) and all 44 prior xNet explorations.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Target Audience & Core Message](#2-target-audience--core-message)
3. [Content Strategy](#3-content-strategy)
4. [Section-by-Section Redesign](#4-section-by-section-redesign)
5. [Visual Design Improvements](#5-visual-design-improvements)
6. [Technical Implementation](#6-technical-implementation)
7. [Competitive Positioning](#7-competitive-positioning)

---

## 1. Current State Assessment

### What Works

- Dark mode with indigo accents — correct for the audience
- Four-primitive mental model is clear
- React hooks section with tabbed code examples
- SVG diagrams are custom and on-brand

### What Doesn't Work

- **Hero is generic**: "The Decentralized Data Layer" could be any Web3 project. Doesn't grab a React developer.
- **No narrative**: Sections are feature-list, not story. No "here's the problem → here's how we solve it" arc.
- **Missing developer empathy**: Doesn't speak to pain points (server complexity, vendor lock-in, offline-doesn't-work, auth is hard).
- **No social proof or community signal**: No GitHub stars, no contributor count, no Discord. Feels like it could be abandoned.
- **Get Started is an afterthought**: Two commands at the bottom. No "what you'll build" framing.
- **No pre-release framing**: Doesn't acknowledge the stage, invite contribution, or make early involvement feel special.
- **Code examples are static HTML spans**: No proper syntax highlighting, no copy button, can't be easily maintained.
- **Monolithic 703-line file**: Hard to iterate on. No component reuse.
- **No interactivity**: The only JS is Alpine.js tab switching. No animations, no scroll effects, nothing that makes the page feel alive.
- **Vision/roadmap feels distant**: Timeline stretching to 2028+ doesn't excite someone deciding whether to contribute this month.

---

## 2. Target Audience & Core Message

### Primary Audience

React/TypeScript developers who:

- Are frustrated with backend complexity (auth, APIs, hosting, DevOps)
- Are curious about local-first but haven't found a practical way to build with it
- Want to contribute to something meaningful early, before it's mainstream
- Value DX: type safety, fast feedback loops, minimal boilerplate

### Secondary Audience

- Local-first enthusiasts who follow Ink & Switch, Martin Kleppmann, etc.
- Indie hackers tired of paying for infrastructure
- Open-source contributors looking for a meaningful project

### Core Message (one sentence)

**"Build local-first apps with React hooks — no server, no auth, no vendor lock-in — and help shape the future of user-owned software."**

### Tone

- Confident but not arrogant (we're pre-release, not claiming to be production-ready)
- Technical but accessible (show real code, explain why it matters)
- Inviting (this is a community, not a product launch)
- A little bit punk — we're building something that challenges the status quo

---

## 3. Content Strategy

### Narrative Arc

The page should tell a story in this order:

1. **Hook** — Identify the pain: building apps today is absurdly complex
2. **Promise** — Show the alternative: three React hooks, zero backend
3. **Proof** — Real code that works right now
4. **Depth** — What's under the hood (for the curious)
5. **Vision** — Where this is going (for the dreamers)
6. **Call to action** — Join us, this is early, your contribution matters

### What to Add

- **Problem statement**: Lead with developer frustration, not xNet features
- **"Before/After" code comparison**: Show a typical app architecture vs. xNet
- **Pre-release badge/framing**: Be honest about the stage. This builds trust.
- **Community section**: Discord, GitHub stars, contributor highlights, how to get involved
- **"What you can build" gallery**: Concrete examples with screenshots/mockups
- **AI-friendly pitch**: xNet is all TypeScript — great for agentic coding, autocomplete, type inference
- **Comparison with alternatives**: Why xNet over Firebase, Supabase, Convex, etc.

### What to Remove or Reduce

- **Hero SVG diagram**: Too abstract for the first thing people see. Move the "Today's Internet vs xNet" concept later.
- **"Four Primitives, Infinite Scale" as second section**: Too internal/architectural for someone who just landed. Move down.
- **Timeline roadmap to 2028**: Reframe as "what's working now" + "what's next" instead of a 3-year timeline

---

## 4. Section-by-Section Redesign

### 4.1 Hero

**Current**: "The Decentralized Data Layer" + generic subtitle + View on GitHub / Explore

**Proposed**:

```
[Pre-release badge: "Early Access — Help Us Build This"]

# Three hooks. Zero backend.
# Build local-first apps that just work.

Your data lives on the device. Syncs peer-to-peer. Works offline.
No servers to deploy. No auth to configure. No vendor to depend on.
Just React hooks and TypeScript.

[Get Started]  [View on GitHub ★ {count}]  [Join Discord]

$ pnpm add @xnet/react @xnet/data
```

**Why this works**:

- "Three hooks. Zero backend." is concrete and memorable (cf. Turborepo's "Make ship happen")
- Install command right in the hero (Vite, Convex, Triplit all do this)
- GitHub star count as social proof (Vite shows 75k+)
- Pre-release badge is honest and creates urgency/exclusivity

### 4.2 The Problem (NEW SECTION)

A brief, empathetic section that names the pain:

```
## Building apps shouldn't require a PhD in infrastructure

To ship a collaborative note-taking app, you currently need:
- A database (Postgres? Mongo? Firestore?)
- An API layer (REST? GraphQL? tRPC?)
- Authentication (OAuth? Magic links? Passkeys?)
- Real-time sync (WebSockets? Polling? Server-sent events?)
- Hosting (AWS? Vercel? Railway?)
- Offline support (... good luck)

That's six decisions before you write a single line of product code.
With xNet, it's zero.
```

**Why**: Zero and Convex both use this pattern effectively. It validates the developer's frustration and positions the solution.

### 4.3 The Solution — Hooks Showcase (EXPANDED)

This is the centerpiece of the page. Instead of a tabbed interface, show hooks in a scrolling narrative with richer code examples.

**Structure**: Three panels, each showing a complete mini-app:

**Panel 1: "Query anything"**

```tsx
const { data: tasks } = useQuery(TaskSchema, {
  where: { status: 'active' },
  orderBy: { createdAt: 'desc' },
  limit: 20
})
// Fully typed. Reactive. Instant (local-first).
// No loading spinner for local data — it's already there.
```

**Panel 2: "Mutate with confidence"**

```tsx
const { create, update } = useMutate()

await create(TaskSchema, {
  title: 'Ship the landing page',
  status: 'active'
})
// Validated against schema at compile time.
// Syncs to all connected peers automatically.
// Works offline — queued and merged when back online.
```

**Panel 3: "Collaborate in real-time"**

```tsx
const { doc, peerCount, update } = useNode(PageSchema, pageId)

// doc is a Yjs Y.Doc — plug into TipTap, ProseMirror, Monaco
// Character-level conflict resolution via CRDT
// Presence awareness: see who's editing what
// Peer count updates as collaborators join/leave
```

**Panel 4: "No auth server needed"**

```tsx
const { did, isAuthenticated } = useIdentity()

// Cryptographic identity generated client-side in milliseconds
// No signup form. No OAuth dance. No password resets.
// Portable across apps — it's YOUR identity, not the app's
```

**Design**: Each panel gets a left-column explanation with a "what this replaces" comparison (e.g., "Replaces: Supabase + React Query + WebSocket setup") and a right-column code block.

### 4.4 Before/After Architecture (NEW SECTION)

A visual comparison:

**Traditional App Architecture:**

```
React → API Layer → Auth Service → Database → Cache → CDN
                                                  ↓
                                        WebSocket Server
                                                  ↓
                                        Message Queue
```

6 services. 3 vendors. Monthly bills. Deployment complexity.

**xNet Architecture:**

```
React → @xnet/react hooks → Local Store → P2P Sync
```

Two packages. Zero vendors. No monthly cost. Works offline.

### 4.5 What You Can Build (NEW SECTION)

Concrete examples to fire imagination:

- **A collaborative document editor** — Like Notion, but your data never leaves your devices
- **A local-first database app** — Like Airtable, with 15 property types, relations, and real-time sync
- **A personal knowledge garden** — Like Obsidian, with rich text CRDTs and infinite canvas
- **A team workspace** — Like Linear, with schemas, views, and P2P collaboration
- **An AI-augmented tool** — AI agents read/write via MCP, same type-safe API

Each with a small code snippet showing how few lines it takes.

### 4.6 Developer Experience (NEW SECTION)

Lean into the TypeScript DX story:

```
## TypeScript all the way down

- Schemas defined in TypeScript — types inferred, not generated
- Invalid property names caught at compile time
- Autocomplete for query filters, mutations, and relations
- AI agents love it — perfect for Cursor, Copilot, and Claude
- One language across client, data layer, and plugins
```

Show a GIF or screenshot of autocomplete working in VS Code with xNet hooks.

### 4.7 Under the Hood (RESTRUCTURED)

Keep the technical depth but restructure for scanability:

**Four pillars with expandable details:**

| Pillar       | What                         | Why It Matters                               |
| ------------ | ---------------------------- | -------------------------------------------- |
| **Sync**     | Yjs CRDTs + Lamport LWW      | Conflict-free merging without a server       |
| **Crypto**   | Ed25519 + BLAKE3 + XChaCha20 | Every change signed and verified             |
| **Identity** | DID:key + UCAN               | Self-sovereign auth, delegatable permissions |
| **Storage**  | IndexedDB + SQLite           | Data persists locally, content-addressed     |

### 4.8 Plugin System (NEW SECTION)

This is a huge draw for developers. From exploration 0006:

```
## Extend everything

Four layers of extensibility:

1. **Scripts** — Single-file, AI-generatable. Think "Excel formulas for your data."
2. **Extensions** — Multi-file packages with custom views, editors, schemas.
3. **Services** — Background processes for heavy lifting (Electron).
4. **Integrations** — External connections via webhooks, MCP, N8N.

The simplest plugin is literally one file.
An AI can generate one for you in seconds.
```

### 4.9 Pre-Release Community (NEW SECTION — replaces Vision/Roadmap)

This is the most important addition. Frame the pre-release as an opportunity:

```
## This is early. That's the point.

xNet is pre-release software. The APIs will change.
There are rough edges. Some features are stubs.

But the foundation is solid:
- ~350 tests passing across 17 packages
- Electron app running with full sync
- Schema system with 15 property types
- Real-time collaboration via Yjs

We're looking for developers who want to:
- Shape the API before it's set in stone
- Build plugins for an extensible ecosystem
- Contribute to local-first infrastructure
- Be early to something that matters

[Join the Discord]  [Browse Good First Issues]  [Read the Contribution Guide]
```

### 4.10 Get Started (EXPANDED)

Turn "Get Started" into a mini-tutorial:

```
## Start building in 60 seconds

# 1. Install
pnpm add @xnet/react @xnet/data

# 2. Define a schema
const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://your-did/',
  properties: {
    title: text({ required: true }),
    status: select({ options: ['todo', 'doing', 'done'] })
  }
})

# 3. Use it
function Tasks() {
  const { data } = useQuery(TaskSchema)
  const { create } = useMutate()
  // ... that's it. Sync, storage, crypto — all handled.
}

[Full Getting Started Guide →]
```

---

## 5. Visual Design Improvements

### 5.1 Overall Direction

The current dark-mode-with-indigo is solid. Don't change the palette — refine the execution.

**Inspired by**: Linear's polish + Convex's warmth + Zero's narrative clarity

### 5.2 Specific Improvements

**Typography**:

- Increase hero text size: `text-5xl sm:text-6xl lg:text-7xl` (currently maxes at `lg:text-6xl`)
- Add a display font for headlines (Inter Display, Cal Sans, or similar) — monospace for code, display for headlines
- Improve code block typography: use Shiki or similar for proper syntax highlighting instead of manual `<span>` coloring

**Spacing and Rhythm**:

- Increase vertical padding between sections: `py-24 lg:py-32` instead of `py-20`
- Add more breathing room in the hero: `py-32 lg:py-40`
- Use `max-w-3xl` for text-heavy sections to improve readability

**Gradients and Color**:

- Add subtle gradient backgrounds to sections (not just text). Examples:
  - Hero: radial gradient spotlight from indigo to transparent behind the headline
  - Code blocks: subtle inner glow on hover
  - Section transitions: gradient mesh or noise texture overlays
- Consider a faint grid pattern background (like Linear/Vercel) for the hero area

**Cards and Borders**:

- Add subtle gradient borders to feature cards (Triplit does this well):
  ```css
  border-image: linear-gradient(135deg, #4f46e5 0%, transparent 50%) 1;
  ```
- Increase card hover effect: add a faint glow or scale transform
- Consider glassmorphism for some elements (semi-transparent with backdrop blur)

**Motion and Animation**:

- Scroll-triggered fade-in for sections (CSS `@keyframes` + Intersection Observer, no heavy library)
- Subtle floating animation on SVG diagrams
- Typing animation for the install command in the hero
- Smooth tab transitions in the hooks section (currently instant swap)
- Consider a particle or node-graph animation in the hero background (can be CSS-only with floating dots and lines — evokes the "network" concept without being Web3 cliche)

**Code Blocks**:

- Use a proper syntax highlighter (Astro has built-in Shiki support via `astro:content`)
- Add copy-to-clipboard button on all code blocks
- Add filename tabs above code blocks (e.g., `schema.ts`, `TaskList.tsx`)
- Consider side-by-side "before/after" code comparisons

### 5.3 Component Architecture

Break the 703-line monolith into components:

```
src/
  components/
    Nav.astro
    Hero.astro
    ProblemStatement.astro
    HooksShowcase.astro
    BeforeAfter.astro
    WhatYouCanBuild.astro
    DeveloperExperience.astro
    UnderTheHood.astro
    PluginSystem.astro
    PreReleaseCommunity.astro
    GetStarted.astro
    Footer.astro
    ui/
      CodeBlock.astro        # Shiki-highlighted with copy button
      SectionHeader.astro    # Consistent h2 + subtitle pattern
      FeatureCard.astro      # Reusable card component
      Badge.astro            # Pre-release, platform badges
      GradientText.astro     # Gradient text utility
```

---

## 6. Technical Implementation

### 6.1 Keep It Simple

Astro + Tailwind is the right choice. Don't add React to the site — it's a static page.

**Do add**:

- Shiki for syntax highlighting (built into Astro)
- A small amount of vanilla JS for scroll animations (Intersection Observer)
- CSS `@keyframes` for entrance animations
- Dynamic GitHub star count via GitHub API (fetched at build time with Astro)

**Don't add**:

- React/Solid/Svelte islands — overkill for this
- Heavy animation libraries (GSAP, Framer Motion)
- Analytics or tracking (respect the privacy-first brand)
- A CMS or content collections — content changes rarely, inline is fine

### 6.2 Performance Budget

The page should:

- Score 100 on Lighthouse (it's a static site, this is easy)
- Load in under 1 second on 3G
- Ship zero client-side JS beyond the minimal scroll animation observer (~1KB)
- Use system fonts + one code font (loaded via `font-display: swap`)

### 6.3 Build-Time Data

Use Astro's `fetch` in frontmatter to pull:

- GitHub star count
- Open issue count (for "Good First Issues" link)
- Contributor count

These update on each deploy, not on each page load.

---

## 7. Competitive Positioning & Landscape

### Philosophy: Celebrate the Space

xNet is a free OSS project. We're not competing — we're part of a movement. The landing page should **link to and celebrate** other local-first and decentralized projects. This does several things:

1. **Builds trust** — we're not insecure about alternatives, we actively recommend exploring them
2. **Educates developers** — many visitors are new to local-first and benefit from seeing the full landscape
3. **Grows the ecosystem** — the more developers in local-first, the better for everyone
4. **Positions xNet honestly** — developers can see where xNet fits and make informed choices

### Two Comparison Tables

The landing page should include two interactive comparison tables (inspired by Triplit's comparison table, but broader and more generous to competitors):

#### Table 1: Local-First Data Infrastructure

Compares the developer-facing tools and frameworks — what you'd use to build an app:

| Feature           | xNet                           | Zero            | Triplit         | ElectricSQL     | Jazz            | LiveStore      | DXOS           | Convex         |
| ----------------- | ------------------------------ | --------------- | --------------- | --------------- | --------------- | -------------- | -------------- | -------------- |
| Local-first       | Yes                            | Yes             | Yes             | Yes             | Yes             | Yes            | Yes            | Cloud-first    |
| Offline support   | Full                           | Full            | Full            | Full            | Full            | Full           | Full           | Partial        |
| Real-time sync    | P2P (WebRTC)                   | Server          | Server          | Server          | P2P             | Client         | P2P            | Server         |
| CRDT support      | Yjs + LWW                      | Server rebase   | LWW             | Server rebase   | Automerge       | Event-sourced  | Automerge      | Server         |
| Rich text editing | Yjs + TipTap                   | No              | No              | No              | Automerge       | No             | Automerge      | No             |
| Schema system     | TypeScript defineSchema()      | Postgres        | TypeScript      | Postgres        | CoValues        | SQLite         | TypeScript     | TypeScript     |
| React hooks       | useQuery/useMutate/useNode     | useQuery        | useQuery        | useShape        | useCoState      | useStore       | useQuery       | useQuery       |
| Type safety       | Full inference                 | Via Postgres    | Full inference  | Via Postgres    | Full inference  | Full inference | Full inference | Full inference |
| Self-hosted       | Yes (no server needed)         | Server required | Server required | Server required | Server optional | Client-only    | P2P optional   | Cloud only     |
| Open source       | MIT                            | Apache 2.0      | AGPL            | Apache 2.0      | MIT             | MIT            | MIT            | Proprietary\*  |
| Identity          | DID:key + UCAN                 | External        | External        | External        | Built-in        | External       | Built-in       | External       |
| Plugin system     | 4-layer (Scripts→Integrations) | No              | No              | No              | No              | No             | Yes            | No             |
| Cross-platform    | Electron + Web + Expo          | Web             | Web + Mobile    | Web             | Web + Mobile    | Web            | Web + Electron | Web            |

\*Convex runtime is proprietary, client SDKs are open source

Each project name links to its website/GitHub. Brief description below the table explains what each project is best at.

#### Table 2: Decentralized Protocols & P2P Infrastructure

Compares the protocol/infrastructure layer — the broader ecosystem of user-owned data:

| Project        | Scope           | Data Model                | Sync              | Identity       | Language        | Status                 | Best For                    |
| -------------- | --------------- | ------------------------- | ----------------- | -------------- | --------------- | ---------------------- | --------------------------- |
| xNet           | App framework   | Schema-typed nodes + Yjs  | P2P (WebRTC)      | DID:key + UCAN | TypeScript      | Pre-release            | Full-stack local-first apps |
| AT Protocol    | Social protocol | Signed repos (Lexicons)   | Federated relay   | DID:plc        | TypeScript      | Production (30M users) | Social networking           |
| Nostr          | Event protocol  | Signed JSON events        | Relay (WebSocket) | secp256k1 keys | Any             | Production             | Social + payments           |
| Hypercore/Pear | P2P runtime     | Append-only logs          | P2P (DHT)         | Public keys    | JavaScript      | Production             | P2P apps + streaming        |
| Iroh           | Networking      | Content-addressed blobs   | P2P (QUIC)        | Public keys    | Rust            | Production             | P2P networking layer        |
| p2panda        | P2P toolkit     | DAG of CBOR operations    | P2P (QUIC/iroh)   | Public keys    | Rust            | Active (v0.5)          | Encrypted group apps        |
| Willow         | Sync protocol   | 3D namespace model        | Protocol-agnostic | Capabilities   | Spec + JS/Rust  | Active                 | Fine-grained sync           |
| Holochain      | Agent framework | Agent source chains + DHT | DHT gossip        | Agent keys     | Rust (WASM)     | Beta (7+ years)        | Agent-centric apps          |
| Anytype        | App + protocol  | Typed objects + DAGs      | P2P (custom)      | Keys           | Go + TypeScript | Production (1M+ users) | Personal knowledge          |
| Solid          | Data pods       | RDF/Linked Data           | Server (REST)     | WebID          | Any             | Active                 | Academic/government         |

Each project name links to its website/GitHub.

### Framing for the Tables

The section header should be something like:

```
## The local-first landscape

We're building xNet because we believe in a future where users own their data.
We're not alone — here are the projects pushing this vision forward.
We encourage you to explore them all and pick what's right for your use case.
```

Below the tables, add a short "Where xNet fits" summary:

```
xNet's unique position: the only project combining TypeScript-inferred schemas,
dual CRDT strategy (Yjs for text + Lamport LWW for structured data), React hooks API,
a four-layer plugin system, and true P2P sync — all in one framework.

If you're building a React app and want local-first with minimal boilerplate, start here.
If you need a social protocol, look at AT Protocol or Nostr.
If you need low-level P2P networking, look at Iroh or Hypercore.
If you want a production knowledge base today, look at Anytype.
```

This is radically generous positioning — and that's the point. Developers respect projects that aren't afraid to link to alternatives. It builds trust and signals that xNet competes on merit.

### Key Differentiators to Emphasize

1. **Three hooks, zero backend** — the simplest pitch
2. **TypeScript all the way down** — DX that rivals Prisma/Drizzle
3. **Plugin ecosystem** — VS Code-like extensibility for a data platform
4. **AI-native** — MCP integration, TypeScript types perfect for code generation
5. **Pre-release community** — shape the future, not just use a product

---

## Summary of Changes

| Area         | Current                  | Proposed                                                           |
| ------------ | ------------------------ | ------------------------------------------------------------------ |
| Hero         | Generic tagline          | Concrete value prop + install command + social proof               |
| Narrative    | Feature list             | Problem → Solution → Proof → Vision → Join                         |
| Sections     | 7 sections               | 10 sections with new Problem, Before/After, Build, DX, Community   |
| Code         | Manual span highlighting | Shiki + copy buttons + file tabs                                   |
| Visual       | Static cards             | Scroll animations, gradient accents, grid background, glow effects |
| Architecture | 703-line monolith        | ~15 focused components                                             |
| Community    | None                     | Discord, GitHub stats, contribution CTAs, pre-release framing      |
| Hooks        | Tabbed 4-hook display    | Scrolling narrative with richer examples and "what this replaces"  |
| Vision       | 3-year timeline          | "What works now" + "What's next" + "Join us"                       |
| Tone         | Documentation            | Invitation with personality                                        |

---

## Open Questions

1. **Interactive code playground?** Convex's playground is the most compelling element across all 8 competitor sites. Could we embed a live REPL showing xNet hooks? This would be a significant engineering effort but extremely differentiated. Probably not worth it for v1 of the redesign.

2. **Video/demo?** Zero leads with a video demo of their 1.2M-row app. Could we record a quick demo of the Electron app? Low effort, high impact for credibility.

3. **Blog integration?** ElectricSQL and Linear embed blog posts on the landing page. We could link to key explorations as "deep dives" — they're essentially blog posts already.

4. **Testimonials?** We don't have developer testimonials yet (pre-release). Could replace with quotes from Ink & Switch's local-first essay or Martin Kleppmann — ideas we're building on.

5. **Separate docs site?** Currently the landing page links to the GitHub README. Eventually we'll want a proper docs site (VitePress or Starlight). Not for this iteration, but worth noting.
