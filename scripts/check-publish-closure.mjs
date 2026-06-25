#!/usr/bin/env node
// Fail CI if a published package has a workspace runtime dependency on a
// package that is NOT itself published. A published package's npm tarball
// rewrites `workspace:*` to the dependency's exact version, so an unpublished
// dependency makes the tarball un-installable (E404) — and `changeset publish`
// errors before publishing when a non-`ignore`d private package is in the
// closure. Exploration 0220, Decision F ("broken-install dependency-closure").
//
// A package "publishes" iff it is NOT private and NOT in the changeset `ignore`
// list. Only `dependencies` enter the published closure — `devDependencies` and
// `peerDependencies` do not.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cfg = JSON.parse(readFileSync(join(root, '.changeset/config.json'), 'utf8'))
const ignore = new Set(cfg.ignore ?? [])

const meta = {}
for (const d of readdirSync(join(root, 'packages'))) {
  const f = join(root, 'packages', d, 'package.json')
  if (existsSync(f)) {
    const p = JSON.parse(readFileSync(f, 'utf8'))
    if (p.name) meta[p.name] = p
  }
}

const published = (name) =>
  Boolean(meta[name]) && meta[name].private !== true && !ignore.has(name)

let bad = 0
for (const [name, p] of Object.entries(meta)) {
  if (!published(name)) continue
  for (const dep of Object.keys(p.dependencies ?? {})) {
    if (dep.startsWith('@xnetjs/') && !published(dep)) {
      const why = !meta[dep]
        ? 'unknown'
        : ignore.has(dep)
          ? 'in changeset ignore list'
          : 'private:true'
      console.error(`  ✗ ${name} → ${dep}  (${why})`)
      bad++
    }
  }
}

if (bad) {
  console.error(
    `\n✗ ${bad} broken-closure dependency(ies): a published package depends on an` +
      ` unpublished @xnetjs package.\n  Fix by publishing the dependency, inlining it,` +
      ` or demoting it to devDependencies/peerDependencies.`,
  )
  process.exit(1)
}
console.log('✓ every published package has a fully-published runtime closure')
