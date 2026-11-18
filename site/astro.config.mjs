import { defineConfig } from 'astro/config'
import tailwind from '@astrojs/tailwind'
export default defineConfig({
  site: 'https://xnet.fyi',
  integrations: [tailwind({ applyBaseStyles: false })]
})
