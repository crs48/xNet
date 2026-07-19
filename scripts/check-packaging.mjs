#!/usr/bin/env node
/**
 * Packaging gate (exploration 0370) — publint + attw over every publishable
 * package.
 *
 * These answer "can a consumer actually install and import this?", which is
 * upstream of any versioning promise: a correct semver bump on a package whose
 * export map doesn't resolve is worth nothing.
 *
 * Level is `error`, not `suggestion`: the suggestion tier flags things like a
 * missing `engines.node` on every package, which would make this gate
 * unpassable on day one — and a gate that cannot go green teaches everyone to
 * ignore red (CLAUDE.md §0294). Errors only, so it is decidable.
 *
 * Found on introduction: 48 export subpaths across 19 packages had `types`
 * ordered after `import` (conditions are order-sensitive, so TypeScript could
 * mis-resolve), and `@xnetjs/data` advertised a `./portability` subpath that was
 * never added to its build — `@xnetjs/data/portability`, the `.xnetpack` codec,
 * did not resolve at all.
 *
 * Requires a prior build: it reads dist/.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const publishable = []
for (const d of readdirSync(join(ROOT, 'packages'))) {
  const f = join(ROOT, 'packages', d, 'package.json')
  if (!existsSync(f)) continue
  const p = JSON.parse(readFileSync(f, 'utf8'))
  if (p.name && p.private !== true) publishable.push({ dir: `packages/${d}`, name: p.name })
}

let failed = false

for (const { dir, name } of publishable) {
  try {
    execFileSync('pnpm', ['exec', 'publint', dir, '--level', 'error'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    })
  } catch (err) {
    process.stderr.write(`\n✗ publint: ${name}\n${err.stdout ?? ''}${err.stderr ?? ''}\n`)
    failed = true
  }
}

if (failed) {
  process.stderr.write(
    `\nThese are packaging errors a consumer would hit on install or import.\n` +
      `Reproduce locally with: pnpm exec publint <packages/dir> --level error\n`
  )
  process.exit(1)
}

process.stdout.write(`✓ packaging valid for ${publishable.length} publishable packages\n`)
