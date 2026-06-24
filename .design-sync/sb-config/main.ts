// design-sync: ui-scoped Storybook config.
// Reuses the repo's .storybook/main.ts but narrows `stories` to @xnetjs/ui only.
// Why: the repo Storybook aggregates many packages; the non-UI stories pull in
// @xnetjs/runtime (unbuilt / unaliased) and break the preview build. @xnetjs/ui
// is a self-contained leaf, so a ui-only reference builds cleanly and is the
// fidelity oracle for the design-system sync. Relative addon paths are rebased
// to the repo .storybook dir; viteFinal/workspaceAliases stay bound to the repo
// main's module scope, so tailwind + aliases resolve correctly.
import { fileURLToPath } from 'node:url'
import baseConfig from '../../.storybook/main.ts'

const config = {
  ...baseConfig,
  stories: ['../../packages/ui/src/**/*.stories.@(ts|tsx|mdx)'],
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-links',
    '@storybook/addon-themes',
    fileURLToPath(new URL('../../.storybook/performance-panel-preset.ts', import.meta.url)),
    '@storybook/addon-vitest'
  ]
}

export default config
