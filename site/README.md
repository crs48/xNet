# xNet Documentation Site

Astro + Starlight documentation website for xNet.

## Development

```bash
cd site
pnpm install
pnpm dev           # Start dev server
pnpm build         # Build static site
pnpm preview       # Preview production build
```

## Tech Stack

- **Astro v5** -- Static site generator
- **Starlight** -- Documentation theme with sidebar, search, and ToC
- **Tailwind CSS** -- Custom styling
- **Pagefind** -- Client-side search (built into Starlight)

## Structure

```
site/
  src/
    content/docs/          # Documentation pages (MDX)
      docs/
        index.mdx          # Docs landing page
        introduction.mdx
        quickstart.mdx
        core-concepts.mdx
        hooks/             # React hooks docs (6 pages)
        schemas/           # Schema & data docs (5 pages)
        guides/            # How-to guides (11 pages)
        concepts/          # Deep-dive concepts (7 pages)
        architecture/      # Architecture docs (3 pages)
        contributing/      # Contributor docs (3 pages)
    pages/
      index.astro          # Landing page
    components/
      sections/            # Landing page sections (Hero, Features, etc.)
      ui/                  # Shared UI components
      docs/                # Doc-specific components (Head, SiteTitle)
    layouts/
      Base.astro           # Base HTML layout
    styles/
      tailwind.css         # Tailwind entry
      docs.css             # Doc-specific styles
  public/
    favicon.svg
  astro.config.mjs         # Astro + Starlight config
  tailwind.config.mjs      # Tailwind config
  content.config.ts        # Content collection schema
```

## Documentation Sections

| Section        | Pages | Description                                                                                       |
| -------------- | ----- | ------------------------------------------------------------------------------------------------- |
| Start Here     | 3     | Introduction, quickstart, core concepts                                                           |
| React Hooks    | 6     | useQuery, useMutate, useNode, useIdentity, patterns, overview                                     |
| Schemas & Data | 5     | defineSchema, property types, relations, type inference, overview                                 |
| Guides         | 11    | Sync, offline, identity, collaboration, plugins, canvas, editor, hub, devtools, electron, testing |
| Concepts       | 7     | Local-first, CRDTs, data model, sync architecture, network, identity, cryptography                |
| Architecture   | 3     | Overview, package graph, decisions                                                                |
| Contributing   | 3     | Getting started, code style, testing                                                              |

## Landing Page

The landing page (`src/pages/index.astro`) is a deliberately short router
(exploration 0384): every section is a teaser that links to a depth page,
never a full re-argument. Seven sections, ~1,000 words, ~11 viewports:

- Hero — product screenshot + three doors (app / SDK / protocol)
- The app (`#app`) — six marquee surfaces, links to `/app`
- For developers (`#developers`) — code sample, links to `/react`, `/build-with`
- Built for agents (`#agents`) — links to the agent-interfaces guide
- Open to the studs (`#open`) — protocol / crypto / hubs / connectors tiles
- Built to be left (`#humane`) — commitments + stat strip, links to `/commitments`, `/roadmap`, `/open`
- Get started (`#get-started`)

Before adding a section, ask which existing depth page should carry the
content instead. Keep total visible prose under ~1,300 words (measure with
`document.querySelector('main').innerText.split(/\s+/).length` in the console).

### Release checklist: hero screenshots

`public/images/workbench-{light,dark}.png` (1600×1000) are the hero art.
When the workbench UI changes visibly, re-capture both via the scripted
Playwright recipe (seed scale M → author the "Q3 Launch Plan" doc → light +
dark capture → downscale with `sharp` to ~120 KB). Stale screenshots on the
hero read as a stale product.

## Deployment

Built to `site/dist/`. Deployed at `https://xnet.fyi`.
