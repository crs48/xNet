// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import tailwind from '@astrojs/tailwind'

// https://astro.build/config
export default defineConfig({
  site: 'https://crs48.github.io',
  base: '/xNet',
  integrations: [
    starlight({
      title: 'xNet',
      customCss: ['./src/styles/docs.css'],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/crs48/xNet' }],
      editLink: {
        baseUrl: 'https://github.com/crs48/xNet/edit/main/site/'
      },
      components: {
        SiteTitle: './src/components/docs/SiteTitle.astro'
      },
      sidebar: [
        {
          label: 'Start Here',
          items: [{ slug: 'introduction' }, { slug: 'quickstart' }, { slug: 'core-concepts' }]
        },
        {
          label: 'React Hooks',
          items: [
            { slug: 'hooks/overview' },
            { slug: 'hooks/usequery' },
            { slug: 'hooks/usemutate' },
            { slug: 'hooks/usenode' },
            { slug: 'hooks/useidentity' },
            { slug: 'hooks/patterns' }
          ]
        },
        {
          label: 'Schemas & Data',
          items: [
            { slug: 'schemas/overview' },
            { slug: 'schemas/defineschema' },
            { slug: 'schemas/property-types' },
            { slug: 'schemas/relations' },
            { slug: 'schemas/type-inference' }
          ]
        },
        {
          label: 'Guides',
          collapsed: true,
          items: [
            { slug: 'guides/sync' },
            { slug: 'guides/offline' },
            { slug: 'guides/identity' },
            { slug: 'guides/collaboration' },
            { slug: 'guides/plugins' },
            { slug: 'guides/electron' },
            { slug: 'guides/testing' }
          ]
        },
        {
          label: 'Concepts',
          collapsed: true,
          items: [
            { slug: 'concepts/local-first' },
            { slug: 'concepts/crdts' },
            { slug: 'concepts/sync-architecture' },
            { slug: 'concepts/identity-model' },
            { slug: 'concepts/cryptography' },
            { slug: 'concepts/data-model' }
          ]
        },
        {
          label: 'Architecture',
          collapsed: true,
          items: [
            { slug: 'architecture/overview' },
            { slug: 'architecture/decisions' },
            { slug: 'architecture/package-graph' }
          ]
        },
        {
          label: 'Contributing',
          collapsed: true,
          items: [
            { slug: 'contributing/getting-started' },
            { slug: 'contributing/code-style' },
            { slug: 'contributing/testing' }
          ]
        }
      ]
    }),
    tailwind({ applyBaseStyles: false })
  ]
})
