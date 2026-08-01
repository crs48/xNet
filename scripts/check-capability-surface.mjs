#!/usr/bin/env node
/**
 * Every user-flippable capability has a surface a person could find it through
 * (exploration 0428, Charter §Agency).
 *
 * Cate Hall's definition of agency is the capacity to *both see and act on*
 * the degrees of freedom available to you. Every other check in this repo asks
 * whether the code is correct; none asks whether a shipped capability is
 * findable, so a feature could land reachable-but-invisible and no gate would
 * notice. The AI assist mode did exactly that: two modes in the runtime, a
 * charter promise that `draft` was "opt-in only", and no opt-in anywhere.
 *
 * Three rules, over apps/web/src/lib/capabilities.ts:
 *
 *   1. every `xnet:experiment:*` flag in the source is declared in the register
 *   2. every declared capability has ≥1 surface, or a written `hidden` reason
 *   3. every declared capability's key still appears in the source
 *
 * Rule 3 is not symmetry for its own sake. The first audit found a doc comment
 * in packages/workbench/src/state.ts advertising an
 * `xnet:experiment:layout-tree` flag that had been deleted in 59973833c once
 * the shell always rendered the tree. Stale prose describing a control nobody
 * can use is the same failure as a control nobody can see, pointed the other
 * way — so the register is checked in both directions.
 *
 * Comments are stripped before scanning, for the same reason: a flag named in
 * prose is documentation, not a capability, and treating it as one manufactures
 * phantom entries.
 *
 * Advisory by default (exit 0) so the first release is cheap; `--strict` turns
 * findings into failures. Scheduled to go strict — see exploration 0428.
 *
 * Run: `node scripts/check-capability-surface.mjs [--strict]`
 *      (or `pnpm check:capability-surface`)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())
const REGISTER = join(root, 'apps/web/src/lib/capabilities.ts')
const SCAN_DIRS = [join(root, 'apps'), join(root, 'packages')]
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.turbo', 'coverage', 'storybook-static'])
const EXT = new Set(['.ts', '.tsx'])

/** Rule 1's population: flags a user can flip, which must all be declared. */
const FLAG_RE = /xnet:experiment:[a-zA-Z0-9:._-]+/g
/**
 * Rule 3's population: any `xnet:*` storage key. Wider than FLAG_RE because
 * the register also declares non-flag capabilities (the AI assist mode is a
 * standing choice, not an experiment) and those must not go stale either.
 */
const KEY_RE = /xnet:[a-zA-Z0-9:._-]+/g

/** Recursively collect .ts/.tsx files, skipping build output. */
function collect(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out)
    } else if (EXT.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      out.push(full)
    }
  }
  return out
}

/**
 * Remove `//` and block comments so a flag named in prose is not mistaken for
 * a live capability. Deliberately naive — it does not parse strings containing
 * comment markers, which at worst hides a flag we would rather have seen, and
 * never invents one that is not there.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Parse the register's entries without importing TypeScript into a .mjs script. */
