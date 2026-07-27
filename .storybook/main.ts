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
    '../packages/editor/src/**/*.stories.@(ts|tsx|mdx)',
    '../packages/views/src/**/*.stories.@(ts|tsx|mdx)',
    '../packages/canvas/src/**/*.stories.@(ts|tsx|mdx)',
    '../packages/dashboard/src/**/*.stories.@(ts|tsx|mdx)',
    '../apps/web/src/**/*.stories.@(ts|tsx|mdx)',
    '../apps/electron/src/renderer/**/*.stories.@(ts|tsx|mdx)',
    // Visual explorations (0403). Deliberately NARROW — `docs/explorations/**`
    // would compile all 470 explorations on every `dev:stories` boot. Only the
    // opt-in `visuals/NNNN/` companions render here; the canonical `.md`
    // exploration stays on GitHub.
    '../docs/explorations/visuals/**/*.mdx'
  ],
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-links',
    '@storybook/addon-themes',
    // Compiles `*.mdx` docs pages. The `mdx` extension was already in the story
    // globs above but matched nothing without this addon (0403).
    '@storybook/addon-docs',
    './performance-panel-preset.ts',
    '@storybook/addon-vitest'
  ],
  viteFinal: async (viteConfig) => ({
    ...viteConfig,
    build: {
      ...viteConfig.build,
      rollupOptions: {
        ...viteConfig.build?.rollupOptions,
        external: [
          ...((Array.isArray(viteConfig.build?.rollupOptions?.external)
            ? viteConfig.build?.rollupOptions?.external
            : []) as string[]),
          'mermaid',
          'web-worker'
        ]
      }
    },
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
    },
    optimizeDeps: {
      ...viteConfig.optimizeDeps,
      exclude: [...(viteConfig.optimizeDeps?.exclude ?? []), 'elkjs', 'mermaid']
    },
    worker: {
      ...viteConfig.worker,
      format: 'es'
    }
  })
}

export default config
