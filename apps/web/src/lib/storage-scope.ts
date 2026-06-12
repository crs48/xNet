/**
 * Pages preview deploys share production's browser-storage origin
 * (xnet.fyi/pr/<N>/app/ vs xnet.fyi/app/), so preview builds must not open
 * production's IndexedDB databases. Preview CI sets VITE_STORAGE_SCOPE (e.g.
 * pr-42) and scope-aware stores suffix their database names with it.
 *
 * This module must stay the first import in main.tsx so the scope is set
 * before any other module's side effects can touch storage.
 */
const scope = import.meta.env.VITE_STORAGE_SCOPE

if (scope) {
  const scopedGlobal = globalThis as { __XNET_STORAGE_SCOPE__?: string }
  scopedGlobal.__XNET_STORAGE_SCOPE__ = scope
}

export {}
