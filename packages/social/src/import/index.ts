/**
 * Social importer contracts and utilities.
 *
 * Exports the **browser-safe** surface only. This barrel is reached from the
 * package root (`src/index.ts` → `export * from './import'`), so anything it
 * re-exports lands in every web bundle that touches `@xnetjs/social`: exporting
 * `./node` here pulled `node:fs`/`node:zlib` into the browser build and broke
 * `apps/web` outright ("promises" is not exported by "__vite-browser-external").
 *
 * Platform implementations stay behind their own subpath exports — import
 * `@xnetjs/social/import/node` or `@xnetjs/social/import/browser` explicitly.
 */

export * from './core'
