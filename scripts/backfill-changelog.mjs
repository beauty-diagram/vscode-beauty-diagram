#!/usr/bin/env node
// One-off backfill: iterate through every git tag (oldest → newest),
// generate a CHANGELOG section for each from the conventional commits
// since the previous tag, write the full result to CHANGELOG.md.
//
// Run from repo root: `node scripts/backfill-changelog.mjs`
// Idempotent — overwrites CHANGELOG.md each run, no commit/push side effects.

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf8' }).trim()
}

// All tags sorted by their commit date (oldest first).
const tags = git('tag --sort=creatordate').split('\n').filter(Boolean)
if (tags.length === 0) {
  console.error('backfill-changelog: no tags found')
  process.exit(1)
}

const PREFIX_RE = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/

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

function sectionFor(tag, prevTag) {
  const range = prevTag ? `${prevTag}..${tag}` : tag
  const log = git(`log ${range} --pretty=format:%s --no-merges`)
  if (!log) return null

  const lines = log
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^release:/i.test(l))

  if (lines.length === 0) return null

  const groups = Object.fromEntries(Object.keys(labels).map((k) => [k, []]))

  for (const line of lines) {
    const m = line.match(PREFIX_RE)
    if (m && groups[m[1].toLowerCase()]) {
      groups[m[1].toLowerCase()].push({ scope: m[2] || null, desc: m[3] })
    } else {
      groups.other.push({ scope: null, desc: line })
    }
  }

  const tagDate = git(`log -1 --pretty=format:%cs ${tag}`)
  let section = `## ${tag} — ${tagDate}\n\n`
  for (const [type, items] of Object.entries(groups)) {
    if (items.length === 0) continue
    section += `### ${labels[type]}\n\n`
    for (const item of items) {
      section += `- ${item.scope ? `**${item.scope}**: ` : ''}${item.desc}\n`
    }
    section += '\n'
  }
  return section
}

const sections = []
let prev = null
for (const tag of tags) {
  const s = sectionFor(tag, prev)
  if (s) sections.push(s)
  prev = tag
}

// Newest first
sections.reverse()

const header = `# Changelog

All notable changes are documented here. Generated from conventional
commits via \`scripts/update-changelog.mjs\` on each \`npm version\` bump.

`

writeFileSync('CHANGELOG.md', header + sections.join(''))
console.log(`backfill-changelog: wrote ${sections.length} section(s) covering tags:`, tags.join(', '))
