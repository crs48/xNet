---
title: A workspace of your own — marketing redesign
status: draft
last_updated: 2026-10-10
review: 2026-10-24
decider: Chris Smothers
door: two-way
tags: [site, brand, product, vision]
---

# A workspace of your own

> [!TIP]
> Lead with the workspace people can use, then explain the larger world it could grow into. Use the new mesh mark as a visual anchor, and the essays as the source of the argument.

> [!IMPORTANT]
> This is a local design preview. Chris requested a review before publication. Do not push a preview deployment, merge, or publish this redesign until that review happens. The previous approval to publish the brand assets does not apply to this work.

## Problem

The homepage sells an easy coding-agent integration as the main product. The owner’s current assessment is that this is ahead of the shipping experience. The repository supports a narrower claim: agent interfaces exist, while integrated daily work, clear in-product review, and consumer-friendly setup remain goals in `docs/ROADMAP.md`.

The site also has several competing visual treatments: gradient SaaS landing pages, illustrated long-form essays, developer documentation, a dense pricing grid, and a newly refined wordmark. The essays contain a richer account of why the project exists than the homepage does.

Chris selected **people who want a workspace they own** as the primary audience. Developers remain an important second route.

## Recommendation after the first review

Chris found the first preview less scannable than the old website. The warm paper background, repeated serif headlines, large spacing, and abstract copy made it feel monotonous and harder to read. The revised direction keeps the copy corrections and returns to the old site’s section components, feature cards, code panels, and direct headings.

Use neutral white and zinc surfaces, black text, and distinct indigo, emerald, amber, and violet accents. The hero shows the app rather than a decorative mesh drawing. Its headline is “A workspace you own.” The core tools fit into a six-card grid. The builder section pairs nodes, schemas, and views with a short schema example. Three illustrated blog links explain the broader vision, followed by a compact current-release / in-progress / longer-term roadmap.

The white foundation also leaves room for the app redesign Chris is considering. This preview changes the website; it does not make that future app design decision.

The supporting pages follow the same hierarchy. The blog index has small thumbnails and searchable rows; the vision and roadmap pages use compact grids. Practical nouns replace abstract headlines: “Download xNet,” “Plugins and extensions,” “AI and agent tools.” The longer arguments remain in the essays.

The October 24 review date is a design checkpoint, not a release commitment. This revision still needs Chris’s review before publication.

## What the repository actually supports

| Claim                                   | Evidence                                                                | Treatment                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Documents, databases, and canvases      | `apps/electron/src/renderer/App.tsx`, workspace components; `README.md` | Available in alpha                                                                          |
| Personal library                        | `apps/electron/src/library/`, renderer library views                    | Explicitly desktop                                                                          |
| Browser demo                            | `README.md`, `apps/web/`                                                | Passkey; limited temporary hosted backups; export important work                            |
| Local data and workspace export         | `README.md`, storage/export implementation, `docs/CHARTER.md`           | Concrete ownership mechanisms                                                               |
| Agent connection tools                  | `packages/cli/src/commands/connect.ts`, `site/src/data/agents.ts`       | Developer setup; write permission explicit                                                  |
| Easy integrated AI daily driver         | `docs/ROADMAP.md`, owner correction                                     | Being built; never presented as the default experience                                      |
| Own hub and managed hosting foundations | `packages/hub/`, `apps/cloud/`, `site/src/data/pricing.ts`              | Explain choices and operator trust; preserve prices and limits                              |
| Full mobile workspace                   | `apps/expo/`, `site/src/pages/mobile.astro`                             | Developer demo; setup depends on whether a hosted build is configured                       |
| Broad discovery commons                 | `docs/ROADMAP.md`, `docs/VISION.md`                                     | Longer-term direction; distinguish publishing foundations from a finished community network |

The existing app screenshot is retained as an actual workspace illustration and labelled **example content**. Its sample document is not evidence of customer counts or completed features.

## The essays as the organising idea

The survey covered the headings, opening and closing arguments of all 25 published essays, plus the charter, roadmap, vision, and relevant code. Metaphors inform the design; their scientific or historical details do not become new product claims.

| Thread                        | Essays                                                                                                         | Where it enters the redesign                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Keep the thing you made       | The Hundred-Year Machine; Weights You Can Hold; The Door Inside the House; The Right to Say No                 | Ownership lead, downloads, backups, exit, hosting choices                      |
| Data is common ground         | Data Should Work Like Soil; The Forest and the Field; The Desert That Feeds the Forest; The Vault and the View | Vision cards: data persists while tools change; links to the essays            |
| An open workshop              | The Workshop and the Walled Garden; Clutch Power; The Tip of the Hook; The Loom You Can Read                   | Developer route, open schemas, extension foundations, inspectable machinery    |
| Keep a legible history        | Tree Rings; Palimpsest; People in Disguise                                                                     | Provenance and agency, without promising a finished history-review UI          |
| Choose and correct the course | Hand on the Tiller; The Gentlest Furnace; Atoms for the Ballot                                                 | Permission, feedback, limits, a direction that stays open to revision          |
| A community can keep going    | A Great Pirate Age; The World’s Greatest Record Store; The Table and the Wall                                  | The commons horizon, voluntary connection, communities outlasting servers      |
| Respect a person’s life       | Timeout; The Matchmaker and the Meter; Rig the Game or Play; The Harvest You Can Count                         | Calm presentation, no urgency tricks or invented growth metrics; charter links |

