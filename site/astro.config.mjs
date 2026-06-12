// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import tailwind from '@astrojs/tailwind'
import { sidebar } from './src/sidebar.mjs'
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
      social: [
        { icon: 'rocket', label: 'Try the App', href: '/app' },
        { icon: 'github', label: 'GitHub', href: 'https://github.com/crs48/xNet' }
      ],
      editLink: {
        baseUrl: 'https://github.com/crs48/xNet/edit/main/site/'
      },
      expressiveCode: {
        themes: ['one-light', 'one-dark-pro']
      },
      components: {
        SiteTitle: './src/components/docs/SiteTitle.astro',
        Head: './src/components/docs/Head.astro'
      },
      sidebar
    }),
    tailwind({ applyBaseStyles: false })
  ]
})
