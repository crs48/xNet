/**
 * Single source of truth for the docs navigation.
 *
 * Both astro.config.mjs (Starlight sidebar) and scripts/build-llms-full.ts
 * (llms-full.txt section order) import this module, so a new docs page lands
 * in site navigation and in the AI-agent surface with one edit. The llms
 * build fails if a content file exists that is listed in neither this sidebar
 * nor its explicit exclusion list.
 */
export const sidebar = [
  {
    label: 'Start Here',
    items: [
      { slug: 'docs/introduction' },
      { slug: 'docs/quickstart' },
      { slug: 'docs/core-concepts' }
    ]
  },
  {
    label: 'React Hooks',
    items: [
      { slug: 'docs/hooks/overview' },
      { slug: 'docs/hooks/usequery' },
      { slug: 'docs/hooks/usemutate' },
      { slug: 'docs/hooks/usenode' },
      { slug: 'docs/hooks/useidentity' },
      { slug: 'docs/hooks/patterns' }
    ]
  },
  {
    label: 'Schemas & Data',
    items: [
      { slug: 'docs/schemas/overview' },
      { slug: 'docs/schemas/defineschema' },
      { slug: 'docs/schemas/property-types' },
      { slug: 'docs/schemas/relations' },
      { slug: 'docs/schemas/type-inference' },
      { slug: 'docs/schemas/extending-schemas' }
    ]
  },
  {
    label: 'The Protocol',
    collapsed: true,
    items: [
      { slug: 'docs/protocol/overview' },
      { slug: 'docs/protocol/data-model' },
      { slug: 'docs/protocol/replication' },
      { slug: 'docs/protocol/authorization' },
      { slug: 'docs/protocol/implement-in-your-language' },
      { slug: 'docs/protocol/conformance' }
    ]
  },
  {
    label: 'The App',
    collapsed: true,
    items: [
      { slug: 'docs/guides/workbench' },
      { slug: 'docs/guides/tasks' },
      { slug: 'docs/guides/dashboards' },
      { slug: 'docs/guides/chat-and-calls' },
      { slug: 'docs/guides/notifications' },
      { slug: 'docs/guides/editor' },
      { slug: 'docs/guides/canvas' },
      { slug: 'docs/guides/devtools' }
    ]
  },
  {
    label: 'Guides',
    collapsed: true,
    items: [
      { slug: 'docs/guides/authorization' },
      { slug: 'docs/guides/sync' },
      { slug: 'docs/guides/versioning' },
      { slug: 'docs/guides/offline' },
      { slug: 'docs/guides/identity' },
      { slug: 'docs/guides/collaboration' },
      { slug: 'docs/guides/plugins' },
      { slug: 'docs/guides/agent-interfaces' },
      { slug: 'docs/guides/hub' },
      { slug: 'docs/guides/server' },
      { slug: 'docs/guides/cloud-connect' },
      { slug: 'docs/guides/electron' },
      { slug: 'docs/guides/testing' }
    ]
  },
  {
    label: 'Concepts',
    collapsed: true,
    items: [
      { slug: 'docs/concepts/local-first' },
      { slug: 'docs/concepts/crdts' },
      { slug: 'docs/concepts/sync-architecture' },
      { slug: 'docs/concepts/identity-model' },
      { slug: 'docs/concepts/cryptography' },
      { slug: 'docs/concepts/data-model' },
      { slug: 'docs/concepts/network' }
    ]
  },
  {
    label: 'Architecture',
    collapsed: true,
    items: [
      { slug: 'docs/architecture/overview' },
      { slug: 'docs/architecture/decisions' },
      { slug: 'docs/architecture/package-graph' }
    ]
  },
  {
    label: 'Contributing',
    collapsed: true,
    items: [
      { slug: 'docs/contributing/getting-started' },
      { slug: 'docs/contributing/code-style' },
      { slug: 'docs/contributing/testing' }
    ]
  },
  {
    label: 'Resources',
    collapsed: true,
    items: [
      { slug: 'docs/ai/understanding-xnet', label: 'For AI Assistants' },
      { label: 'Changelog', link: '/changelog' },
      { label: 'Compare to Alternatives', link: '/compare' },
      { label: 'Roadmap', link: '/#roadmap' }
    ]
  }
]

/**
 * Doc slugs in sidebar order (e.g. 'docs/guides/canvas'). External links are
 * skipped. This drives the section order of llms-full.txt.
 */
export const orderedDocSlugs = sidebar.flatMap((group) =>
  group.items.flatMap((item) =>
    typeof item === 'object' && 'slug' in item ? [item.slug] : []
  )
)
