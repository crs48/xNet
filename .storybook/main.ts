import type { StorybookConfig } from '@storybook/react-vite'
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
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  viteFinal: async (viteConfig) => ({
    ...viteConfig,
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
