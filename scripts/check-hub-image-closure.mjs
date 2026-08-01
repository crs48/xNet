#!/usr/bin/env node
/**
 * The hub image must copy every package the hub actually depends on (0415).
 *
 * `packages/hub/Dockerfile` trims the workspace with `--filter @xnetjs/hub...`
 * but hand-lists the directories to COPY. Add a dependency anywhere in that
 * closure — even three packages away, as `@xnetjs/plugins → @xnetjs/brain` was
 * — and the list silently goes stale. Nothing fails until a full Docker build
 * gets six minutes in and dies on `Cannot find module`, and since that is the
 * same build Railway runs, the first symptom can be a failed deploy.
 *
 * This compares the transitive `@xnetjs/*` dependency closure of `@xnetjs/hub`
 * against the Dockerfile's COPY lines in about a second.
 *
 * Run: `node scripts/check-hub-image-closure.mjs` (or `pnpm check:hub-image`).
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGES_DIR = 'packages'
const DOCKERFILE = join(PACKAGES_DIR, 'hub', 'Dockerfile')
const ROOT_PACKAGE = '@xnetjs/hub'

/** Map every workspace package name to its directory and @xnetjs runtime deps. */
function readWorkspace() {
  const byName = new Map()
  for (const dir of readdirSync(PACKAGES_DIR)) {
    const manifestPath = join(PACKAGES_DIR, dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    byName.set(manifest.name, {
      dir,
      // Runtime only: devDependencies are not installed by `--filter …` in the
      // image, and are exactly why an optional engine can stay out of it.
      deps: Object.keys(manifest.dependencies ?? {}).filter((d) => d.startsWith('@xnetjs/'))
    })
  }
  return byName
}

function closureOf(byName, root) {
  const seen = new Set()
  const walk = (name) => {
    const entry = byName.get(name)
    if (!entry || seen.has(name)) return
    seen.add(name)
    for (const dep of entry.deps) walk(dep)
  }
  walk(root)
  return [...seen].map((name) => byName.get(name).dir).sort()
}

/**
 * The Dockerfile hand-lists packages in FOUR places, and missing any one of
 * them breaks a different stage — with a different error, minutes apart.
 *
 * The first version of this guard checked only `builder-source` and passed
 * while `runtime-manifest` was still stale, which is exactly the false
 * confidence a gate is supposed to remove. Every list is checked now.
 */
const COPY_LISTS = [
  {
    id: 'builder-manifest',
    pattern: /^COPY packages\/([a-z0-9-]+)\/package\.json packages/gm,
    template: (dir) => `COPY packages/${dir}/package.json packages/${dir}/`,
    breaks: 'the builder install (ERR_PNPM_WORKSPACE_PKG_NOT_FOUND)'
  },
  {
    id: 'builder-source',
    pattern: /^COPY packages\/([a-z0-9-]+)\/ packages/gm,
    template: (dir) => `COPY packages/${dir}/ packages/${dir}/`,
    breaks: 'the builder build (Cannot find module)'
  },
  {
    id: 'runtime-manifest',
    pattern: /^COPY --from=builder \/build\/packages\/([a-z0-9-]+)\/package\.json packages/gm,
    template: (dir) => `COPY --from=builder /build/packages/${dir}/package.json packages/${dir}/`,
    breaks: 'the runtime install (ERR_PNPM_WORKSPACE_PKG_NOT_FOUND)'
  },
  {
    id: 'runtime-dist',
    pattern: /^COPY --from=builder \/build\/packages\/([a-z0-9-]+)\/dist packages/gm,
    template: (dir) => `COPY --from=builder /build/packages/${dir}/dist packages/${dir}/dist/`,
    breaks: 'the hub at boot (missing dist, no build-time error at all)'
  }
]

function main() {
  const byName = readWorkspace()
  if (!byName.has(ROOT_PACKAGE)) {
    console.error(`✗ ${ROOT_PACKAGE} not found in ${PACKAGES_DIR}/`)
    process.exit(1)
  }

  const closure = closureOf(byName, ROOT_PACKAGE)
  const dockerfile = readFileSync(DOCKERFILE, 'utf8')

  const problems = []
  for (const list of COPY_LISTS) {
    const copied = new Set([...dockerfile.matchAll(list.pattern)].map((m) => m[1]))
    if (copied.size === 0) {
      // The pattern matched nothing at all — the Dockerfile was restructured
      // and this guard is now checking a list that no longer exists. Say so
      // rather than reporting a clean run over zero lines.
      problems.push({ list, missing: ['(no COPY lines matched — did the Dockerfile change?)'] })
      continue
    }
    const missing = closure.filter((dir) => !copied.has(dir))
    if (missing.length > 0) problems.push({ list, missing })
  }

  if (problems.length > 0) {
    console.error(`✗ ${DOCKERFILE} is missing packages the hub depends on:\n`)
    for (const { list, missing } of problems) {
      console.error(`  [${list.id}] breaks ${list.breaks}`)
      for (const dir of missing) {
        console.error(`      ${dir.startsWith('(') ? dir : list.template(dir)}`)
      }
      console.error('')
    }
    console.error(
      `Each list is a separate hand-maintained allowlist; a dependency added\n` +
        `anywhere in the hub's closure staled all four at once. This is the same\n` +
        `image Railway builds, so the first symptom can be a failed deploy.\n`
    )
    process.exit(1)
  }

  console.log(
    `✓ hub image copies all ${closure.length} closure packages across ` +
      `${COPY_LISTS.length} COPY lists`
  )
}

main()
