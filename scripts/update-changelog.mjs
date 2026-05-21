#!/usr/bin/env node
// Generate a CHANGELOG.md section from conventional commits since the
// previous git tag. Invoked by the npm `version` lifecycle script.
//
// Convention: commits in the form `<type>(<scope>): <desc>` get grouped
// by type. The release: bump commit itself is excluded.

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const newVersion = process.env.npm_package_version
if (!newVersion) {
  console.error('update-changelog: npm_package_version not set — invoke via `npm version`')
  process.exit(1)
}

function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf8' }).trim()
}

// Find the previous tag. If none exists, fall back to the repo's root commit.
let previousRef
try {
  // HEAD^ so we don't accidentally pick a tag on the current commit itself
  previousRef = git('describe --tags --abbrev=0 HEAD^')
} catch {
  try {
    previousRef = git('rev-list --max-parents=0 HEAD').split('\n')[0]
  } catch {
    console.error('update-changelog: could not determine previous ref')
    process.exit(1)
  }
}

const range = `${previousRef}..HEAD`
const log = git(`log ${range} --pretty=format:%s --no-merges`)

if (!log) {
  console.log(`update-changelog: no commits between ${previousRef} and HEAD`)
  process.exit(0)
}

const lines = log
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  // Skip the release bump itself (added by `npm version` via the version script)
  .filter((l) => !/^release:/i.test(l))

if (lines.length === 0) {
  console.log('update-changelog: only release commits in range, nothing to log')
  process.exit(0)
}

const PREFIX_RE = /^(\w+)(?:\([^)]+\))?!?:\s*(.+)$/

const groups = {
  feat: [],
  fix: [],
  perf: [],
  refactor: [],
  docs: [],
  test: [],
  ci: [],
  chore: [],
  other: [],
}

// Escape characters that vsce / markdown renderers misinterpret. Literal
// `<img>` or `<svg>` in prose otherwise get parsed as HTML img/svg tags
// with no src, which `vsce package` rejects with "Images in CHANGELOG.md
// must have a source."
function escapeMd(s) {
  return s.replace(/</g, '\\<').replace(/>/g, '\\>')
}

for (const line of lines) {
  const m = line.match(PREFIX_RE)
  if (m && groups[m[1].toLowerCase()]) {
    groups[m[1].toLowerCase()].push({ scope: extractScope(line), desc: escapeMd(m[2]) })
  } else {
    groups.other.push({ scope: null, desc: escapeMd(line) })
  }
}

function extractScope(line) {
  const m = line.match(/^\w+\(([^)]+)\)/)
  return m ? m[1] : null
}

const labels = {
  feat: 'Features',
  fix: 'Fixes',
  perf: 'Performance',
  refactor: 'Refactors',
  docs: 'Docs',
  test: 'Tests',
  ci: 'CI',
  chore: 'Chores',
  other: 'Other',
}

const today = new Date().toISOString().slice(0, 10)
let section = `## ${newVersion} — ${today}\n\n`

let totalEmitted = 0
for (const [type, items] of Object.entries(groups)) {
  if (items.length === 0) continue
  section += `### ${labels[type]}\n\n`
  for (const item of items) {
    section += `- ${item.scope ? `**${item.scope}**: ` : ''}${item.desc}\n`
    totalEmitted++
  }
  section += '\n'
}

// Prepend to CHANGELOG.md. Preserve the file's leading `# Changelog` header
// if present so the new section sits below it, above older releases.
const path = 'CHANGELOG.md'
const existing = existsSync(path) ? readFileSync(path, 'utf8') : '# Changelog\n\n'

const headerMatch = existing.match(/^(#\s+[^\n]*\n+)/)
const header = headerMatch ? headerMatch[0] : '# Changelog\n\n'
const body = existing.slice(header.length)

writeFileSync(path, header + section + body)
console.log(
  `update-changelog: prepended ${newVersion} section with ${totalEmitted} entry(ies) ` +
    `from commits since ${previousRef}`,
)
