import baseConfig from '../../packages/ui/tailwind.config.js'

/** @type {import('tailwindcss').Config} */
export default {
  ...baseConfig,
  content: [
    './src/renderer/**/*.{html,tsx,ts}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/views/src/**/*.{ts,tsx}',
    '../../packages/editor/src/**/*.{ts,tsx}'
  ]
}
