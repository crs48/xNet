#!/usr/bin/env node
/**
 * Fail CI if any `.changeset/*.md` would stop `changeset version` from
 * assembling a release plan. Rules:
 *
 *   mixed             ✗ one changeset naming both an `ignore`d package and a
 *                       non-ignored one. changesets refuses these outright
 *                       ("Mixed changesets that contain both ignored and not
 *                       ignored packages are not allowed").
 *   unknown-package   ✗ a package name that is not in the workspace — usually a
 *                       typo or a package that was renamed or deleted.
 *   bad-bump          ✗ a bump that is not major/minor/patch.
 *   no-frontmatter    ✗ a changeset with no parseable `---` block.
 *
 * Why this gate exists: `changeset version` only runs on push to main, so a bad
 * changeset lands green on its PR and reds the *release* instead. The npm
 * Release workflow then fails on every subsequent push — the Version Packages PR
 * stops refreshing and nothing can publish. That is precisely how four mixed
 * changesets accumulated over 12 days and 8+ red runs. Catching them on the PR
 * that introduces them keeps the failure next to its cause.
 *
 * changesets reports only the FIRST offending file and then aborts, so fixing
 * what the error names moves the failure one run later rather than fixing it.
 * This gate reports every offender in one pass.
 *
 * Run: `node scripts/check-changesets.mjs` (or `pnpm check:changesets`).
 *      `node scripts/check-changesets.mjs --selftest`  (verifies the gate
 *      catches planted violations — a gate with no negative control is
 *      unfalsifiable, exploration 0430).
 *
 * The self-test's fixtures are in memory, never on disk, so a control can never
 * leak into the real scan.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const BUMPS = new Set(['major', 'minor', 'patch'])

/**
 * Parse a changeset's frontmatter into `[{ name, bump }]`.
 * Returns `null` when there is no frontmatter block at all.
 */
export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  return m[1]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      // Package names contain `/` but never `:`, so the last colon splits.
      const at = line.lastIndexOf(':')
      if (at === -1) return { name: line, bump: '', line }
      const name = line
        .slice(0, at)
        .trim()
        .replace(/^['"]|['"]$/g, '')
      const bump = line
        .slice(at + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
      return { name, bump, line }
    })
}

/**
 * Problems with one changeset. Pure (no I/O) so --selftest exercises it
 * directly.
 *
 * @param text      raw `.changeset/*.md` contents
 * @param ignored   Set of package names in `.changeset/config.json` `ignore`
 * @param known     Set of every workspace package name
 */
export function checkChangeset(text, ignored, known) {
  const entries = parseFrontmatter(text)
  if (entries === null) {
    return [{ rule: 'no-frontmatter', detail: 'no --- frontmatter block' }]
  }

  const problems = []
  for (const e of entries) {
    if (!BUMPS.has(e.bump)) {
      problems.push({ rule: 'bad-bump', detail: `${e.name}: "${e.bump}" is not major/minor/patch` })
    }
    if (!known.has(e.name)) {
      problems.push({ rule: 'unknown-package', detail: `${e.name} is not a workspace package` })
    }
  }

  // Only weigh names we recognise — an unknown name is already reported above,
  // and guessing which side of the ignore line it belongs on would be noise.
  const named = entries.filter((e) => known.has(e.name))
  const ign = named.filter((e) => ignored.has(e.name)).map((e) => e.name)
  const notIgn = named.filter((e) => !ignored.has(e.name)).map((e) => e.name)
  if (ign.length > 0 && notIgn.length > 0) {
    problems.push({
      rule: 'mixed',
      detail: `ignored [${ign.join(', ')}] mixed with not-ignored [${notIgn.join(', ')}]`
    })
  }
  return problems
}

function workspacePackageNames(root) {
  // Mirrors pnpm-workspace.yaml: packages/*, apps/*, site, tests/*.
  const names = new Set()
  const addManifest = (dir) => {
    const f = join(dir, 'package.json')
    if (!existsSync(f)) return
    const name = JSON.parse(readFileSync(f, 'utf8')).name
    if (name) names.add(name)
  }
  for (const group of ['packages', 'apps', 'tests']) {
    const base = join(root, group)
    if (!existsSync(base)) continue
    for (const d of readdirSync(base)) addManifest(join(base, d))
  }
  addManifest(join(root, 'site'))
  return names
}

