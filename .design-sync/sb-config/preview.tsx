// design-sync: reuse the repo's Storybook preview verbatim (ThemeProvider +
// theme/perf decorators) so the ui-only reference renders identically to the
// real Storybook. Only the `stories` scope differs (see main.ts).
export { default } from '../../.storybook/preview'
