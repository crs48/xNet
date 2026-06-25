#!/usr/bin/env node
/**
 * Print a git pathspec covering ONLY the publishable packages, so the diff fed
 * to the AI changeset generator never includes private/internal source
 * (`cloud`, `billing`-style commercial code, etc. stay on the machine).
 * Exploration 0220, Decision E (private-source-egress mitigation).
 *
 *   git diff origin/main...HEAD -- $(node scripts/changeset/publishable-pathspec.mjs)
 *
 * A package is publishable iff it is NOT private and NOT in the changeset
 * `ignore` list — the same rule scripts/check-publish-closure.mjs uses.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ignore = new Set(
  JSON.parse(readFileSync(join(root, '.changeset/config.json'), 'utf8')).ignore ?? [],
)

const paths = []
for (const d of readdirSync(join(root, 'packages'))) {
  const f = join(root, 'packages', d, 'package.json')
  if (!existsSync(f)) continue
  const p = JSON.parse(readFileSync(f, 'utf8'))
  if (p.name && p.private !== true && !ignore.has(p.name)) {
    paths.push(`packages/${d}`)
  }
}

process.stdout.write(paths.join(' '))