function runScan() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const cfg = JSON.parse(readFileSync(join(root, '.changeset/config.json'), 'utf8'))
  const ignored = new Set(cfg.ignore ?? [])
  const known = workspacePackageNames(root)

  if (known.size === 0) {
    // An empty package list would make every changeset "unknown" and every
    // mixed check vacuous — a green run that proved nothing.
    console.error('✗ found no workspace packages; refusing to report a vacuous pass')
    return 1
  }

  const files = readdirSync(join(root, '.changeset'))
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort()

  let bad = 0
  for (const f of files) {
    const problems = checkChangeset(
      readFileSync(join(root, '.changeset', f), 'utf8'),
      ignored,
      known
    )
    for (const p of problems) {
      console.error(`  ✗ .changeset/${f}  [${p.rule}] ${p.detail}`)
      bad++
    }
  }

  if (bad > 0) {
    console.error(
      `\n✗ ${bad} problem(s) across ${files.length} changeset(s). ` +
        `\`changeset version\` cannot assemble a release plan, so the npm Release` +
        ` workflow will fail on every push to main until these are fixed.\n` +
        `  For [mixed]: drop the ignored packages' bump lines — ignored packages` +
        ` are never versioned or published, so removing them changes no output.`
    )
    return 1
  }
  console.log(`✓ ${files.length} changeset(s) assemble into a valid release plan`)
  return 0
}

function runSelfTest() {
  const ignored = new Set(['@xnetjs/views', '@xnetjs/hub'])
  const known = new Set(['@xnetjs/views', '@xnetjs/hub', '@xnetjs/data', '@xnetjs/devkit'])
  const body = '\n\nA release note.\n'

  const cases = [
    {
      label: 'flags a publishable package mixed with an ignored one',
      text: `---\n'@xnetjs/data': minor\n'@xnetjs/views': minor\n---${body}`,
      expect: (p) => p.some((x) => x.rule === 'mixed')
    },
    {
      label: 'flags the real-world three-package mix that broke the release',
      text: `---\n'@xnetjs/data': minor\n'@xnetjs/views': minor\n'@xnetjs/hub': patch\n---${body}`,
      expect: (p) => p.some((x) => x.rule === 'mixed')
    },
    {
      label: 'passes a changeset naming only publishable packages',
      text: `---\n'@xnetjs/data': minor\n'@xnetjs/devkit': patch\n---${body}`,
      expect: (p) => p.length === 0
    },
    {
      label: 'passes a changeset naming only ignored packages (legal, just inert)',
      text: `---\n'@xnetjs/views': minor\n'@xnetjs/hub': major\n---${body}`,
      expect: (p) => p.length === 0
    },
    {
      label: 'accepts unquoted package names',
      text: `---\n@xnetjs/data: minor\n---${body}`,
      expect: (p) => p.length === 0
    },
    {
      label: 'accepts double-quoted package names',
      text: `---\n"@xnetjs/data": minor\n---${body}`,
      expect: (p) => p.length === 0
    },
    {
      label: 'flags an unknown package name',
      text: `---\n'@xnetjs/nope': minor\n---${body}`,
      expect: (p) => p.some((x) => x.rule === 'unknown-package')
    },
    {
      label: 'flags a bump that is not major/minor/patch',
      text: `---\n'@xnetjs/data': huge\n---${body}`,
      expect: (p) => p.some((x) => x.rule === 'bad-bump')
    },
    {
      label: 'flags a changeset with no frontmatter',
      text: 'Just a release note with no frontmatter.\n',
      expect: (p) => p.some((x) => x.rule === 'no-frontmatter')
    },
    {
      label: 'does not let an unknown name fabricate a mixed verdict',
      text: `---\n'@xnetjs/data': minor\n'@xnetjs/nope': minor\n---${body}`,
      expect: (p) => !p.some((x) => x.rule === 'mixed')
    }
  ]

  let failures = 0
  for (const c of cases) {
    const found = checkChangeset(c.text, ignored, known)
    if (c.expect(found)) {
      console.log(`  ✓ ${c.label}`)
    } else {
      failures++
      console.error(`  ✗ ${c.label} — got ${JSON.stringify(found)}`)
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} self-test(s) failed.`)
    return 1
  }
  console.log(`\n✓ changeset self-test passed (${cases.length} cases)`)
  return 0
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]).endsWith('check-changesets.mjs')
if (invokedDirectly) {
  process.exit(process.argv.includes('--selftest') ? runSelfTest() : runScan())
}
