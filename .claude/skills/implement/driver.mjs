#!/usr/bin/env node
/**
 * implement/driver.mjs — bookkeeping for the /implement loop.
 *
 * The AGENT does the actual implementation (edits code, runs tests, commits).
 * This driver is its hands for the mechanical, error-prone parts:
 *   - find the spec to implement (an /explore doc by default)
 *   - report checklist progress so the loop knows what's left
 *   - flip a checklist item to done as each piece lands
 *   - rename the doc [_] -> [x] once everything is checked
 *
 * Zero deps. Run from the repo root:
 *   node .claude/skills/implement/driver.mjs <command> [args]
 *
 * Commands:
 *   find [query]      Print the path of the exploration to implement.
 *                     No query  -> highest-numbered UNIMPLEMENTED ([_]) doc.
 *                     query      -> match by number (e.g. 0212) or title substring.
 *   status <path>     Print Implementation/Validation checklist progress
 *                     and list the remaining unchecked items.
 *   check <path> <substring>
 *                     Flip the single unchecked "- [ ]" item whose text
 *                     contains <substring> to "- [x]". Errors if the match
 *                     is missing or ambiguous.
 *   done <path>       Rename the doc [_] -> [x] (git mv) once every checkbox
 *                     is checked. Refuses if any "- [ ]" remain. Prints the
 *                     suggested check-off commit message.
 *   branch <path>     Suggest a conventional branch name derived from the doc.
 */

import { readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { execFileSync } from 'node:child_process'

const EXPLORE_DIR = 'docs/explorations'
const CHECK_ITEM = /^(\s*)- \[( |x|X)\]\s?(.*)$/

// ─── helpers ──────────────────────────────────────────────────────────

function die(msg) {
  console.error(`error: ${msg}`)
  process.exit(1)
}

function listExplorations() {
  let names
  try {
    names = readdirSync(EXPLORE_DIR)
  } catch {
    die(`cannot read ${EXPLORE_DIR} — run from the repo root`)
  }
  return names
    .filter((n) => /^\d{4}_\[.\]_.*\.md$/.test(n))
    .map((n) => {
      const m = n.match(/^(\d{4})_\[(.)\]_(.*)\.md$/)
      return {
        file: n,
        path: join(EXPLORE_DIR, n),
        num: Number(m[1]),
        numStr: m[1],
        done: m[2].toLowerCase() === 'x',
        title: m[3]
      }
    })
    .sort((a, b) => b.num - a.num || a.file.localeCompare(b.file))
}

function parseChecklists(text) {
  const lines = text.split('\n')
  const sections = {}
  let current = null
  for (const line of lines) {
    const h = line.match(/^##\s+(.*?)\s*$/)
    if (h) {
      const name = h[1].toLowerCase()
      if (name.includes('implementation checklist')) current = 'implementation'
      else if (name.includes('validation checklist')) current = 'validation'
      else current = null
      if (current) sections[current] = []
      continue
    }
    if (!current) continue
    const c = line.match(CHECK_ITEM)
    if (c) sections[current].push({ checked: c[2].toLowerCase() === 'x', text: c[3].trim() })
  }
  return sections
}

function summarize(items = []) {
  const done = items.filter((i) => i.checked).length
  return { done, total: items.length, remaining: items.filter((i) => !i.checked) }
}

// ─── commands ─────────────────────────────────────────────────────────

function cmdFind(query) {
  const docs = listExplorations()
  if (!docs.length) die('no explorations found')
  if (!query) {
    const pending = docs.filter((d) => !d.done)
    const pick = (pending[0] || docs[0]).path
    console.log(pick)
    return
  }
  const q = query.toLowerCase()
  const byNum = docs.filter((d) => d.numStr === q.padStart(4, '0'))
  const matches = byNum.length ? byNum : docs.filter((d) => d.title.toLowerCase().includes(q))
  if (!matches.length) die(`no exploration matches "${query}"`)
  if (matches.length > 1) {
    console.error(`ambiguous — ${matches.length} matches:`)
    for (const m of matches) console.error(`  ${m.path}`)
    process.exit(1)
  }
  console.log(matches[0].path)
}

function cmdStatus(path) {
  if (!path) die('usage: status <path>')
  const text = readFileSync(path, 'utf8')
  const s = parseChecklists(text)
  const impl = summarize(s.implementation)
  const val = summarize(s.validation)
  const docDone = basename(path).includes('_[x]_')
  console.log(`doc: ${path}`)
  console.log(`status box: ${docDone ? '[x] implemented' : '[_] not implemented'}`)
  console.log(`implementation: ${impl.done}/${impl.total}`)
  console.log(`validation:     ${val.done}/${val.total}`)
  const allRemaining = [...impl.remaining, ...val.remaining]
  if (allRemaining.length) {
    console.log(`\nremaining (${allRemaining.length}):`)
    for (const r of impl.remaining) console.log(`  [impl] ${r.text}`)
    for (const r of val.remaining) console.log(`  [val]  ${r.text}`)
  } else {
    console.log('\nall checklist items checked — run `done` to mark the doc [x].')
  }
}

function cmdCheck(path, substring) {
  if (!path || !substring) die('usage: check <path> <substring>')
  const text = readFileSync(path, 'utf8')
  const lines = text.split('\n')
  const hits = []
  lines.forEach((line, i) => {
    const c = line.match(CHECK_ITEM)
    if (c && c[2] === ' ' && line.toLowerCase().includes(substring.toLowerCase())) hits.push(i)
  })
  if (!hits.length) die(`no unchecked item contains "${substring}"`)
  if (hits.length > 1) {
    console.error(`ambiguous — ${hits.length} unchecked items match "${substring}":`)
    for (const i of hits) console.error(`  ${lines[i].trim()}`)
    process.exit(1)
  }
  const i = hits[0]
  lines[i] = lines[i].replace(/- \[ \]/, '- [x]')
  writeFileSync(path, lines.join('\n'))
  console.log(`checked: ${lines[i].trim()}`)
}

function cmdDone(path) {
  if (!path) die('usage: done <path>')
  const text = readFileSync(path, 'utf8')
  const s = parseChecklists(text)
  const remaining = [...summarize(s.implementation).remaining, ...summarize(s.validation).remaining]
  if (remaining.length) {
    console.error(`refusing: ${remaining.length} checklist item(s) still unchecked:`)
    for (const r of remaining) console.error(`  ${r.text}`)
    process.exit(1)
  }
  const dir = dirname(path)
  const file = basename(path)
  if (file.includes('_[x]_')) {
    console.log('already marked [x] — nothing to do')
    return
  }
  const next = file.replace('_[_]_', '_[x]_')
  const newPath = join(dir, next)
  try {
    execFileSync('git', ['mv', path, newPath], { stdio: 'pipe' })
  } catch {
    renameSync(path, newPath) // not tracked / not a git checkout
  }
  const topic = next
    .replace(/^\d{4}_\[x\]_/, '')
    .replace(/\.md$/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
  console.log(`renamed -> ${newPath}`)
  console.log(`commit:  docs(exploration): check off ${topic}`)
}

function cmdBranch(path) {
  if (!path) die('usage: branch <path>')
  const file = basename(path)
  const m = file.match(/^(\d{4})_\[.\]_(.*)\.md$/)
  if (!m) die('not an exploration filename')
  const slug = m[2].toLowerCase().replace(/_/g, '-').slice(0, 48).replace(/-+$/, '')
  console.log(`claude/${m[1]}-${slug}`)
}

// ─── dispatch ─────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2)
switch (cmd) {
  case 'find':
    cmdFind(rest[0])
    break
  case 'status':
    cmdStatus(rest[0])
    break
  case 'check':
    cmdCheck(rest[0], rest.slice(1).join(' '))
    break
  case 'done':
    cmdDone(rest[0])
    break
  case 'branch':
    cmdBranch(rest[0])
    break
  default:
    console.error(
      'commands: find [query] | status <path> | check <path> <substring> | done <path> | branch <path>'
    )
    process.exit(1)
}
