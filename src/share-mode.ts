// share-mode — pure module for the per-page `bd-share` opt-in marker.
//
// See spec §4 for the front-matter format. This module deliberately
// avoids a third-party YAML library — the surface area we touch is
// tiny (a single top-level boolean key + an adjacent comment line)
// and bundling a parser is overkill for both Obsidian and VS Code.
//
// Parsing is strict:
//   - `bd-share: true`        → share mode  (literal boolean true)
//   - `bd-share: "true"`      → anonymous   (string, not boolean)
//   - `bd-share: True`        → anonymous   (capitalized, not YAML 1.2 boolean)
//   - `bd-share: [true]`      → anonymous   (array, not scalar)
//   - bd-share missing        → anonymous
//   - malformed front-matter  → anonymous   (silent fallback, never throws)

export type PageMode = 'anonymous' | 'share'

/** The single-line comment we inject above the `bd-share` key. */
export const SHARE_COMMENT_LINE =
  '# Beauty Diagram: share-mode (watermark-free preview, consumes share quota per unique diagram).'

/** Match any `# Beauty Diagram:` comment line (tolerant of the exact phrasing). */
const SHARE_COMMENT_RE = /^# Beauty Diagram:.*$/

/** Match the literal-true value form, with optional trailing whitespace + inline YAML comment. */
const BD_SHARE_TRUE_RE = /^bd-share:\s+true\s*(?:#.*)?$/

/** Match any top-level `bd-share:` line (for stripping, regardless of value). */
const BD_SHARE_KEY_RE = /^bd-share:/

/** Front-matter block at document start: `---\n...\n---\n?` with optional CRLF. */
const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** Read the `bd-share` mode from a document's YAML front-matter. */
export function parsePageMode(doc: string): PageMode {
  const m = doc.match(FRONT_MATTER_RE)
  if (!m) return 'anonymous'
  const lines = m[1].split(/\r?\n/)
  for (const line of lines) {
    if (BD_SHARE_TRUE_RE.test(line)) return 'share'
  }
  return 'anonymous'
}

/**
 * Add or remove the `bd-share: true` marker (plus its explanatory comment
 * line) in the document's YAML front-matter. Idempotent: calling twice
 * with the same mode yields the same result. Tolerant: missing comment,
 * `bd-share: false`, or hand-edited markers all converge back to the
 * canonical form.
 */
export function setPageShareMode(doc: string, mode: PageMode): string {
  const m = doc.match(FRONT_MATTER_RE)

  if (mode === 'share') {
    if (!m) {
      // No existing front-matter — create a fresh block, prepend to doc.
      return `---\n${SHARE_COMMENT_LINE}\nbd-share: true\n---\n${doc}`
    }
    // Strip any pre-existing bd-share key + Beauty Diagram comment,
    // then re-append in canonical order so `set on` is idempotent.
    const stripped = stripBdShareLines(m[1])
    const body =
      (stripped ? `${stripped}\n` : '') + `${SHARE_COMMENT_LINE}\nbd-share: true`
    return rebuildFrontMatter(doc, m, body)
  }

  // mode === 'anonymous'
  if (!m) return doc // nothing to remove
  const stripped = stripBdShareLines(m[1])
  if (stripped === m[1]) return doc // no change
  if (stripped.length === 0) {
    // Front-matter became empty — drop the `---/---` fence entirely,
    // and trim the blank line that typically follows the fence so we
    // don't leave a leading newline on the document body.
    return doc.slice(m[0].length).replace(/^\r?\n+/, '')
  }
  return rebuildFrontMatter(doc, m, stripped)
}

function stripBdShareLines(fmBody: string): string {
  const lines = fmBody.split(/\r?\n/)
  const kept = lines.filter(
    (line) => !BD_SHARE_KEY_RE.test(line) && !SHARE_COMMENT_RE.test(line),
  )
  return kept.join('\n')
}

function rebuildFrontMatter(
  doc: string,
  match: RegExpMatchArray,
  newBody: string,
): string {
  const after = doc.slice(match[0].length)
  // Preserve the document's line-ending style for the `---` fences.
  const eol = doc.includes('\r\n') ? '\r\n' : '\n'
  return `---${eol}${newBody}${eol}---${eol}${after}`
}
