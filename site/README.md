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

The landing page (`src/pages/index.astro`) includes custom sections:

- Hero with CTA
- Problem statement
- What you can build
- Hooks showcase
- Plugin system
- Hub infrastructure
- Developer experience
- Efficiency metrics
- Under the hood
- Landscape comparison
- Before/after comparison
- Roadmap
- Community
- Get started

## Deployment

Built to `site/dist/`. Deployed at `https://xnet.fyi`.
