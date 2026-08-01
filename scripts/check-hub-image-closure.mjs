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

function copiedDirs(dockerfile) {
  return [...dockerfile.matchAll(/^COPY packages\/([a-z0-9-]+)\/ packages/gm)].map((m) => m[1])
}

function main() {
  const byName = readWorkspace()
  if (!byName.has(ROOT_PACKAGE)) {
    console.error(`✗ ${ROOT_PACKAGE} not found in ${PACKAGES_DIR}/`)
    process.exit(1)
  }

  const closure = closureOf(byName, ROOT_PACKAGE)
  const copied = new Set(copiedDirs(readFileSync(DOCKERFILE, 'utf8')))
  const missing = closure.filter((dir) => !copied.has(dir))

  if (missing.length > 0) {
    console.error(
      `✗ ${DOCKERFILE} does not copy ${missing.length} package(s) the hub depends on:\n` +
        missing.map((dir) => `    packages/${dir}`).join('\n') +
        `\n\nAdd both lines for each — the manifest stage and the source stage:\n` +
        missing
          .map(
            (dir) =>
              `    COPY packages/${dir}/package.json packages/${dir}/\n` +
              `    COPY packages/${dir}/ packages/${dir}/`
          )
          .join('\n') +
        `\n\nWithout them the image builds for ~6 minutes and then fails on\n` +
        `"Cannot find module" — and that is the same build Railway runs.\n`
    )
    process.exit(1)
  }

  // Not an error: extra copies only cost image size, and some are deliberate.
  const extra = [...copied].filter((dir) => !closure.includes(dir)).sort()
  if (extra.length > 0) {
    console.log(`  note: copied but not in the hub closure: ${extra.join(', ')}`)
  }
  console.log(`✓ hub image copies all ${closure.length} packages in its dependency closure`)
}

main()
