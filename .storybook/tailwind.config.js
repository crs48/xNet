import baseConfig from '../packages/ui/tailwind.config.js'

/** @type {import('tailwindcss').Config} */
export default {
  ...baseConfig,
  content: [
    '.storybook/**/*.{js,ts,jsx,tsx,mdx}',
    'packages/ui/src/**/*.{ts,tsx,mdx}',
    'apps/web/src/**/*.{ts,tsx,mdx}',
    'apps/electron/src/renderer/**/*.{ts,tsx,mdx}',
    'packages/views/src/**/*.{ts,tsx}',
    'packages/editor/src/**/*.{ts,tsx}',
    'packages/react/src/**/*.{ts,tsx}',
    'packages/devtools/src/**/*.{ts,tsx}'
  ]
}
