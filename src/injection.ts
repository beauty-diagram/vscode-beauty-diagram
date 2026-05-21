import { composeUrl } from './url-composer'
import { parseDirective } from './directives'
import { shortHash } from './hash'
import type { SourceFormat } from './types'

interface InjectOptions {
  theme: string
  hasApiKey: boolean
  apiBase?: string
  /** Return cached share id for this source/theme, or null. Plugin wires this. */
  shareIdForSource: (source: string, theme: string, sourceFormat: SourceFormat) => Promise<string | null>
}

// Match fenced code blocks for mermaid/plantuml
// Captures: [1] leading newline or empty, [2] type, [3] source content
const FENCE_RE = /(^|\n)```(mermaid|plantuml)\n([\s\S]*?)\n```/g

export async function injectEmbeds(markdown: string, opts: InjectOptions): Promise<string> {
  const fences: { startIdx: number; endIdx: number; type: SourceFormat; source: string }[] = []
  for (const m of markdown.matchAll(FENCE_RE)) {
    const leadOffset = m[1] ? 1 : 0
    fences.push({
      startIdx: m.index! + leadOffset,
      endIdx: m.index! + m[0].length,
      type: m[2] as SourceFormat,
      source: m[3],
    })
  }

  let out = markdown
  // Walk fences end-to-start so splicing later fences doesn't shift earlier indices.
  // "Diagram N" numbering is in document order; counter starts at fences.length.
  let counter = fences.length
  for (let i = fences.length - 1; i >= 0; i--) {
    const f = fences[i]
    const { overrides, source: cleanSource } = parseDirective(f.type, f.source)
    const theme = overrides.theme ?? opts.theme
    const hash = await shortHash(cleanSource + '\0' + theme + '\0' + f.type)

    // Look at what immediately follows this fence in the current `out` string.
    // Since we mutate `out` end-to-start, the fence position (startIdx/endIdx) for
    // this fence still refers to the ORIGINAL indices of `markdown`, but after
    // splicing later fences the content before this fence is unchanged.
    // We need to find where this fence ends in the current `out`.
    // Re-compute the fence's end in `out` — earlier fences (lower index) are unaffected
    // by changes we made to later fences (higher index), so f.endIdx is still valid.
    const afterFence = out.slice(f.endIdx)

    // Match the embed block that immediately follows (optional whitespace/newlines between fence and marker)
    const markerMatch = afterFence.match(
      /^(\n+)(<!-- bd:inline-img hash=([0-9a-f]{8}) -->[\s\S]*?<!-- \/bd:inline-img -->)\n?/
    )

    if (markerMatch && markerMatch[3] === hash) {
      // Idempotent: same hash, leave as-is
      counter--
      continue
    }

    const url = await urlForSource(cleanSource, theme, f.type, opts)
    const block = `\n\n<!-- bd:inline-img hash=${hash} -->\n![Diagram ${counter}](${url})\n<!-- /bd:inline-img -->`

    if (markerMatch) {
      // Replace stale marker block (preserve the leading newlines before the marker)
      const markerStartInAfter = markerMatch[1].length // skip leading newlines
      const markerLen = markerMatch[2].length + (markerMatch[0].endsWith('\n') ? 1 : 0)
      // markerMatch[0] is: leadingNewlines + marker block + optional trailing newline
      out =
        out.slice(0, f.endIdx) +
        block +
        out.slice(f.endIdx + markerMatch[0].length)
    } else {
      out = out.slice(0, f.endIdx) + block + out.slice(f.endIdx)
    }
    counter--
  }

  return out
}

async function urlForSource(
  source: string,
  theme: string,
  sourceFormat: SourceFormat,
  opts: InjectOptions
): Promise<string> {
  const cached = await opts.shareIdForSource(source, theme, sourceFormat)
  if (cached) {
    const base = opts.apiBase ?? 'https://api.beauty-diagram.com'
    return `${base}/v1/share/${cached}.svg`
  }
  const r = composeUrl({ source, theme, sourceFormat, hasApiKey: opts.hasApiKey, apiBase: opts.apiBase })
  if (r.kind === 'anonymous') return r.url
  // Anonymous over-size path: returns sentinel so caller / <img> error UI can react.
  return '#bd-error-needs-share'
}

export async function cleanEmbeds(markdown: string): Promise<string> {
  // Strategy: for each embed marker block, look at the text immediately preceding it.
  // If the preceding non-blank content ends with a closing fence ```, keep. Otherwise remove.
  const markerRe = /(?:^|\n)(<!-- bd:inline-img hash=[0-9a-f]{8} -->\n[\s\S]*?\n<!-- \/bd:inline-img -->\n?)/g
  let out = ''
  let last = 0
  for (const m of markdown.matchAll(markerRe)) {
    const block = m[1]
    // blockStart is the index in markdown where the block itself starts (excluding leading \n)
    const blockStart = m.index! + (m[0].length - block.length)
    const before = markdown.slice(0, blockStart)
    const trimmedBefore = before.trimEnd()
    const hasFence = trimmedBefore.endsWith('```')
    out += markdown.slice(last, blockStart)
    if (hasFence) out += block
    last = blockStart + block.length
  }
  out += markdown.slice(last)
  return out
}