The dedicated vision page walks through permanence, interdependence, creative agency, consent, the commons, and room to go quiet. Each compact card links to the essay behind it. The home page includes three selected essays. The journal preserves every published post and its metadata, adding topic and text filtering across all 25 essays, including the latest entry.

## Information architecture

```mermaid
flowchart TD
    Home["Home: a workspace of your own"] --> Workspace["The workspace: what you can use"]
    Home --> Vision["The vision: why it matters"]
    Home --> Journal["Field notes: the full argument"]
    Home --> Builders["For builders: open foundations"]
    Workspace --> Download["Desktop / browser / mobile demo"]
    Vision --> Charter["Commitments and evidence"]
    Vision --> Roadmap["Now / current focus / next / horizon"]
    Builders --> Tools["React / DevTools / demos / plugins"]
    Roadmap --> Agents["AI: current tools and unfinished experience"]
    Roadmap --> Hosting["Cloud, self-hosting, prices, status"]
```

The header links to App, Developers, Vision, Blog, Agents, and Docs, with one product action. Mobile uses a native disclosure menu, retaining access to the destinations rather than hiding the navigation. The footer keeps the detailed paths available without making the first screen a directory.

## Scope and implementation map

| Surface                                                                                                                   | Change                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                                                       | Original section framework with corrected copy; app screenshot; six feature cards; substrate and code; blog vision; maturity |
| `/workspace`                                                                                                              | New product tour, concrete features, alpha and platform questions                                                            |
| `/why`                                                                                                                    | New illustrated vision, connected directly to six essay themes                                                               |
| `/privacy-by-design`                                                                                                      | Preserves the former detailed privacy argument at a discoverable route                                                       |
| `/roadmap`                                                                                                                | New reader-oriented sequence, with present capability separated from goals                                                   |
| `/blog`                                                                                                                   | Compact searchable article rows with thumbnails, dates, authors, and topic filters                                           |
| `/agents`                                                                                                                 | New honest introduction and setup framing; retains working setup tabs, permission details, and receipts                      |
| `/download`                                                                                                               | Rebuilt platform chooser; preserves release asset discovery and describes unresolved lookup honestly                         |
| `/cloud`                                                                                                                  | Rewritten hosting story and operator choice; marks easier onboarding as a goal                                               |
| `/build-with`, `/devtool`                                                                                                 | Direct introductions; existing technical examples and controls retained                                                      |
| `/react`, `/mobile`, `/plugins`, `/cloud/pricing`, `/open`, `/compare`, `/commitments`, `/status`, `/changelog`, `/demos` | Shared visual overhaul and targeted copy/hierarchy corrections; underlying data, pricing, filters, and useful depth retained |
| Individual essays and legal pages                                                                                         | New shared navigation, footer, and palette; article arguments, artwork, citations, and legal text preserved                  |
| Documentation and application UI                                                                                          | Outside this redesign; existing destinations remain linked                                                                   |

Implementation lives in the real Astro pages and `site/src/components/marketing/`. This is a runnable visual companion rather than a Storybook sketch: Astro’s real routing, responsive layout, theme behavior, and data-driven controls are what the reviewer needs to see. The markdown remains the record of decisions.

## Options considered

| Option                                              | Strength                                 | Cost                                      | Decision                      |
| --------------------------------------------------- | ---------------------------------------- | ----------------------------------------- | ----------------------------- |
| Refine the current agent-first page                 | Small diff                               | Retains the central mismatch              | Rejected for this pass        |
| Lead with the entire decentralised-network vision   | Strong philosophy                        | Hard to tell what a visitor can use today | Vision becomes the second act |
| Lead with an owned workspace, then open the horizon | Useful entry point and room for ambition | Requires a genuine narrative rewrite      | Recommended                   |

## External reference points