function parseRegister(source) {
  const body = source.slice(source.indexOf('export const CAPABILITIES'))
  const entries = []
  // Split on top-level entry boundaries: each entry opens with `key:`.
  const chunks = body.split(/\n\s{2}\{\n/).slice(1)
  for (const chunk of chunks) {
    const keyRef = chunk.match(/key:\s*([A-Z_][A-Z0-9_]*)/)
    const surfaceNull = /surface:\s*null/.test(chunk)
    const surfaceEmpty = /surface:\s*\[\s*\]/.test(chunk)
    const hidden = chunk.match(/hidden:\s*(['"`])((?:\\.|(?!\1).)*)\1/)
    entries.push({
      constant: keyRef?.[1] ?? '(unparsed)',
      surfaceNull,
      surfaceEmpty,
      hidden: hidden?.[2]?.trim() ?? ''
    })
  }
  return entries
}

/**
 * Resolve the register's imported key constants to their literal values by
 * reading the modules that define them. Keeps key constants living with their
 * features (the labs.ts rule) instead of duplicating literals here.
 */
function resolveKeyConstants(files) {
  const values = new Map()
  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'))
    const re = /export const ([A-Z_][A-Z0-9_]*)\s*(?::[^=]+)?=\s*(['"`])((?:\\.|(?!\2).)*)\2/g
    let match
    while ((match = re.exec(source))) {
      if (match[3].startsWith('xnet:')) values.set(match[1], match[3])
    }
  }
  return values
}

const files = collect(SCAN_DIRS[0]).concat(collect(SCAN_DIRS[1]))
const registerSource = readFileSync(REGISTER, 'utf8')
const entries = parseRegister(registerSource)
const constants = resolveKeyConstants(files)

const declared = new Map() // literal key -> entry
const unresolved = []
for (const entry of entries) {
  const literal = constants.get(entry.constant)
  if (literal) declared.set(literal, entry)
  else unresolved.push(entry.constant)
}

// Keys found in real code (not comments, not the register itself).
const foundFlags = new Map() // experiment flag -> first file that reads it
const foundKeys = new Map() // any xnet:* key -> first file that reads it
for (const file of files) {
  if (file === REGISTER) continue
  const source = stripComments(readFileSync(file, 'utf8'))
  const rel = relative(root, file)
  for (const flag of source.match(FLAG_RE) ?? []) {
    if (!foundFlags.has(flag)) foundFlags.set(flag, rel)
  }
  for (const key of source.match(KEY_RE) ?? []) {
    if (!foundKeys.has(key)) foundKeys.set(key, rel)
  }
}

const problems = []

// 1. Every flag in the source is declared.
for (const [flag, file] of foundFlags) {
  if (!declared.has(flag)) {
    problems.push(`${flag} is flippable (${file}) but absent from apps/web/src/lib/capabilities.ts`)
  }
}

// 2. Every declared capability has a surface, or a written reason it does not.
for (const [key, entry] of declared) {
  if (entry.surfaceEmpty) {
    problems.push(`${key} has an empty surface list — use \`surface: null\` with a \`hidden\` reason`)
  } else if (entry.surfaceNull && !entry.hidden) {
    problems.push(`${key} declares no surface and gives no \`hidden\` reason`)
  }
}

// 3. Every declared capability still exists in the source. An entry whose key
// constant no longer resolves is the stale-register case, and must be a
// finding rather than a silently-skipped row — otherwise deleting a feature
// leaves the register claiming it and the gate reporting all clear.
for (const constant of unresolved) {
  problems.push(
    `${constant} is declared in the register but no \`export const ${constant} = 'xnet:…'\` exists — stale entry?`
  )
}
for (const [key, entry] of declared) {
  if (!foundKeys.has(key)) {
    problems.push(
      `${key} is declared (${entry.constant}) but read nowhere in the source — stale register entry?`
    )
  }
}

// A register that resolved nothing means the parser drifted from the file; a
// silently-empty scan would report "all clear" for zero coverage.
if (entries.length > 0 && declared.size === 0) {
  problems.push(
    `parsed ${entries.length} register entries but resolved 0 keys — check-capability-surface.mjs needs updating`
  )
}

const strict = process.argv.includes('--strict')
if (problems.length === 0) {
  console.log(`✓ capability surfaces: ${declared.size} declared, all reachable`)
  process.exit(0)
}

const label = strict ? 'ERROR' : 'WARNING'
console.error(`${label}: ${problems.length} capability surface problem(s)\n`)
for (const problem of problems) console.error(`  • ${problem}`)
console.error(
  '\nCharter §Agency: a capability you cannot see is not a degree of freedom you have.' +
    '\nDeclare it in apps/web/src/lib/capabilities.ts with a surface, or say why it is internal.'
)
process.exit(strict ? 1 : 0)
