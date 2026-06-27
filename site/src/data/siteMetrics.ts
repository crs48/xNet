/**
 * Single source of truth for the "how big is this project" numbers shown across
 * the marketing site (Hero, Community, Roadmap, …).
 *
 * Every figure is a deliberately conservative floor, verified against the
 * repository at build time by site/scripts/validate-metrics.ts (wired into
 * `pnpm build`). That validator fails the build if a number is overstated, or if
 * the repo has grown past it by more than ~25% — so the page can neither lie nor
 * silently rot the way "30 packages / 6,000 tests / 10-panel devtools" did. Bump
 * these (and re-run `pnpm --filter site validate:metrics`) when a milestone
 * crosses a round number. Mirrors the citation discipline of compare.ts /
 * surveillance.ts.
 *
 * Verified 2026-06-27.
 */

export interface SiteMetrics {
  /** Directories under packages/ (the @xnetjs/* workspace). */
  packages: number
  /** Publishable libraries (private:false, not changeset-ignored). */
  publishableLibs: number
  /** Test cases (it()/test() blocks) across packages/ and apps/. Rendered as "N+". */
  tests: number
  /** Panel surfaces in the devtools suite (packages/devtools/src/panels/*). */
  devtoolsPanels: number
  /** Shipping client surfaces, for prose. */
  platforms: string[]
}

export const siteMetrics: SiteMetrics = {
  packages: 47,
  publishableLibs: 18,
  tests: 9600,
  devtoolsPanels: 21,
  platforms: ['Web (PWA)', 'Desktop (Electron)', 'Mobile (Expo, soon)']
}

const nf = new Intl.NumberFormat('en-US')

/** "9,600+ tests" */
export const testsLabel = `${nf.format(siteMetrics.tests)}+ tests`
/** "47 packages" */
export const packagesLabel = `${siteMetrics.packages} packages`
/** "21-panel devtools suite" */
export const devtoolsLabel = `${siteMetrics.devtoolsPanels}-panel devtools suite`
/** "9,600+ tests across 47 packages" */
export const testsAcrossPackages = `${testsLabel} across ${packagesLabel}`