[Ink & Switch’s local-first essay](https://www.inkandswitch.com/essay/local-first/) grounds ownership in practical properties: local copies, offline work, collaboration, and long-term access. This supports explaining mechanisms before making a broad claim about freedom.

[Linear’s current site](https://linear.app/) is a useful reference for deliberate hierarchy and a legible product route. The first preview’s editorial treatment was rejected in review. The revised design returns to xNet’s existing product-oriented section framework.

The primary voice and visual material come from xNet’s own essays and illustrations, rather than a third-party template.

## Review questions and tradeoffs

- Is the revised density close to the old site’s useful level of detail?
- The homepage keeps the ownership message, the builder explanation, and the blog-derived vision. Longer passages live on their dedicated pages.
- White and zinc are the neutral base; accents distinguish tools and statuses. The brand assets stay unchanged.
- The public pricing catalog is retained. Operational readiness should be rechecked before publication; this preview does not certify hosted signup.
- The charter page summarises six commitments while the source charter has a seventh Floor section. The redesign does not invent its enforcement status.

## Implementation checklist

- [x] Ground the claim map in source, roadmap, and owner correction.
- [x] Implement the shared shell and responsive visual system.
- [x] Build the homepage, workspace, vision, roadmap, and journal.
- [x] Rework supporting marketing routes while retaining working data and controls.
- [x] Preserve essay and legal prose, and make the previous privacy argument reachable.
- [x] Provide a local browser preview for Chris.
- [ ] Receive Chris’s approval of the revised preview before any publication.

## Validation checklist

- [x] Site production build and existing content/output validators pass.
- [x] Check desktop, tablet, and narrow phone layouts in light and dark themes.
- [x] Check menu, theme toggle, journal search/topics, developer tabs, and links.
- [x] Check internal route references and heading structure.
- [x] Verify nothing was pushed, merged, or deployed for this redesign.

## First-preview verification notes

The local review runs at `http://127.0.0.1:4330/` from a production Astro build with
`PUBLIC_DESIGN_PREVIEW=true`. That environment flag adds a review strip; it does
not change the production deployment configuration. The branch is
`codex/marketing-redesign-preview` in the managed `marketing-redesign-preview` worktree.

- The first browser sweep covered 20 routes at 1440, 768, 375, and 320 pixels. It found an agent-tab overflow at 320 pixels; the tab row now wraps, and the 320-pixel recheck passes.
- Journal title search, empty results, topic filters, and reset all worked. The reset restores all 25 essays.
- The mobile navigation opens and routes to the builder page. Developer language and agent-client tabs switch correctly; language selection and the theme persist after reload.
- An exact source comparison confirms the 25 essay bodies and six legal pages preserve their prose. Their only direct edit is the skip-link target on `main`.
- The local status page cannot fetch the Cloud status endpoint because that endpoint does not allow the localhost origin. Its existing dated snapshot fallback remains visible. This preview does not verify hosted service health, signup, or billing.
- The final production build passed: 136 pages built; the output validator verified 52 static routes. A static check followed 3,640 internal links across 71 marketing outputs with zero missing routes or anchors.
- Dark-theme checks covered eight routes at desktop, tablet, and phone widths with no overflow or page exceptions. The final homepage check also passed at 320 pixels. Reduced-motion scrolling is `auto`; the mobile menu and mechanics disclosure remain usable with JavaScript disabled.
- The full site build runs the existing comparison, changelog, plugin, surveillance, metrics, search, and output validators. No new UI test suite or CI gate is introduced.

## References

- `docs/VISION.md`, `docs/ROADMAP.md`, `docs/CHARTER.md`, `README.md`
- `site/src/data/blog.ts`, `site/src/data/blog-art.ts`, all `site/src/pages/blog/*.astro`
- `site/src/data/agents.ts`, `site/src/data/pricing.ts`, `site/src/data/commitments.ts`
- `apps/electron/src/renderer/App.tsx`, `apps/electron/src/library/`
- `packages/cli/src/commands/connect.ts`
- `site/src/styles/marketing.css`, `site/src/components/marketing/`, `site/src/layouts/Base.astro`

## Revision 2 verification

- [x] Production build and existing site validators.
- [x] Desktop, tablet, and narrow-phone layouts in both themes.
- [x] Mobile navigation, blog filters, code tabs, and mechanics disclosure.
- [x] Internal routes and fragment targets.
- [x] Updated local preview and screenshots available for review.

The production build generated 136 pages and passed the output validator for
52 static routes. The browser sweep covered 20 routes at four widths (1440,
768, 375, and 320 pixels) in both themes, with no page exceptions. A long inline
schema address overflowed on the narrowest blog layout; inline code now wraps,
and that route passes the 320-pixel recheck in both themes.

Mobile navigation closes after following a homepage anchor. Blog title search,
empty results, topic selection, and the reset to all 25 essays work. Developer
language selection persists after reload, and agent-client tabs switch. The
theme also persists. The mobile menu and mechanics disclosure remain usable
with JavaScript disabled.

The static link audit checked 3,962 internal links across 71 marketing outputs,
with no missing routes or fragment targets. Current screenshots are saved in
`output/marketing-redesign-2026-10-10/revision-2/` in the primary checkout.
The preview server remains available at `http://127.0.0.1:4330/`.

The old preview is saved in local commit `c069c4fa1`. No revision is published.
