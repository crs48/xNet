# Naming Exploration: xNet → DataGarden

> Should the user-facing app embrace organic metaphors while the infrastructure stays technical?

## The Tension

**xNet** is technically accurate but cold:

- "x" = unknown/variable, "Net" = network
- Evokes protocols, TCP/IP, infrastructure
- Sounds like a developer tool, not a life companion
- Cohesive: one name for everything (protocol, app, brand)

**DataGarden** is warm and evocative:

- Gardens grow, adapt, are tended over time
- Local-first = your garden, your plot, your sovereignty
- P2P sync = gardens that cross-pollinate
- Feels alive, not mechanical
- But: is it too soft for the infrastructure layer?

```
┌─────────────────────────────────────────────────────────┐
│                    THE NAMING SPECTRUM                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  TECHNICAL ◄─────────────────────────────► ORGANIC      │
│                                                          │
│  xNet        Dataverse      DataGarden      Garden      │
│  Protocol    Platform       Application     Experience  │
│  Infra       Hybrid         User-facing     Pure UX     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## The Gardening Metaphor

Why it resonates with local-first principles:

| Concept              | Gardening                             | xNet/DataGarden                                |
| -------------------- | ------------------------------------- | ---------------------------------------------- |
| **Ownership**        | Your plot, your seeds, your harvest   | Your device, your data, your sovereignty       |
| **Cultivation**      | Tend daily, prune, nurture            | Edit, organize, refine your knowledge          |
| **Growth**           | Seeds become plants become ecosystems | Notes become docs become interconnected graphs |
| **Seasons**          | Natural rhythms, rest periods         | Work cycles, archive old projects              |
| **Propagation**      | Share cuttings, cross-pollinate       | Sync, collaborate, fork                        |
| **Resilience**       | Perennials survive winters            | Offline-first survives network loss            |
| **Biodiversity**     | Many species, healthier garden        | Many schemas, richer data model                |
| **Composting**       | Decay feeds new growth                | Old data enriches new insights                 |
| **Heirloom seeds**   | Preserve genetic diversity            | Preserve data formats, no lock-in              |
| **Local adaptation** | Plants adapt to your climate          | Data adapts to your workflow                   |

### Permaculture Principles Applied

Permaculture is design philosophy for sustainable, self-sufficient systems. It maps surprisingly well:

| Permaculture Principle               | DataGarden Application                                  |
| ------------------------------------ | ------------------------------------------------------- |
| **Observe and interact**             | Understand your data flows before automating            |
| **Catch and store energy**           | Capture thoughts quickly (quick-capture), process later |
| **Obtain a yield**                   | Data should produce insights, not just storage          |
| **Apply self-regulation**            | Local-first reduces external dependencies               |
| **Use renewable resources**          | Open formats, no vendor lock-in                         |
| **Produce no waste**                 | Everything is queryable, nothing is orphaned            |
| **Design from patterns to details**  | Schema-first, instances later                           |
| **Integrate rather than segregate**  | One app for docs, tasks, data, chat                     |
| **Use small and slow solutions**     | Start local, sync incrementally                         |
| **Use and value diversity**          | Multiple schemas, multiple views                        |
| **Use edges and value the marginal** | Cross-link between contexts                             |
| **Creatively respond to change**     | CRDTs handle conflicts gracefully                       |

---

## Naming Options

### Option A: Full Rebrand to DataGarden

Everything becomes garden-themed:

```
┌──────────────────────────────────────────┐
│            DataGarden                     │
│  "Cultivate your knowledge"               │
├──────────────────────────────────────────┤
│  App name:      DataGarden               │
│  Protocol:      Garden Protocol? Grove?  │
│  Sync:          Pollination / Grafting   │
│  Hub server:    Greenhouse               │
│  Workspaces:    Plots / Beds             │
│  Documents:     Plants / Specimens       │
│  Schemas:       Species / Varieties      │
│  Queries:       Foraging / Harvesting    │
│  Communities:   Allotments / Commons     │
└──────────────────────────────────────────┘
```

**Pros:**

- Distinctive, memorable, ownable
- Emotional resonance with sustainability-minded users
- Natural extension to concepts (grow, nurture, harvest, share)
- Could attract a different (broader?) audience

**Cons:**

- Loses technical credibility? (enterprise buyers may balk)
- Forced metaphors get cringe fast ("Let's pollinate this document!")
- Hard to maintain consistency as features grow
- May alienate developer audience
- Name change is expensive (domain, branding, docs, code)

### Option B: Hybrid — Garden App on xNet Protocol

Keep infrastructure technical, make the app warm:

```
┌──────────────────────────────────────────┐
│  User-facing:     DataGarden             │
│  Infrastructure:  xNet                    │
├──────────────────────────────────────────┤
│  "DataGarden — powered by xNet"          │
│                                           │
│  The app:        DataGarden              │
│  The protocol:   xNet Protocol           │
│  The hub:        xNet Hub                │
│  The packages:   @xnet/*                 │
│  Developer docs: xNet                    │
│  User docs:      DataGarden              │
└──────────────────────────────────────────┘
```

**Analogy:**

- Chrome (friendly name) runs on Chromium (technical name)
- VS Code (brand) is built on Electron (infra)
- Figma (product) uses CRDTs (implementation detail)

**Pros:**

- Best of both worlds: warm user experience, credible infrastructure
- Developers see @xnet/\*, users see DataGarden
- Can introduce gradually (app rename first, assess response)
- Keeps one codebase, two audiences

**Cons:**

- Two names to maintain (cognitive overhead)
- "powered by xNet" feels like compromise/hedge
- Marketing gets complicated ("Wait, is it xNet or DataGarden?")
- Community confusion during transition

### Option C: Soft Gardening Theme, Keep xNet Name

Keep xNet everywhere but incorporate garden metaphors in UX copy:

```
┌──────────────────────────────────────────┐
│              xNet                         │
│  "Your digital garden"                    │
├──────────────────────────────────────────┤
│  Name:          xNet (unchanged)         │
│  Tagline:       "Cultivate your data"    │
│  Onboarding:    "Plant your first page"  │
│  Empty states:  "Nothing growing yet"    │
│  Sync:          "Cross-pollinating..."   │
│  Hub:           "Greenhouse" (nickname)  │
└──────────────────────────────────────────┘
```

**Pros:**

- Zero rename cost
- Gardening as flavor, not constraint
- Can dial up or down based on context
- Technical name still works for enterprise

**Cons:**

- Half-measures may feel inconsistent
- "xNet: Your digital garden" is a bit dissonant
- Doesn't capture the full emotional potential

### Option D: Different Name Entirely

Maybe neither xNet nor DataGarden is right. Other directions:

| Name         | Vibe                       | Notes                                          |
| ------------ | -------------------------- | ---------------------------------------------- |
| **Grove**    | Organic, collective        | A grove is interconnected trees (nodes). Open. |
| **Canopy**   | Shelter, coverage          | Your data canopy covers you. Premium feel.     |
| **Mycelium** | Network, hidden connection | Underground fungal networks = P2P. Nerdy.      |
| **Loom**     | Weaving, crafting          | Threads of data woven together.                |
| **Hearth**   | Home, warmth               | Data as the heart of your digital home.        |
| **Orbit**    | Personal, revolving        | Your data orbits you, not a server.            |
| **Vessel**   | Container, journey         | Carry your data with you.                      |
| **Taproot**  | Foundation, deep           | Your data's foundation.                        |

---

## The "One Name" Simplicity Problem

You mentioned not wanting to lose the simplicity of one name for everything. Let's examine that:

### Why One Name Works

- **Coherence:** Users, developers, docs all use the same term
- **SEO/discoverability:** One term to search, one community
- **Brand equity:** All investment compounds in one name
- **Less confusion:** "Is this the xNet app or the xNet protocol?" — it's all xNet

### When Two Names Work

- **Audience split:** Developers and end-users have different needs
- **Layer separation:** Users don't need to know about infrastructure
- **Acquisition flexibility:** Can sell the app brand, keep the protocol open
- **Risk isolation:** If the app fails, the protocol brand survives (or vice versa)

### The Apple Model

Apple uses one name (iCloud) for both the user product and the developer platform. But they also have:

- Swift (language) vs. iOS (platform) vs. App Store (marketplace)
- Different names for different layers when it serves clarity

### The Notion Model

Notion is just Notion — no separate protocol name, no infrastructure brand. This works because they're not trying to be a platform for other apps.

### The Matrix Model

Matrix is the protocol. Element is the app. This causes confusion ("Should I download Matrix or Element?") but allows multiple apps on one protocol.

**For xNet/DataGarden:** If the vision is "one app to rule them all" (not a platform for third-party apps), a single name makes sense. If the vision is "an open protocol with xNet as the reference implementation," two names may be clearer.

---

## Community & Ecosystem Implications

### If it stays "xNet"

- Technical community comfortable (open source, P2P, protocol-minded)
- Enterprise legitimacy (sounds like infrastructure)
- Risk: perceived as "another dev tool" not a consumer product

### If it becomes "DataGarden"

- Broader appeal (knowledge workers, creatives, sustainability-minded)
- Differentiates from Notion/Obsidian/etc.
- Risk: developers may not take it seriously as a platform
- Risk: "garden" is overused (digital garden, Roam garden, etc.)

### The "Digital Garden" Phrase

"Digital garden" is already a concept in the PKM space (personal knowledge management):

- [Maggie Appleton's digital garden](https://maggieappleton.com/garden)
- [Roam's garden metaphor](https://nesslabs.com/roam-research-beginner-guide)
- Tom Critchlow, Andy Matuschak, etc.

**Is this good or bad?**

- Good: Built-in understanding, community exists
- Bad: Not differentiated, may feel derivative

"**DataGarden**" (one word, capital G) is slightly different — emphasizes "data" as the thing being cultivated, not just notes/ideas. The scope is broader (databases, tasks, ERP, not just PKM).

---

## What Would Change in the Codebase

If we went with **Option B (Hybrid)**:

| Current         | Change To                  | Notes                   |
| --------------- | -------------------------- | ----------------------- |
| `apps/web`      | App title: "DataGarden"    | Package name stays same |
| `apps/electron` | App name: "DataGarden"     | DMG/installer name      |
| `apps/expo`     | App name: "DataGarden"     | App Store listing       |
| `packages/*`    | Stay `@xnet/*`             | NPM scope unchanged     |
| Docs (user)     | "DataGarden Docs"          | New domain?             |
| Docs (dev)      | "xNet Developer Docs"      | Stays technical         |
| Marketing site  | datagarden.app?            | New domain              |
| GitHub org      | Stay `xnet` or `anomalyco` | Code home unchanged     |

The code itself wouldn't change much — just app titles, splash screens, marketing copy.

---

## Emotional Resonance Test

Imagine these scenarios:

**Scenario 1: Explaining to a non-technical friend**

> "I'm building xNet — it's a decentralized data platform with CRDTs and DIDs..."
>
> vs.
>
> "I'm building DataGarden — it's like a personal space where you cultivate your documents, notes, databases... and it all stays on your devices, syncing peer-to-peer."

**Scenario 2: Enterprise sales pitch**

> "xNet provides a robust, cryptographically-signed data infrastructure with UCAN authorization..."
>
> vs.
>
> "DataGarden? Is that like... a note-taking app?"

**Scenario 3: Developer adoption**

> "I'm building on the xNet protocol, using their Node and Change primitives..."
>
> vs.
>
> "I'm building on... the Garden Protocol? The Greenhouse SDK?"

**Scenario 4: Community building**

> "Welcome to the xNet community!" (sounds like a networking meetup)
>
> vs.
>
> "Welcome to the DataGarden community!" (sounds like a cozy collective)

---

## My Take (If You Want It)

The gardening metaphor is genuinely powerful and aligns with the values of local-first, user-sovereign data. The risk is overcommitting to a metaphor that limits future expression or alienates technical users.

**A possible middle path:**

1. **Keep "xNet" as the protocol/infrastructure brand** — packages, developer docs, GitHub
2. **Introduce "DataGarden" as the app brand** — what users download, the icon on their dock
3. **Use garden metaphors in UX copy** — but don't force them everywhere
4. **Test the name with real users** — before a hard commitment

The transition could be gradual:

- Phase 1: Rename the app to "DataGarden" in the next release
- Phase 2: See how users respond, gather feedback
- Phase 3: Decide whether to go deeper (grove, greenhouse, pollination) or pull back

This preserves the simplicity of one codebase, one GitHub, one npm scope — while letting the user-facing brand evolve.

---

## Questions to Sit With

1. **Who is the primary audience?** Developers building on xNet, or end-users cultivating their data?

2. **Is this a platform or a product?** If platform (others build apps on it), keep xNet. If product (you are the app), DataGarden works.

3. **How serious is the sustainability/permaculture angle?** If it's core to the mission, lean in. If it's aesthetic, keep it light.

4. **What does the 10-year vision look like?** Does "DataGarden" still fit if you're running ERP systems for enterprises?

5. **What would you regret more?** Sticking with a cold technical name, or committing to a metaphor that might not scale?

---

## Summary

| Option          | App Name   | Infra Name | Effort | Risk                                     |
| --------------- | ---------- | ---------- | ------ | ---------------------------------------- |
| A: Full rebrand | DataGarden | DataGarden | High   | Metaphor fatigue, developer alienation   |
| B: Hybrid       | DataGarden | xNet       | Medium | Two-name confusion, marketing complexity |
| C: Soft theme   | xNet       | xNet       | Low    | Half-measure, dissonance                 |
| D: New name     | ???        | xNet       | High   | Starting from zero                       |

**Recommendation:** Start with **Option B** as an experiment. Rename the app to "DataGarden" in the UI/branding, keep all code and packages as xNet. See how it feels after a few months. The gardening metaphor is worth exploring without betting the whole codebase on it.

---

## Appendix: Name Availability (Quick Check)

| Name          | .com           | .app       | .io        | Notes                            |
| ------------- | -------------- | ---------- | ---------- | -------------------------------- |
| datagarden    | Taken (parked) | Available? | Taken      | Would need to buy or use variant |
| data-garden   | —              | Available? | —          | Hyphenated domains are weak      |
| mydatagarden  | Available?     | Available? | Available? | Longer but ownable               |
| grove         | Taken (many)   | Taken      | Taken      | Too common                       |
| canopy        | Taken          | Taken      | Taken      | Too common                       |
| getdatagarden | Available      | Available  | Available  | "get" prefix pattern             |

_(Actual availability should be verified before any commitment.)_
