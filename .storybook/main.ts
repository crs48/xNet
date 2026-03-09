import type { StorybookConfig } from '@storybook/react-vite'
import { fileURLToPath } from 'node:url'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'
import { workspaceAliases } from './workspace-aliases.ts'

const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {}
  },
  stories: [
    '../packages/ui/src/**/*.stories.@(ts|tsx|mdx)',
    '../apps/web/src/**/*.stories.@(ts|tsx|mdx)',
    '../apps/electron/src/renderer/**/*.stories.@(ts|tsx|mdx)'
  ],
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-links',
    '@storybook/addon-themes',
    './performance-panel-preset.ts',
    '@storybook/addon-vitest'
  ],
  viteFinal: async (viteConfig) => ({
    ...viteConfig,
    css: {
      ...viteConfig.css,
      postcss: {
        plugins: [
          tailwindcss({
            config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url))
          }),
          autoprefixer()
        ]
      }
    },
    resolve: {
      ...viteConfig.resolve,
      alias: {
        ...workspaceAliases,
        ...viteConfig.resolve?.alias
      }
    }
  })
}

export default config
