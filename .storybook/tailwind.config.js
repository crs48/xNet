import baseConfig from '../packages/ui/tailwind.config.js'

/** @type {import('tailwindcss').Config} */
export default {
  ...baseConfig,
  content: [
    '.storybook/**/*.{js,ts,jsx,tsx,mdx}',
    'packages/ui/src/**/*.{ts,tsx,mdx}',
    'packages/editor/src/**/*.{ts,tsx,mdx}',
    'apps/web/src/**/*.{ts,tsx,mdx}',
    'apps/electron/src/renderer/**/*.{ts,tsx,mdx}',
    'packages/views/src/**/*.{ts,tsx,mdx}',
    'packages/canvas/src/**/*.{ts,tsx,mdx}',
    'packages/react/src/**/*.{ts,tsx,mdx}',
    'packages/devtools/src/**/*.{ts,tsx,mdx}'
  ]
}
