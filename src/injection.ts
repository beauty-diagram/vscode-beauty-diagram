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
  /**
   * Optional inline style string applied to every injected `<img>` (e.g.
   * `"max-width: 800px"`). When present, the embed marker switches from
   * markdown image syntax `![]()` to HTML `<img>` form to carry the
   * style. Callers compute this from the page's `bd-width` front-matter
   * (via `resolveEffectiveWidth` + `widthToInlineStyle`); when null /
   * empty / "full" the embed stays in markdown form for parity with the
   * `bd` CLI's `extract --share` output.
   */
  widthStyle?: string | null
  /**
   * When true, only refresh the inline `style` attribute on existing
   * hash-matching embed markers — never mint new share URLs, never add
   * new embeds to fences that don't have one. Used by the "Set image
   * width for this page" command so changing `bd-width` instantly
   * updates the visual size of already-published embeds without
   * silently consuming a fresh share quota for each fence.
   */
  refreshOnly?: boolean
}

/**
 * Build the full inline style value for the embed `<img>`. Appends
 * `display: block` so multiple narrow embeds stack vertically instead
 * of laying out as inline siblings on a single row (which is what most
 * markdown renderers default to for adjacent `<img>` tags).
 */
function buildImgStyle(widthStyle: string | null | undefined): string {
  if (!widthStyle) return ''
  return `${widthStyle}; display: block`
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

    const fullStyle = buildImgStyle(opts.widthStyle)
    const escapedDesiredStyle = fullStyle ? escapeHtmlAttr(fullStyle) : ''

    if (markerMatch && markerMatch[3] === hash) {
      // Hash matches → source/theme/format unchanged. But the marker
      // body might still be stale if the user changed `bd-width` since
      // the last inject: an old `![]()` markdown embed has no style
      // hook and won't shrink to the new max-width. Detect any drift
      // between the existing embed's inline style and the desired one;
      // if they agree, the embed is truly idempotent and we skip.
      const existingBody = markerMatch[2]
      const existingStyleMatch = existingBody.match(/<img\b[^>]*\bstyle="([^"]*)"/)
      const existingStyle = existingStyleMatch ? existingStyleMatch[1] : ''
      if (existingStyle === escapedDesiredStyle) {
        counter--
        continue
      }
      // Style differs — fall through to rewrite. In refreshOnly mode
      // we reuse the existing URL to avoid silently minting a fresh
      // share token (which would consume an extra share quota and
      // orphan the URL already published in the markdown).
      if (opts.refreshOnly) {
        const existingUrl =
          existingBody.match(/<img\b[^>]*\bsrc="([^"]*)"/)?.[1] ??
          existingBody.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1]
        if (existingUrl) {
          const inner = fullStyle
            ? `<img alt="Diagram ${counter}" src="${existingUrl}" style="${escapedDesiredStyle}">`
            : `![Diagram ${counter}](${existingUrl})`
          const block = `\n\n<!-- bd:inline-img hash=${hash} -->\n${inner}\n<!-- /bd:inline-img -->`
          out = out.slice(0, f.endIdx) + block + out.slice(f.endIdx + markerMatch[0].length)
        }
        counter--
        continue
      }
    } else if (opts.refreshOnly) {
      // refresh-only mode + no hash-matching marker → don't add new
      // embeds and don't replace stale-hash markers. The regular
      // "Embed share URLs into this note" command handles those.
      counter--
      continue
    }

    const url = await urlForSource(cleanSource, theme, f.type, opts)
    const inner = fullStyle
      ? `<img alt="Diagram ${counter}" src="${url}" style="${escapedDesiredStyle}">`
      : `![Diagram ${counter}](${url})`
    const block = `\n\n<!-- bd:inline-img hash=${hash} -->\n${inner}\n<!-- /bd:inline-img -->`

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
  // Phase 1 of share-mode spec: inject command's "has API key" pre-condition
  // maps directly to share mode (caller already gated the path). Phase 2
  // will leave inject's behavior intact — inject is the "publish artifact"
  // path that always uses share URLs, distinct from preview share-mode.
  const mode = opts.hasApiKey ? 'share' : 'anonymous'
  const r = composeUrl({ source, theme, sourceFormat, mode, apiBase: opts.apiBase })
  if (r.kind === 'anonymous') return r.url
  // Anonymous over-size path: returns sentinel so caller / <img> error UI can react.
  return '#bd-error-needs-share'
}

/**
 * Minimal HTML attribute escaper for the inline style we own (we never
 * accept arbitrary user input here — `widthStyle` comes from our own
 * `widthToInlineStyle` whitelist — but defense-in-depth in case the
 * settings module ever loosens validation).
 */
function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
