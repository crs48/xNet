import baseConfig from '../../packages/ui/tailwind.config.js'

/**
 * Tailwind here exists ONLY to style the embedded xNet DevTools (and the
 * @xnetjs/ui pieces its panels use) — the demos themselves are plain CSS
 * (src/styles.css). Preflight stays off so Tailwind's reset can't disturb
 * the demo look.
 */

/** @type {import('tailwindcss').Config} */
export default {
  ...baseConfig,
  corePlugins: {
    ...(baseConfig.corePlugins ?? {}),
    preflight: false
  },
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/devtools/src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}'
  ]
}
