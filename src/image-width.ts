// image-width — pure module for the per-page `bd-width` override marker.
//
// Adds an opt-in front-matter field that controls the max-width of every
// rendered diagram inside the page. Cascade:
//
//   1. front-matter `bd-width: <value>` (this module)
//   2. plugin setting `defaultImageWidth`               ← caller decides
//   3. CSS default `.bd-img { max-width: 100% }`        ← fallback
//
// Accepted values (anything else is treated as missing and falls back):
//
//   bd-width: full       → 'full'      (semantic alias for max-width: 100%)
//   bd-width: 800px      → '800px'
//   bd-width: 75%        → '75%'
//   bd-width: 40em       → '40em'
//   bd-width: 28rem      → '28rem'
//
// Rejected (silent fallback to null):
//
//   bd-width:                  (empty value)
//   bd-width: 800              (no unit)
//   bd-width: javascript:...   (anything not matching unit regex — XSS guard)
//   bd-width: -100px           (negative)
//   missing front-matter
//   malformed front-matter
//
// The four presets surfaced in plugin UI / palette pickers:
//
//   Full     → 'full'   (no inline style emitted; lets CSS default apply)
//   Wide     → '800px'
//   Medium   → '640px'
//   Narrow   → '480px'

export type ImageWidthValue = string // 'full' | '<n>px' | '<n>%' | '<n>em' | '<n>rem'

/** The four preset choices surfaced in the picker UI. */
export const IMAGE_WIDTH_PRESETS: ReadonlyArray<{
  id: 'full' | 'wide' | 'medium' | 'narrow'
  label: string
  value: ImageWidthValue
}> = [
  { id: 'full', label: 'Full', value: 'full' },
  { id: 'wide', label: 'Wide — 800px', value: '800px' },
  { id: 'medium', label: 'Medium — 640px', value: '640px' },
  { id: 'narrow', label: 'Narrow — 480px', value: '480px' },
]

/** The single-line comment we inject above the `bd-width` key. */
export const WIDTH_COMMENT_LINE =
  '# Beauty Diagram: per-page diagram max-width override.'

/** Match any `# Beauty Diagram:` comment line (tolerant of the exact phrasing). */
const WIDTH_COMMENT_RE = /^# Beauty Diagram:.*$/

/** Match `bd-width:` followed by an accepted value form. */
const BD_WIDTH_LINE_RE =
  /^bd-width:\s+(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*(?:#.*)?$/

/** Match any top-level `bd-width:` line (for stripping, regardless of value). */
const BD_WIDTH_KEY_RE = /^bd-width:/

/** Front-matter block at document start: `---\n...\n---\n?` with optional CRLF. */
const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** Whitelist regex for accepted width values (semantic + CSS-length subset). */
const VALID_VALUE_RE = /^(full|\d+(?:\.\d+)?(?:px|%|em|rem))$/

/**
 * Read the `bd-width` value from a document's YAML front-matter.
 * Returns the validated value (e.g. `'800px'`, `'full'`) or `null` when
 * absent / malformed / rejected by the whitelist.
 */
export function parsePageWidth(doc: string): ImageWidthValue | null {
  const m = doc.match(FRONT_MATTER_RE)
  if (!m) return null
  const lines = m[1].split(/\r?\n/)
  for (const line of lines) {
    const valueMatch = BD_WIDTH_LINE_RE.exec(line)
    if (!valueMatch) continue
    const raw = (valueMatch[1] ?? valueMatch[2] ?? valueMatch[3] ?? '').trim()
    if (VALID_VALUE_RE.test(raw)) return raw
    return null // matched key but value rejected — silent fallback
  }
  return null
}

/**
 * Add, replace, or remove the `bd-width` marker (plus its explanatory
 * comment line) in the document's YAML front-matter. Idempotent: calling
 * twice with the same value yields the same result. Pass `null` to
 * remove the override entirely.
 */
export function setPageWidth(doc: string, value: ImageWidthValue | null): string {
  const m = doc.match(FRONT_MATTER_RE)

  if (value !== null) {
    // Defensive: reject anything outside the whitelist. Caller bug if
    // we ever hit this in practice (the picker only emits valid presets),
    // but never write user-controllable text into front-matter raw.
    if (!VALID_VALUE_RE.test(value)) {
      throw new Error(`Invalid bd-width value: ${JSON.stringify(value)}`)
    }
    if (!m) {
      // No existing front-matter — create a fresh block, prepend to doc.
      return `---\n${WIDTH_COMMENT_LINE}\nbd-width: ${value}\n---\n${doc}`
    }
    const stripped = stripBdWidthLines(m[1])
    const body =
      (stripped ? `${stripped}\n` : '') + `${WIDTH_COMMENT_LINE}\nbd-width: ${value}`
    return rebuildFrontMatter(doc, m, body)
  }

  // value === null — remove the override entirely.
  if (!m) return doc
  const stripped = stripBdWidthLines(m[1])
  if (stripped === m[1]) return doc
  if (stripped.length === 0) {
    return doc.slice(m[0].length).replace(/^\r?\n+/, '')
  }
  return rebuildFrontMatter(doc, m, stripped)
}

/**
 * Resolve the effective width for a page render. Pure cascade:
 *
 *   pageOverride (front-matter)  →  settingDefault  →  'full'
 *
 * Caller uses the result to decide whether to emit an inline `max-width`
 * style on the rendered `<img>`. `'full'` means emit nothing.
 */
export function resolveEffectiveWidth(
  pageOverride: ImageWidthValue | null,
  settingDefault: ImageWidthValue | null,
): ImageWidthValue {
  if (pageOverride && VALID_VALUE_RE.test(pageOverride)) return pageOverride
  if (settingDefault && VALID_VALUE_RE.test(settingDefault)) return settingDefault
  return 'full'
}

/**
 * Format the effective width as an inline style fragment for the `<img>`
 * tag, or return an empty string when the effective width is `'full'`
 * (so the CSS default `max-width: 100%` applies).
 */
export function widthToInlineStyle(value: ImageWidthValue): string {
  if (value === 'full') return ''
  // Defensive whitelist check at the boundary (don't emit user-controlled
  // text into the HTML attribute, even though parsePageWidth already
  // filters it).
  if (!VALID_VALUE_RE.test(value)) return ''
  return `max-width: ${value};`
}

function stripBdWidthLines(fmBody: string): string {
  const lines = fmBody.split(/\r?\n/)
  // Only strip our specific Beauty Diagram width comment, not other
  // # Beauty Diagram: comments (e.g. the bd-share one).
  const kept = lines.filter((line, idx) => {
    if (BD_WIDTH_KEY_RE.test(line)) return false
    // Strip the width comment ONLY if it directly precedes a bd-width line.
    if (WIDTH_COMMENT_RE.test(line) && line.includes('diagram max-width')) {
      const next = lines[idx + 1]
      if (next && BD_WIDTH_KEY_RE.test(next)) return false
    }
    return true
  })
  return kept.join('\n')
}

function rebuildFrontMatter(
  doc: string,
  match: RegExpMatchArray,
  newBody: string,
): string {
  const after = doc.slice(match[0].length)
  const eol = doc.includes('\r\n') ? '\r\n' : '\n'
  return `---${eol}${newBody}${eol}---${eol}${after}`
}
