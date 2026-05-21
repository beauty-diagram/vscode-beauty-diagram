import type MarkdownIt from 'markdown-it'
import { composeUrl } from './url-composer'
import { parseDirective } from './directives'
import { parsePageMode } from './share-mode'
import { editorLink } from './editor-link'
import { getConfig } from './settings'
import { ANON_SOURCE_BYTE_CAP } from './constants'
import { shortHashSync } from './hash'
import type { ShareCache } from './share-cache'
import type { PageMode, SourceFormat } from './types'

/**
 * Optional context the extension activates with. When present, the fence
 * rule can satisfy share-mode renders synchronously by reading from the
 * shared cache (pre-populated by the toggle command's pre-fetch step).
 * Tests intentionally don't set this — they exercise the anonymous-only
 * path. See docs/superpowers/plans/2026-05-21-plugin-share-mode.md
 * Phase 3 for the architecture choice (spike #3.1 confirmed VS Code
 * built-in markdown preview rejects bidirectional webview messaging).
 */
interface BdShareContext {
  cache: ShareCache
  /** Lazy accessor for the current API key; mirror of the obsidian
   *  plugin's getApi() pattern to avoid stale snapshots on key rotation. */
  getApiKey: () => string
}

let context: BdShareContext | null = null

/** Called by extension.ts at activate (and on settings change) so the
 *  fence rule can do synchronous cache lookups. Safe to omit in tests. */
export function setBdShareContext(ctx: BdShareContext | null): void {
  context = ctx
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function firstLine(s: string): string {
  for (const line of s.split('\n')) {
    const t = line.trim()
    if (t) return t.slice(0, 80)
  }
  return 'Diagram'
}

function buildShareUrl(apiBase: string, token: string, bg?: 'transparent'): string {
  const base = `${apiBase}/v1/share/${token}.svg`
  return bg === 'transparent' ? `${base}?bg=transparent` : base
}

/**
 * Render the diagram <img> wrapped in a positioned container with a hover-
 * revealed "Open in editor" badge — mirrors the Obsidian plugin's UX in the
 * Reading View. VS Code markdown preview lets external <a href> open the
 * system browser, so this works without needing a webview script (which we
 * couldn't ship anyway — see Phase 3.1 spike).
 *
 * Note: CSS for `.bd-block` + `.bd-edit-badge` lives in styles/preview.css,
 * contributed via package.json `contributes.markdown.previewStyles`.
 */
function renderDiagramBlock(opts: {
  src: string
  alt: string
  source: string
  theme: string
  sourceFormat: SourceFormat
  mode: PageMode
}): string {
  const editUrl = editorLink({
    source: opts.source,
    theme: opts.theme,
    sourceFormat: opts.sourceFormat,
  })
  return (
    `<span class="bd-block">` +
    `<img class="bd-img" src="${escapeHtml(opts.src)}" alt="${opts.alt}" data-bd-source-format="${opts.sourceFormat}" data-bd-mode="${opts.mode}" />` +
    `<a class="bd-edit-badge" href="${escapeHtml(editUrl)}" target="_blank" rel="noopener noreferrer" ` +
    `aria-label="Open this diagram's source in the Beauty Diagram editor (edits don't sync back to this file)">` +
    `↗ Open in editor</a>` +
    `</span>\n`
  )
}

export function bdMarkdownItPlugin(md: MarkdownIt): void {
  // Pre-parse the raw source for our `bd-share: true` front-matter marker
  // so the fence rule (synchronous, no awaits) knows whether to attempt
  // the share path. parsePageMode is the same pure module used by Obsidian.
  // The env object is propagated by markdown-it from md.parse → renderer.rules,
  // letting us communicate state across rule boundaries without globals.
  md.core.ruler.before('normalize', 'bd-share-mode', (state) => {
    ;(state.env as { bdShareMode?: PageMode }).bdShareMode = parsePageMode(state.src)
  })

  const defaultFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const info = (token.info || '').trim().toLowerCase()

    if (info !== 'mermaid' && info !== 'plantuml') {
      return defaultFence
        ? defaultFence(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options)
    }
    const sourceFormat = info as SourceFormat

    if (sourceFormat === 'mermaid' && !getConfig('replaceMermaid')) {
      return defaultFence
        ? defaultFence(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options)
    }
    if (sourceFormat === 'plantuml' && !getConfig('handlePlantuml')) {
      return defaultFence
        ? defaultFence(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options)
    }

    const apiBase = getConfig('apiBase')
    const { overrides, source: cleanSource } = parseDirective(sourceFormat, token.content)
    const theme = overrides.theme ?? getConfig('defaultTheme')
    const bg = overrides.bg === 'transparent' ? ('transparent' as const) : undefined

    const pageMode: PageMode = (env as { bdShareMode?: PageMode }).bdShareMode ?? 'anonymous'

    // share mode + extension context wired + cache hit → emit /v1/share/<token>.svg
    // share mode + cache miss → fall through to anonymous and prepend a hint
    //   (the user needs to run `Beauty Diagram: Toggle share mode` to pre-fetch
    //    tokens for this file; a fresh-open of a file that already has
    //    `bd-share: true` from git will hit this path on first preview).
    let shareHint = ''
    if (pageMode === 'share' && context) {
      const ownerTag = shortHashSync('owner:' + context.getApiKey())
      const cachedToken = context.cache.getSync(cleanSource, theme, sourceFormat, ownerTag)
      if (cachedToken) {
        const url = buildShareUrl(apiBase, cachedToken, bg)
        return renderDiagramBlock({
          src: url,
          alt: escapeHtml(firstLine(cleanSource)),
          source: cleanSource,
          theme,
          sourceFormat,
          mode: 'share',
        })
      }
      shareHint =
        `<div class="bd-note">Share mode is on for this page but the share URL for this diagram isn't cached yet. ` +
        `Run <code>Beauty Diagram: Toggle share mode for this page</code> twice (off then on) ` +
        `to re-pre-fetch tokens, then refresh the preview. Showing the watermarked render below.</div>\n`
    }

    const result = composeUrl({
      source: cleanSource,
      theme,
      sourceFormat,
      mode: 'anonymous',
      apiBase,
      bg,
    })

    if (result.kind === 'anonymous') {
      return shareHint + renderDiagramBlock({
        src: result.url,
        alt: escapeHtml(firstLine(cleanSource)),
        source: cleanSource,
        theme,
        sourceFormat,
        mode: 'anonymous',
      })
    }

    // over-size-cap — fall back to default renderer + show note
    const note = `<div class="bd-note">Diagram source exceeds ${Math.round(ANON_SOURCE_BYTE_CAP / 1024)} KB. Enable share mode for this page (<code>Beauty Diagram: Toggle share mode</code>) or run <code>Beauty Diagram: Inject embed URLs</code> to produce a saved share URL.</div>\n`
    const fallback = defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
    return shareHint + fallback + note
  }
}
