// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import tailwind from '@astrojs/tailwind'
/**
 * Lightweight rehype plugin that converts ```mermaid code blocks into
 * <pre class="mermaid"> elements for client-side rendering by Mermaid.js.
 * Replaces rehype-mermaid (which drags in playwright as a transitive dep).
 */
function rehypeMermaidPre() {
  function walk(node) {
    if (!node.children) return
    for (const child of node.children) {
      if (
        child.type === 'element' &&
        child.tagName === 'pre' &&
        child.children?.length === 1 &&
        child.children[0].tagName === 'code'
      ) {
        const code = child.children[0]
        const classes = code.properties?.className || []
        if (classes.includes('language-mermaid')) {
          const text = code.children?.map((c) => c.value || '').join('')
          child.properties = { className: ['mermaid'] }
          child.children = [{ type: 'text', value: text }]
        }
      }
      walk(child)
    }
  }
  return (tree) => walk(tree)
}

// https://astro.build/config
export default defineConfig({
  site: 'https://xnet.fyi',
  base: '/',
  markdown: {
    rehypePlugins: [rehypeMermaidPre]
  },
  integrations: [
    starlight({
      title: 'xNet',
      customCss: ['./src/styles/docs.css'],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/crs48/xNet' }],
      editLink: {
        baseUrl: 'https://github.com/crs48/xNet/edit/main/site/'
      },
      components: {
        SiteTitle: './src/components/docs/SiteTitle.astro',
        Head: './src/components/docs/Head.astro'
      },
      sidebar: [
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
            { slug: 'docs/schemas/type-inference' }
          ]
        },
        {
          label: 'Guides',
          collapsed: true,
          items: [
            { slug: 'docs/guides/sync' },
            { slug: 'docs/guides/offline' },
            { slug: 'docs/guides/identity' },
            { slug: 'docs/guides/collaboration' },
            { slug: 'docs/guides/plugins' },
            { slug: 'docs/guides/canvas' },
            { slug: 'docs/guides/editor' },
            { slug: 'docs/guides/hub' },
            { slug: 'docs/guides/devtools' },
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
        }
      ]
    }),
    tailwind({ applyBaseStyles: false })
  ]
})
